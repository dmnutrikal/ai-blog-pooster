import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ShopifyClient } from "../src/lib/shopify/client";
import { missingScopes, TokenProvider } from "../src/lib/shopify/token";
import { credentialsFor, storeRepository } from "../src/lib/stores/repository";
import type { StoreRecord } from "../src/lib/stores/types";

// Stores are added in the panel (npm run dev → Добави магазин). Pick one by slug, myshopify domain or name;
// with a single connected store, --store can be left out.
export async function findStore(query: string | undefined): Promise<StoreRecord> {
  const stores = await storeRepository().list();
  if (!stores.length) throw new Error("No stores yet. Start the panel with `npm run dev` and add one under Магазини → Добави магазин.");
  if (!query) {
    if (stores.length === 1) return stores[0]!;
    throw new Error(`Pass --store, one of: ${stores.map((s) => s.shopDomain).join(", ")}`);
  }
  const q = query.trim().toLowerCase();
  const store = stores.find((s) => s.slug === q || s.shopDomain === q || s.shopDomain === `${q}.myshopify.com` || s.name.toLowerCase() === q);
  if (!store) throw new Error(`No store matches "${query}". Connected: ${stores.map((s) => s.shopDomain).join(", ")}`);
  return store;
}

// Records every response into fixtures/recorded/<shop>/ so tests can run without a store.
// The access token is never part of a response body, so nothing secret ends up on disk.
function recorder(shop: string) {
  const dir = join("fixtures", "recorded", shop);
  mkdirSync(dir, { recursive: true });
  let n = 0;
  return (operation: string, variables: unknown, body: unknown) => {
    n++;
    writeFileSync(join(dir, `${String(n).padStart(3, "0")}-${operation}.json`), JSON.stringify({ operation, variables, body }, null, 2));
  };
}

export async function connect(options: { store?: string; record?: boolean } = {}) {
  const store = await findStore(options.store);
  const tokens = new TokenProvider(credentialsFor(store));

  const token = await tokens.get();
  console.log(`✓ ${store.name}: token for ${tokens.shop}, valid until ${new Date(token.expiresAt).toISOString()}`);
  const missing = missingScopes(token.scopes);
  if (missing.length) console.warn(`! Missing scopes: ${missing.join(", ")}. Release a new app version with the full scope list.`);
  else console.log("✓ All required scopes granted");

  const client = new ShopifyClient(tokens, { onResponse: options.record ? recorder(tokens.shop) : undefined });
  return { client, store, shop: tokens.shop };
}
