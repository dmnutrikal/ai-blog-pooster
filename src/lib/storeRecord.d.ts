// Types for storeRecord.js, so the panel's tests (TypeScript) can check the pipeline reads what the panel writes.

export interface StoreRow {
  slug?: string;
  name?: string;
  shop_domain: string;
  client_id: string;
  client_secret_encrypted: string;
  public_domain?: string | null;
  blog_gid?: string | null;
  autoblog_enabled?: boolean;
}

export function decryptSecret(payload: string, keyBase64: string): string;

export function fetchStoreRow(options: { url?: string; secretKey?: string; slug: string }): Promise<{ row: StoreRow | null; reason: string | null }>;

export function credentialsFromRow(
  row: StoreRow | null,
  credentialsKey: string | undefined,
): { credentials: { storeDomain: string; clientId: string; clientSecret: string } | null; reason: string | null };
