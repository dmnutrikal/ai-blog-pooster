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
import { ALL_SYNC_TYPES, tierForType } from "./resource-groups";
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
  adopt?: boolean; // accept the store's current state as the baseline; writes nothing
  types?: string[]; // TranslatableResourceType values; default: everything in SYNC_GROUPS
  locales?: string[];
  maxResources?: number; // per resource type and locale
  triggeredBy: string;
  log?: (line: string) => void;
}

export async function runStoreSync(store: StoreRecord, options: RunSyncOptions): Promise<{ jobId: number; summary: SyncSummary }> {
  const client = new ShopifyClient(new TokenProvider(credentialsFor(store)));
  const db = new SupabaseSyncDb();
  const types = options.types?.length ? options.types : ALL_SYNC_TYPES;

  const jobId = await createJob(store.id, {
    dryRun: options.dryRun,
    params: { types, locales: options.locales, maxResources: options.maxResources, adopt: options.adopt },
    triggeredBy: options.triggeredBy,
  });

  const total: SyncSummary = {
    locales: [],
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

  try {
    for (const resourceType of types) {
      options.log?.(`== ${resourceType} ==`);
      // Product pages carry health claims — they get the stronger model tier.
      const engine = engineFromEnv(tierForType(resourceType));
      const summary = await syncStore(
        { shopify: makeSyncShopify(client), engine, db, store: { id: store.id, name: store.name, writesEnabled: store.writesEnabled } },
        {
          jobId,
          write: !options.dryRun && !options.adopt,
          adopt: options.adopt,
          resourceType,
          locales: options.locales,
          maxResources: options.maxResources,
          log: options.log,
        },
      );
      total.locales = summary.locales;
      total.scanned += summary.scanned;
      total.queued += summary.queued;
      total.translated += summary.translated;
      total.written += summary.written;
      total.failed += summary.failed;
      total.skippedLocked += summary.skippedLocked;
      total.adopted += summary.adopted;
      total.unsupported += summary.unsupported;
      total.usage.inputTokens += summary.usage.inputTokens;
      total.usage.outputTokens += summary.usage.outputTokens;
      total.usage.costUsd += summary.usage.costUsd;
    }
    await finishJob(jobId, "completed", null);
    return { jobId, summary: total };
  } catch (err) {
    await finishJob(jobId, "failed", err instanceof Error ? err.message : String(err)).catch(() => {});
    throw err;
  }
}
