// Supabase implementation of the sync database port, plus the job/coverage reads the
// panel's Преводи page uses. All tables come from supabase/migrations/20261120090000_shared_panel.sql.
// Everything batch-heavy goes through bulk inserts/upserts — one round-trip per row made
// large stores (175 blog articles × 19 locales) unworkably slow.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import type { Usage } from "./engine";
import type { SaveTranslationPatch, SyncDb, TranslationRow } from "./sync";

const CHUNK = 500;

function chunked<T>(items: T[], size: number = CHUNK): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}

function fail(where: string, error: { message: string } | null): never {
  throw new Error(`${where}: ${error?.message ?? "unknown Supabase error"}`);
}

export class SupabaseSyncDb implements SyncDb {
  constructor(private readonly db: () => SupabaseClient = supabase) {}

  async upsertResources(storeId: string, resources: { shopifyId: string; resourceType: string; label: string | null }[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const now = new Date().toISOString();
    for (const part of chunked(resources)) {
      if (!part.length) continue;
      const { data, error } = await this.db()
        .from("translation_resources")
        .upsert(
          part.map((r) => ({ store_id: storeId, shopify_id: r.shopifyId, resource_type: r.resourceType, label: r.label, last_seen_at: now, deleted_at: null })),
          { onConflict: "store_id,shopify_id" },
        )
        .select("id, shopify_id");
      if (error || !data) fail("translation_resources upsert", error);
      for (const row of data) result.set(row.shopify_id as string, row.id as number);
    }
    return result;
  }

  async upsertContents(
    rows: { resourceId: number; key: string; shopifyType: string; kind: string; sourceLocale: string; value: string; digest: string | null }[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const now = new Date().toISOString();
    for (const part of chunked(rows)) {
      if (!part.length) continue;
      const { data, error } = await this.db()
        .from("translation_contents")
        .upsert(
          part.map((c) => ({
            resource_id: c.resourceId,
            key: c.key,
            shopify_type: c.shopifyType,
            kind: c.kind,
            source_locale: c.sourceLocale,
            value: c.value,
            digest: c.digest,
            updated_at: now,
          })),
          { onConflict: "resource_id,key" },
        )
        .select("id, resource_id, key");
      if (error || !data) fail("translation_contents upsert", error);
      for (const row of data) result.set(`${row.resource_id}:${row.key}`, row.id as number);
    }
    return result;
  }

  async getTranslations(contentIds: number[], locale: string): Promise<Map<number, TranslationRow>> {
    const result = new Map<number, TranslationRow>();
    for (const part of chunked(contentIds)) {
      if (!part.length) continue;
      const { data, error } = await this.db()
        .from("translations")
        .select("id, content_id, status, value, source_digest")
        .in("content_id", part)
        .eq("locale", locale)
        .is("market_id", null);
      if (error) fail("translations select", error);
      for (const row of data ?? []) {
        result.set(row.content_id as number, { id: row.id, status: row.status, value: row.value, sourceDigest: row.source_digest });
      }
    }
    return result;
  }

  async saveTranslations(locale: string, rows: { contentId: number; patch: SaveTranslationPatch }[]): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    if (!rows.length) return result;
    const existing = await this.getTranslations(rows.map((r) => r.contentId), locale);
    const now = new Date().toISOString();

    const toRow = ({ contentId, patch }: { contentId: number; patch: SaveTranslationPatch }, id?: number): Record<string, unknown> => {
      const row: Record<string, unknown> = {
        content_id: contentId,
        locale,
        market_id: null,
        status: patch.status,
        failure_reason: patch.failureReason ?? null,
        updated_at: now,
      };
      if ("value" in patch) row.value = patch.value;
      if (patch.origin) row.origin = patch.origin;
      if (patch.model) row.model = patch.model;
      if (patch.sourceDigest !== undefined) row.source_digest = patch.sourceDigest;
      if (patch.writtenAt !== undefined) row.written_at = patch.writtenAt;
      if (id !== undefined) row.id = id;
      return row;
    };

    const updates: Record<string, unknown>[] = [];
    const inserts: Record<string, unknown>[] = [];
    for (const r of rows) {
      const ex = existing.get(r.contentId);
      if (ex) updates.push(toRow(r, ex.id));
      else inserts.push(toRow(r));
    }

    for (const part of chunked(updates)) {
      if (!part.length) continue;
      const { data, error } = await this.db().from("translations").upsert(part, { onConflict: "id" }).select("id, content_id");
      if (error || !data) fail("translations bulk update", error);
      for (const row of data) result.set(row.content_id as number, row.id as number);
    }
    for (const part of chunked(inserts)) {
      if (!part.length) continue;
      const { data, error } = await this.db().from("translations").insert(part).select("id, content_id");
      if (error || !data) fail("translations bulk insert", error);
      for (const row of data) result.set(row.content_id as number, row.id as number);
    }
    return result;
  }

  async addBackups(rows: { translationId: number; previousValue: string | null; jobId: number }[]): Promise<void> {
    for (const part of chunked(rows)) {
      if (!part.length) continue;
      const { error } = await this.db()
        .from("translation_backups")
        .insert(part.map((b) => ({ translation_id: b.translationId, previous_value: b.previousValue, job_id: b.jobId })));
      if (error) fail("translation_backups insert", error);
    }
  }

  async addJobItems(jobId: number, items: { translationId: number | null; status: string; reason: string | null }[]): Promise<void> {
    for (const part of chunked(items)) {
      if (!part.length) continue;
      const { error } = await this.db()
        .from("translation_job_items")
        .insert(part.map((i) => ({ job_id: jobId, translation_id: i.translationId, status: i.status, reason: i.reason })));
      if (error) fail("translation_job_items insert", error);
    }
  }

  async bumpJob(jobId: number, delta: { scanned?: number; translated?: number; failed?: number; usage?: Usage }): Promise<void> {
    const { data, error } = await this.db()
      .from("translation_jobs")
      .select("scanned, translated, failed, input_tokens, output_tokens, cost_usd")
      .eq("id", jobId)
      .single();
    if (error || !data) fail("translation_jobs select", error);
    const { error: updateError } = await this.db()
      .from("translation_jobs")
      .update({
        scanned: data.scanned + (delta.scanned ?? 0),
        translated: data.translated + (delta.translated ?? 0),
        failed: data.failed + (delta.failed ?? 0),
        input_tokens: data.input_tokens + (delta.usage?.inputTokens ?? 0),
        output_tokens: data.output_tokens + (delta.usage?.outputTokens ?? 0),
        cost_usd: Number(data.cost_usd) + (delta.usage?.costUsd ?? 0),
      })
      .eq("id", jobId);
    if (updateError) fail("translation_jobs update", updateError);
  }

  async glossary(storeId: string): Promise<{ neverTranslate: string[]; translateAs: Map<string, { source: string; target: string }[]> }> {
    const { data, error } = await this.db()
      .from("glossary_terms")
      .select("rule, source, locale, target, store_id")
      .or(`store_id.eq.${storeId},store_id.is.null`);
    if (error) fail("glossary_terms select", error);
    const neverTranslate = new Set((process.env.NEVER_TRANSLATE ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    const translateAs = new Map<string, { source: string; target: string }[]>();
    for (const term of data ?? []) {
      if (term.rule === "never_translate") neverTranslate.add(term.source);
      else if (term.rule === "translate_as" && term.locale && term.target) {
        const list = translateAs.get(term.locale) ?? [];
        list.push({ source: term.source, target: term.target });
        translateAs.set(term.locale, list);
      }
    }
    return { neverTranslate: [...neverTranslate], translateAs };
  }
}

// --- Job lifecycle + reads for the panel ------------------------------------

export interface TranslationJob {
  id: number;
  kind: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  dry_run: boolean;
  params: { types?: string[]; resourceType?: string; locales?: string[]; maxResources?: number; adopt?: boolean };
  scanned: number;
  translated: number;
  failed: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  error: string | null;
  triggered_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export async function createJob(
  storeId: string,
  options: { dryRun: boolean; params: TranslationJob["params"]; triggeredBy: string },
  db: SupabaseClient = supabase(),
): Promise<number> {
  const { data, error } = await db
    .from("translation_jobs")
    .insert({ store_id: storeId, kind: "translate", status: "running", dry_run: options.dryRun, params: options.params, triggered_by: options.triggeredBy, started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !data) fail("translation_jobs insert", error);
  return data.id as number;
}

export async function finishJob(jobId: number, status: "completed" | "failed", errorMessage: string | null, db: SupabaseClient = supabase()): Promise<void> {
  const { error } = await db
    .from("translation_jobs")
    .update({ status, error: errorMessage, finished_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) fail("translation_jobs finish", error);
}

export async function listJobs(storeId: string, limit = 10, db: SupabaseClient = supabase()): Promise<TranslationJob[]> {
  const { data, error } = await db
    .from("translation_jobs")
    .select("id, kind, status, dry_run, params, scanned, translated, failed, input_tokens, output_tokens, cost_usd, error, triggered_by, created_at, started_at, finished_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("translation_jobs list", error);
  return (data ?? []) as TranslationJob[];
}

export interface JobFailure {
  reason: string | null;
  status: string;
  locale: string | null;
  key: string | null;
  label: string | null;
}

export async function jobFailures(jobId: number, limit = 30, db: SupabaseClient = supabase()): Promise<JobFailure[]> {
  const { data, error } = await db
    .from("translation_job_items")
    .select("status, reason, translations(locale, translation_contents(key, translation_resources(label)))")
    .eq("job_id", jobId)
    .neq("status", "written")
    .neq("status", "adopted")
    .limit(limit);
  if (error) fail("translation_job_items select", error);
  return (data ?? []).map((item) => {
    const t = item.translations as unknown as { locale: string; translation_contents: { key: string; translation_resources: { label: string | null } } } | null;
    return {
      status: item.status,
      reason: item.reason,
      locale: t?.locale ?? null,
      key: t?.translation_contents?.key ?? null,
      label: t?.translation_contents?.translation_resources?.label ?? null,
    };
  });
}

export type Coverage = Map<string, Record<TranslationRow["status"], number>>;

// Aggregated in the database (translation_coverage function) — the raw table holds tens
// of thousands of rows per store, past PostgREST's 1000-row page.
export async function coverage(storeId: string, db: SupabaseClient = supabase()): Promise<Coverage> {
  const { data, error } = await db.rpc("translation_coverage", { p_store: storeId });
  if (error) fail("translation_coverage", error);
  const result: Coverage = new Map();
  for (const row of (data ?? []) as { locale: string; status: TranslationRow["status"]; cnt: number }[]) {
    const byStatus = result.get(row.locale) ?? { missing: 0, current: 0, outdated: 0, locked: 0, pending_review: 0, failed: 0 };
    byStatus[row.status] += Number(row.cnt);
    result.set(row.locale, byStatus);
  }
  return result;
}
