// Wires a real store to the sync engine: Shopify client from the store's credentials,
// the configured LLM engine, the Supabase database, and a translation_jobs row around
// the run. Used by both the panel's server action and scripts/sync-products.ts.

import { ShopifyClient, ShopifyGraphQLError } from "../shopify/client";
import { SHOP_LOCALES, TRANSLATABLE_RESOURCES_SYNC, TRANSLATIONS_REGISTER } from "../shopify/operations";
import { TokenProvider } from "../shopify/token";
import { credentialsFor } from "../stores/repository";
import type { StoreRecord } from "../stores/types";
import { createJob, finishJob, SupabaseSyncDb } from "./db";
import { engineFromEnv } from "./factory";
import { syncStore, type SyncResourceNode, type SyncShopify, type SyncSummary } from "./sync";

export function makeSyncShopify(client: ShopifyClient): SyncShopify {
  return {
    async shopLocales() {
      const { shopLocales } = await client.request<{ shopLocales: { locale: string; primary: boolean; published: boolean }[] }>(SHOP_LOCALES);
      return shopLocales;
    },
    async listPage(resourceType, locale, after) {
      const { translatableResources } = await client.request<{
        translatableResources: { nodes: SyncResourceNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
      }>(TRANSLATABLE_RESOURCES_SYNC, { resourceType, locale, first: 50, after });
      return {
        nodes: translatableResources.nodes,
        hasNextPage: translatableResources.pageInfo.hasNextPage,
        endCursor: translatableResources.pageInfo.endCursor,
      };
    },
    async register(resourceId, translations) {
      const { translationsRegister } = await client.request<{
        translationsRegister: { userErrors: { message: string; code: string | null }[] };
      }>(TRANSLATIONS_REGISTER, { resourceId, translations });
      if (translationsRegister.userErrors.length) {
        throw new ShopifyGraphQLError(translationsRegister.userErrors.map((e) => `${e.code ?? ""} ${e.message}`.trim()).join("; "));
      }
    },
  };
}

export interface RunSyncOptions {
  dryRun: boolean;
  resourceType?: string;
  locales?: string[];
  maxResources?: number;
  triggeredBy: string;
  log?: (line: string) => void;
}

export async function runStoreSync(store: StoreRecord, options: RunSyncOptions): Promise<{ jobId: number; summary: SyncSummary }> {
  const client = new ShopifyClient(new TokenProvider(credentialsFor(store)));
  // Product pages carry health claims — they get the stronger model tier.
  const engine = engineFromEnv((options.resourceType ?? "PRODUCT") === "PRODUCT" ? "product" : "bulk");
  const db = new SupabaseSyncDb();

  const jobId = await createJob(store.id, {
    dryRun: options.dryRun,
    params: { resourceType: options.resourceType ?? "PRODUCT", locales: options.locales, maxResources: options.maxResources },
    triggeredBy: options.triggeredBy,
  });

  try {
    const summary = await syncStore(
      { shopify: makeSyncShopify(client), engine, db, store: { id: store.id, name: store.name, writesEnabled: store.writesEnabled } },
      {
        jobId,
        write: !options.dryRun,
        resourceType: options.resourceType,
        locales: options.locales,
        maxResources: options.maxResources,
        log: options.log,
      },
    );
    await finishJob(jobId, "completed", null);
    return { jobId, summary };
  } catch (err) {
    await finishJob(jobId, "failed", err instanceof Error ? err.message : String(err)).catch(() => {});
    throw err;
  }
}
