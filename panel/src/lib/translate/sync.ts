// Store sync: walk every translatable resource of a type, translate what is missing or
// outdated into each target locale, and (in write mode) register it back to Shopify.
//
// Shopify and the database are ports so tests can run the whole flow with fakes.
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

// --- Database port ----------------------------------------------------------

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
  upsertResource(storeId: string, shopifyId: string, resourceType: string, label: string | null): Promise<number>;
  upsertContent(
    resourceId: number,
    content: { key: string; shopifyType: string; kind: ContentKind; sourceLocale: string; value: string; digest: string | null },
  ): Promise<number>;
  getTranslation(contentId: number, locale: string): Promise<TranslationRow | null>;
  saveTranslation(contentId: number, locale: string, patch: SaveTranslationPatch): Promise<number>;
  backup(translationId: number, previousValue: string | null, jobId: number): Promise<void>;
  addJobItem(jobId: number, translationId: number | null, status: string, reason: string | null): Promise<void>;
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
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}

interface QueuedField {
  resourceId: string;
  dbResourceId: number;
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
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  };

  for (const locale of targets) {
    log(`→ ${locale}`);
    const queue: QueuedField[] = [];
    let after: string | null = null;
    let seen = 0;

    paging: for (;;) {
      const page = await shopify.listPage(resourceType, locale, after);
      for (const node of page.nodes) {
        if (options.maxResources !== undefined && seen >= options.maxResources) break paging;
        seen++;
        const label =
          node.translatableContent.find((c) => c.key === "title")?.value ??
          node.translatableContent.find((c) => c.value)?.value?.slice(0, 80) ??
          null;
        const dbResourceId = await db.upsertResource(store.id, node.resourceId, resourceType, label);
        const states = new Map(node.translations.map((t) => [t.key, t]));

        for (const content of node.translatableContent) {
          const kind = contentKind(content.type);
          if (!kind || !content.value || !content.digest) continue; // unsupported or empty source
          summary.scanned++;
          const contentId = await db.upsertContent(dbResourceId, {
            key: content.key,
            shopifyType: content.type,
            kind,
            sourceLocale: content.locale,
            value: content.value,
            digest: content.digest,
          });

          const row = await db.getTranslation(contentId, locale);
          if (row?.status === "locked") {
            summary.skippedLocked++;
            await db.addJobItem(options.jobId, row.id, "skipped", "locked");
            continue;
          }

          const state = states.get(content.key);
          const needs = !state?.value || state.outdated;
          if (!needs) {
            // Mirror Shopify's current translation so coverage counts are real.
            if (!row || row.status !== "current" || row.value !== state.value) {
              await db.saveTranslation(contentId, locale, { value: state.value, status: "current", origin: row ? undefined : "imported", sourceDigest: content.digest });
            }
            continue;
          }

          // The store's state for this exact source version was adopted as the baseline:
          // leave it alone until the source text changes (new digest).
          if (row?.status === "current" && row.sourceDigest !== null && row.sourceDigest === content.digest) continue;

          if (options.adopt) {
            const id = await db.saveTranslation(contentId, locale, { value: state?.value ?? null, status: "current", origin: "imported", sourceDigest: content.digest });
            await db.addJobItem(options.jobId, id, "adopted", null);
            summary.adopted++;
            continue;
          }

          queue.push({
            resourceId: node.resourceId,
            dbResourceId,
            contentId,
            key: content.key,
            kind,
            text: content.value,
            digest: content.digest,
            previousValue: state?.value ?? null,
          });
        }
      }
      if (!page.hasNextPage || page.endCursor === null) break;
      after = page.endCursor;
    }

    summary.queued += queue.length;
    await db.bumpJob(options.jobId, { scanned: queue.length });
    log(`  ${seen} resources, ${queue.length} fields to translate`);

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
        for (const q of chunk) {
          const id = await db.saveTranslation(q.contentId, locale, { status: "failed", failureReason: reason, sourceDigest: q.digest });
          await db.addJobItem(options.jobId, id, "failed", reason);
        }
        summary.failed += chunk.length;
        await db.bumpJob(options.jobId, { failed: chunk.length });
        log(`  ✗ batch of ${chunk.length}: ${reason}`);
        continue;
      }

      summary.usage.inputTokens += outcome.usage.inputTokens;
      summary.usage.outputTokens += outcome.usage.outputTokens;
      summary.usage.costUsd += outcome.usage.costUsd;

      const accepted: (QueuedField & { value: string })[] = [];
      for (const item of outcome.items) {
        const q = chunk.find((c) => `${c.contentId}` === item.id)!;
        if (item.ok) {
          accepted.push({ ...q, value: item.value });
        } else {
          const reason = item.issues.map((i) => `${i.code}: ${i.message}`).join("; ");
          const id = await db.saveTranslation(q.contentId, locale, { status: "failed", failureReason: reason, sourceDigest: q.digest });
          await db.addJobItem(options.jobId, id, "failed", reason);
          summary.failed++;
        }
      }
      summary.translated += accepted.length;
      await db.bumpJob(options.jobId, {
        translated: accepted.length,
        failed: outcome.items.length - accepted.length,
        usage: outcome.usage,
      });

      if (!write) {
        for (const a of accepted) {
          await db.saveTranslation(a.contentId, locale, { value: a.value, status: "pending_review", origin: "ai", model: outcome.usage.model, sourceDigest: a.digest });
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
        const ids = new Map<number, number>(); // contentId → translationId
        for (const a of group) {
          const id = await db.saveTranslation(a.contentId, locale, { status: "outdated", value: a.previousValue, sourceDigest: a.digest });
          ids.set(a.contentId, id);
          await db.backup(id, a.previousValue, options.jobId);
        }
        try {
          await shopify.register(
            resourceId,
            group.map((a) => ({ key: a.key, locale, value: a.value, translatableContentDigest: a.digest })),
          );
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          for (const a of group) {
            const id = ids.get(a.contentId)!;
            await db.saveTranslation(a.contentId, locale, { status: "failed", failureReason: `translationsRegister: ${reason}`, sourceDigest: a.digest });
            await db.addJobItem(options.jobId, id, "failed", `translationsRegister: ${reason}`);
          }
          summary.failed += group.length;
          summary.translated -= group.length;
          await db.bumpJob(options.jobId, { failed: group.length, translated: -group.length });
          log(`  ✗ register ${resourceId}: ${reason}`);
          continue;
        }
        for (const a of group) {
          const id = ids.get(a.contentId)!;
          await db.saveTranslation(a.contentId, locale, {
            value: a.value,
            status: "current",
            origin: "ai",
            model: outcome.usage.model,
            sourceDigest: a.digest,
            writtenAt: new Date().toISOString(),
          });
          await db.addJobItem(options.jobId, id, "written", null);
          summary.written++;
        }
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
