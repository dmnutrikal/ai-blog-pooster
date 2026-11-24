// Store sync: walk every translatable resource of a type, translate what is missing or
// outdated into each target locale, and (in write mode) register it back to Shopify.
//
// Shopify and the database are ports so tests can run the whole flow with fakes. The
// database port is batch-first: a store the size of a blog archive produces tens of
// thousands of rows, and one round-trip per row made the first adopt run crawl.
//
// Rules enforced here, not left to callers: a `locked` translation is never touched,
// a failed validation is recorded and never written, every write backs up the previous
// value first, and writes require the store's writesEnabled on top of { write: true }.

import type { TranslationEngine, Usage } from "./engine";
import { contentKind, translateBatch, type SourceItem } from "./pipeline";
import type { ContentKind } from "./validate";

// --- Shopify port -----------------------------------------------------------

export interface SyncContent {
  key: string;
  value: string | null;
  digest: string | null;
  locale: string;
  type: string;
}

export interface SyncTranslationState {
  key: string;
  value: string | null;
  outdated: boolean;
}

export interface SyncResourceNode {
  resourceId: string;
  translatableContent: SyncContent[];
  translations: SyncTranslationState[];
}

export interface SyncShopify {
  shopLocales(): Promise<{ locale: string; primary: boolean; published: boolean }[]>;
  listPage(
    resourceType: string,
    locale: string,
    after: string | null,
  ): Promise<{ nodes: SyncResourceNode[]; hasNextPage: boolean; endCursor: string | null }>;
  register(resourceId: string, translations: { key: string; locale: string; value: string; translatableContentDigest: string }[]): Promise<void>;
}

// --- Database port (batch-first) --------------------------------------------

export interface TranslationRow {
  id: number;
  status: "missing" | "current" | "outdated" | "locked" | "pending_review" | "failed";
  value: string | null;
  sourceDigest: string | null;
}

export interface SaveTranslationPatch {
  value?: string | null;
  status: TranslationRow["status"];
  origin?: "imported" | "ai";
  model?: string;
  sourceDigest?: string | null;
  failureReason?: string | null;
  writtenAt?: string | null;
}

export interface SyncDb {
  // Returns shopifyId → database id.
  upsertResources(storeId: string, resources: { shopifyId: string; resourceType: string; label: string | null }[]): Promise<Map<string, number>>;
  // Returns `${resourceId}:${key}` → database id.
  upsertContents(
    rows: { resourceId: number; key: string; shopifyType: string; kind: ContentKind; sourceLocale: string; value: string; digest: string | null }[],
  ): Promise<Map<string, number>>;
  getTranslations(contentIds: number[], locale: string): Promise<Map<number, TranslationRow>>;
  // Every row in one call must carry the same patch fields. Returns contentId → translation id.
  saveTranslations(locale: string, rows: { contentId: number; patch: SaveTranslationPatch }[]): Promise<Map<number, number>>;
  addBackups(rows: { translationId: number; previousValue: string | null; jobId: number }[]): Promise<void>;
  addJobItems(jobId: number, items: { translationId: number | null; status: string; reason: string | null }[]): Promise<void>;
  bumpJob(jobId: number, delta: { scanned?: number; translated?: number; failed?: number; usage?: Usage }): Promise<void>;
  glossary(storeId: string): Promise<{ neverTranslate: string[]; translateAs: Map<string, { source: string; target: string }[]> }>;
}

// --- Sync -------------------------------------------------------------------

export interface SyncOptions {
  resourceType?: string; // TranslatableResourceType, default PRODUCT
  locales?: string[]; // default: every published non-primary locale
  write?: boolean;
  // Adopt mode: instead of translating, mark the store's current state (including fields
  // Shopify reports as missing or outdated) as the accepted baseline. Later runs then only
  // pick up source text that changed after this point. Writes nothing to Shopify.
  adopt?: boolean;
  maxResources?: number; // per locale, for careful first runs
  batchItems?: number;
  batchChars?: number;
  jobId: number;
  log?: (line: string) => void;
}

