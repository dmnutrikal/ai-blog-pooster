export interface StoreLocale {
  locale: string;
  name: string;
  primary: boolean;
  published: boolean;
  urls: string[]; // storefront root URLs for this locale, one per market
}

export interface StoreBlog {
  id: string; // gid://shopify/Blog/...
  title: string;
  handle: string;
}

// Result of the last connection test; nothing here is secret.
export interface ConnectionSnapshot {
  testedAt: string;
  ok: boolean;
  error?: string;
  shopName?: string;
  grantedScopes: string[];
  missingScopes: string[];
  locales: StoreLocale[];
  blogs?: StoreBlog[];
  // Connected, but something optional could not be read (missing scope).
  warnings?: string[];
}

// One row of the shared `stores` table (supabase/migrations at the repo root).
export interface StoreRecord {
  id: string;
  // = topics.store / articles.store in the blog pipeline and its stores/<slug>/ folder.
  slug: string;
  name: string;
  shopDomain: string;
  clientId: string;
  clientSecretEncrypted: string;
  publicDomain: string | null;
  blogGid: string | null;
  autoblogEnabled: boolean;
  writesEnabled: boolean;
  // Weekly scheduled translation sync (.github/workflows/translate.yml). Off by default;
  // the scheduled run writes only when writesEnabled is also on, otherwise it leaves proposals.
  translateWeeklyEnabled: boolean;
  connection: ConnectionSnapshot | null;
  createdAt: string;
  updatedAt: string;
}

// What may leave the server. The secret, even encrypted, never does.
export type PublicStore = Omit<StoreRecord, "clientSecretEncrypted">;

export function toPublic({ clientSecretEncrypted: _secret, ...store }: StoreRecord): PublicStore {
  return store;
}
