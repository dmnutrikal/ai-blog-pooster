// Supabase implementation of the sync database port, plus the job/coverage reads the
// panel's Преводи page uses. All tables come from supabase/migrations/20261120090000_shared_panel.sql.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import type { Usage } from "./engine";
import type { SaveTranslationPatch, SyncDb, TranslationRow } from "./sync";

function fail(where: string, error: { message: string } | null): never {
  throw new Error(`${where}: ${error?.message ?? "unknown Supabase error"}`);
}

export class SupabaseSyncDb implements SyncDb {
  constructor(private readonly db: () => SupabaseClient = supabase) {}

  async upsertResource(storeId: string, shopifyId: string, resourceType: string, label: string | null): Promise<number> {
    const { data, error } = await this.db()
      .from("translation_resources")
      .upsert(
        { store_id: storeId, shopify_id: shopifyId, resource_type: resourceType, label, last_seen_at: new Date().toISOString(), deleted_at: null },
        { onConflict: "store_id,shopify_id" },
      )
      .select("id")
      .single();
    if (error || !data) fail("translation_resources upsert", error);
    return data.id as number;
  }

  async upsertContent(
    resourceId: number,
    content: { key: string; shopifyType: string; kind: string; sourceLocale: string; value: string; digest: string | null },
  ): Promise<number> {
    const { data, error } = await this.db()
      .from("translation_contents")
      .upsert(
        {
          resource_id: resourceId,
          key: content.key,
          shopify_type: content.shopifyType,
          kind: content.kind,
          source_locale: content.sourceLocale,
          value: content.value,
          digest: content.digest,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "resource_id,key" },
      )
      .select("id")
      .single();
    if (error || !data) fail("translation_contents upsert", error);
    return data.id as number;
  }

  async getTranslation(contentId: number, locale: string): Promise<TranslationRow | null> {
    const { data, error } = await this.db()
      .from("translations")
      .select("id, status, value, source_digest")
      .eq("content_id", contentId)
      .eq("locale", locale)
      .is("market_id", null)
      .maybeSingle();
    if (error) fail("translations select", error);
    if (!data) return null;
    return { id: data.id, status: data.status, value: data.value, sourceDigest: data.source_digest };
  }

  async saveTranslation(contentId: number, locale: string, patch: SaveTranslationPatch): Promise<number> {
    const row: Record<string, unknown> = {
      status: patch.status,
      updated_at: new Date().toISOString(),
    };
    if ("value" in patch) row.value = patch.value;
    if (patch.origin) row.origin = patch.origin;
    if (patch.model) row.model = patch.model;
    if (patch.sourceDigest !== undefined) row.source_digest = patch.sourceDigest;
    row.failure_reason = patch.failureReason ?? null;
    if (patch.writtenAt !== undefined) row.written_at = patch.writtenAt;

    const existing = await this.getTranslation(contentId, locale);
    if (existing) {
      const { error } = await this.db().from("translations").update(row).eq("id", existing.id);
      if (error) fail("translations update", error);
      return existing.id;
    }
    const { data, error } = await this.db()
      .from("translations")
      .insert({ content_id: contentId, locale, market_id: null, ...row })
      .select("id")
      .single();
    if (error || !data) fail("translations insert", error);
    return data.id as number;
  }

  async backup(translationId: number, previousValue: string | null, jobId: number): Promise<void> {
    const { error } = await this.db().from("translation_backups").insert({ translation_id: translationId, previous_value: previousValue, job_id: jobId });
    if (error) fail("translation_backups insert", error);
  }

  async addJobItem(jobId: number, translationId: number | null, status: string, reason: string | null): Promise<void> {
    const { error } = await this.db().from("translation_job_items").insert({ job_id: jobId, translation_id: translationId, status, reason });
    if (error) fail("translation_job_items insert", error);
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
  params: { resourceType?: string; locales?: string[]; maxResources?: number; adopt?: boolean };
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

export async function coverage(storeId: string, db: SupabaseClient = supabase()): Promise<Coverage> {
  const { data, error } = await db
    .from("translations")
    .select("locale, status, translation_contents!inner(translation_resources!inner(store_id))")
    .eq("translation_contents.translation_resources.store_id", storeId);
  if (error) fail("translations coverage", error);
  const result: Coverage = new Map();
  for (const row of data ?? []) {
    const byStatus = result.get(row.locale) ?? { missing: 0, current: 0, outdated: 0, locked: 0, pending_review: 0, failed: 0 };
    byStatus[row.status as TranslationRow["status"]]++;
    result.set(row.locale, byStatus);
  }
  return result;
}