export interface SyncSummary {
  locales: string[];
  scanned: number; // fields considered
  queued: number; // fields sent to the engine
  translated: number; // fields with an accepted translation
  written: number; // fields registered to Shopify
  failed: number; // fields rejected by validation or the engine
  skippedLocked: number;
  adopted: number; // fields accepted as-is as the baseline (adopt mode)
  unsupported: number; // non-empty fields of content types we cannot translate safely yet
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}

interface QueuedField {
  resourceId: string;
  contentId: number;
  key: string;
  kind: ContentKind;
  text: string;
  digest: string;
  previousValue: string | null; // what the locale shows now (Shopify state)
}

export async function syncStore(
  deps: {
    shopify: SyncShopify;
    engine: TranslationEngine;
    db: SyncDb;
    store: { id: string; name: string; writesEnabled: boolean };
  },
  options: SyncOptions,
): Promise<SyncSummary> {
  const { shopify, engine, db, store } = deps;
  const log = options.log ?? (() => {});
  const resourceType = options.resourceType ?? "PRODUCT";
  const write = options.write ?? false;
  const batchItems = options.batchItems ?? 15;
  const batchChars = options.batchChars ?? 6000;

  if (write && !store.writesEnabled) {
    throw new Error(`Writes are off for ${store.name}: turn on "Разреши запис" on its page in the panel first.`);
  }

  const shopLocales = await shopify.shopLocales();
  const primary = shopLocales.find((l) => l.primary);
  if (!primary) throw new Error("Shop has no primary locale");
  let targets = shopLocales.filter((l) => !l.primary && l.published).map((l) => l.locale);
  if (options.locales?.length) {
    const wanted = new Set(options.locales);
    const unknown = [...wanted].filter((l) => !targets.includes(l));
    if (unknown.length) throw new Error(`Locale(s) not enabled on the store: ${unknown.join(", ")}`);
    targets = targets.filter((l) => wanted.has(l));
  }

  const { neverTranslate, translateAs } = await db.glossary(store.id);
  const summary: SyncSummary = {
    locales: targets,
    scanned: 0,
    queued: 0,
    translated: 0,
    written: 0,
    failed: 0,
    skippedLocked: 0,
    adopted: 0,
    unsupported: 0,
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  };

  for (const locale of targets) {
    const queue: QueuedField[] = [];
    let after: string | null = null;
    let seen = 0;
    let adoptedHere = 0;

    for (;;) {
      const page = await shopify.listPage(resourceType, locale, after);
      let nodes = page.nodes;
      if (options.maxResources !== undefined) nodes = nodes.slice(0, options.maxResources - seen);
      seen += nodes.length;

      const resourceIds = await db.upsertResources(
        store.id,
        nodes.map((node) => ({
          shopifyId: node.resourceId,
          resourceType,
          label:
            node.translatableContent.find((c) => c.key === "title")?.value ??
            node.translatableContent.find((c) => c.value)?.value?.slice(0, 80) ??
            null,
        })),
      );

      // Supported, non-empty fields of this page, in one flat list.
      const entries: { node: SyncResourceNode; content: SyncContent & { value: string }; kind: ContentKind; dbResourceId: number }[] = [];
      for (const node of nodes) {
        const dbResourceId = resourceIds.get(node.resourceId)!;
        for (const content of node.translatableContent) {
          const kind = contentKind(content.type);
          if (!kind && content.value) summary.unsupported++;
          if (!kind || !content.value || !content.digest) continue; // unsupported or empty source
          summary.scanned++;
          entries.push({ node, content: { ...content, value: content.value }, kind, dbResourceId });
        }
      }

      const contentIds = await db.upsertContents(
        entries.map((e) => ({
          resourceId: e.dbResourceId,
          key: e.content.key,
          shopifyType: e.content.type,
          kind: e.kind,
          sourceLocale: e.content.locale,
          value: e.content.value,
          digest: e.content.digest,
        })),
      );
      const rows = await db.getTranslations([...contentIds.values()], locale);

      const mirrors: { contentId: number; patch: SaveTranslationPatch }[] = [];
      const adopts: { contentId: number; patch: SaveTranslationPatch }[] = [];
      const lockedItems: { translationId: number | null; status: string; reason: string | null }[] = [];

      for (const e of entries) {
        const contentId = contentIds.get(`${e.dbResourceId}:${e.content.key}`)!;
        const row = rows.get(contentId);
        const state = e.node.translations.find((t) => t.key === e.content.key);

        if (row?.status === "locked") {
          summary.skippedLocked++;
          lockedItems.push({ translationId: row.id, status: "skipped", reason: "locked" });
          continue;
        }

        const needs = !state?.value || state.outdated;
        if (!needs) {
          // Mirror Shopify's current translation so coverage counts are real.
          if (!row || row.status !== "current" || row.value !== state.value) {
            mirrors.push({ contentId, patch: { value: state.value, status: "current", origin: "imported", sourceDigest: e.content.digest } });
          }
          continue;
        }

        // The store's state for this exact source version was adopted as the baseline:
        // leave it alone until the source text changes (new digest).
        if (row?.status === "current" && row.sourceDigest !== null && row.sourceDigest === e.content.digest) continue;

        // URL-kind fields (handles, file references) are never rewritten, and Shopify
        // rejects registering a handle identical to the source — record the source value
        // as the baseline instead of queueing them.
        if (e.kind === "url") {
          mirrors.push({ contentId, patch: { value: state?.value ?? e.content.value, status: "current", origin: "imported", sourceDigest: e.content.digest } });
          continue;
        }

        if (options.adopt) {
          adopts.push({ contentId, patch: { value: state?.value ?? null, status: "current", origin: "imported", sourceDigest: e.content.digest } });
          continue;
        }

        queue.push({
          resourceId: e.node.resourceId,
          contentId,
          key: e.content.key,
          kind: e.kind,
          text: e.content.value,
          digest: e.content.digest!,
          previousValue: state?.value ?? null,
        });
      }

      if (mirrors.length) await db.saveTranslations(locale, mirrors);
      if (adopts.length) {
        const ids = await db.saveTranslations(locale, adopts);
        await db.addJobItems(options.jobId, adopts.map((a) => ({ translationId: ids.get(a.contentId) ?? null, status: "adopted", reason: null })));
        summary.adopted += adopts.length;
        adoptedHere += adopts.length;
      }
      if (lockedItems.length) await db.addJobItems(options.jobId, lockedItems);

      const reachedMax = options.maxResources !== undefined && seen >= options.maxResources;
      if (!page.hasNextPage || page.endCursor === null || reachedMax) break;
      after = page.endCursor;
    }

    summary.queued += queue.length;
    await db.bumpJob(options.jobId, { scanned: queue.length, translated: adoptedHere });
    log(`→ ${locale}: ${seen} resources, ${queue.length} fields to translate${adoptedHere ? `, ${adoptedHere} adopted` : ""}`);

    for (const chunk of chunkQueue(queue, batchItems, batchChars)) {
      const items: SourceItem[] = chunk.map((q) => ({ id: `${q.contentId}`, text: q.text, kind: q.kind, field: q.key }));
      let outcome;
      try {
        outcome = await translateBatch(engine, items, {
          sourceLocale: primary.locale,
          targetLocale: locale,
          neverTranslate,
          translateAs: translateAs.get(locale) ?? [],
          storeContext: `Shopify store "${store.name}"`,
        });
      } catch (err) {
        // The whole batch failed (engine error): record every field and move on.
        const reason = err instanceof Error ? err.message : String(err);
        const ids = await db.saveTranslations(locale, chunk.map((q) => ({ contentId: q.contentId, patch: { status: "failed" as const, failureReason: reason, sourceDigest: q.digest } })));
        await db.addJobItems(options.jobId, chunk.map((q) => ({ translationId: ids.get(q.contentId) ?? null, status: "failed", reason })));
        summary.failed += chunk.length;
        await db.bumpJob(options.jobId, { failed: chunk.length });
        log(`  ✗ batch of ${chunk.length}: ${reason}`);
        continue;
      }

      summary.usage.inputTokens += outcome.usage.inputTokens;
      summary.usage.outputTokens += outcome.usage.outputTokens;
      summary.usage.costUsd += outcome.usage.costUsd;

      const accepted: (QueuedField & { value: string })[] = [];
      const rejected: { field: QueuedField; reason: string }[] = [];
      for (const item of outcome.items) {
        const q = chunk.find((c) => `${c.contentId}` === item.id)!;
        if (item.ok) accepted.push({ ...q, value: item.value });
        else rejected.push({ field: q, reason: item.issues.map((i) => `${i.code}: ${i.message}`).join("; ") });
      }
      if (rejected.length) {
        const ids = await db.saveTranslations(
          locale,
          // One call per distinct reason keeps the patch fields uniform.
          rejected.map((r) => ({ contentId: r.field.contentId, patch: { status: "failed" as const, failureReason: r.reason, sourceDigest: r.field.digest } })),
        );
        await db.addJobItems(options.jobId, rejected.map((r) => ({ translationId: ids.get(r.field.contentId) ?? null, status: "failed", reason: r.reason })));
        summary.failed += rejected.length;
      }
      summary.translated += accepted.length;
      await db.bumpJob(options.jobId, { translated: accepted.length, failed: rejected.length, usage: outcome.usage });

      if (!write) {
        if (accepted.length) {
          await db.saveTranslations(
            locale,
            accepted.map((a) => ({ contentId: a.contentId, patch: { value: a.value, status: "pending_review" as const, origin: "ai" as const, model: outcome.usage.model, sourceDigest: a.digest } })),
          );
        }
        continue;
      }

      // Write mode: back up the previous value, register per resource, then mark current.
      const byResource = new Map<string, (QueuedField & { value: string })[]>();
      for (const a of accepted) {
        const group = byResource.get(a.resourceId) ?? [];
        group.push(a);
        byResource.set(a.resourceId, group);
      }
      for (const [resourceId, group] of byResource) {
        const ids = await db.saveTranslations(
          locale,
          group.map((a) => ({ contentId: a.contentId, patch: { status: "outdated" as const, value: a.previousValue, sourceDigest: a.digest } })),
        );
        await db.addBackups(group.map((a) => ({ translationId: ids.get(a.contentId)!, previousValue: a.previousValue, jobId: options.jobId })));
        try {
          await shopify.register(
            resourceId,
            group.map((a) => ({ key: a.key, locale, value: a.value, translatableContentDigest: a.digest })),
          );
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await db.saveTranslations(
            locale,
            group.map((a) => ({ contentId: a.contentId, patch: { status: "failed" as const, failureReason: `translationsRegister: ${reason}`, sourceDigest: a.digest } })),
          );
          await db.addJobItems(options.jobId, group.map((a) => ({ translationId: ids.get(a.contentId) ?? null, status: "failed", reason: `translationsRegister: ${reason}` })));
          summary.failed += group.length;
          summary.translated -= group.length;
          await db.bumpJob(options.jobId, { failed: group.length, translated: -group.length });
          log(`  ✗ register ${resourceId}: ${reason}`);
          continue;
        }
        await db.saveTranslations(
          locale,
          group.map((a) => ({
            contentId: a.contentId,
            patch: {
              value: a.value,
              status: "current" as const,
              origin: "ai" as const,
              model: outcome.usage.model,
              sourceDigest: a.digest,
              writtenAt: new Date().toISOString(),
            },
          })),
        );
        await db.addJobItems(options.jobId, group.map((a) => ({ translationId: ids.get(a.contentId) ?? null, status: "written", reason: null })));
        summary.written += group.length;
      }
    }
  }

  return summary;
}

export function chunkQueue<T extends { text: string }>(queue: T[], maxItems: number, maxChars: number): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let chars = 0;
  for (const item of queue) {
    if (current.length && (current.length >= maxItems || chars + item.text.length > maxChars)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += item.text.length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
