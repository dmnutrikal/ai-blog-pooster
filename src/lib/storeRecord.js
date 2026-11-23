// Reads the active store's row from the shared `stores` table, which the panel (panel/) manages.
//
// Optional by design: when the table doesn't exist yet, the row is missing, Supabase is
// unreachable or CREDENTIALS_KEY isn't set, config.js falls back to the store's environment
// variables exactly as before. Imported by config.js, so it must not import config.js itself.

import { createDecipheriv } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const COLUMNS = 'slug, name, shop_domain, client_id, client_secret_encrypted, public_domain, blog_gid, autoblog_enabled';

// Same format as panel/src/lib/crypto.ts: v1.<iv>.<tag>.<data>, each part base64url, AES-256-GCM.
export function decryptSecret(payload, keyBase64) {
  const key = Buffer.from(keyBase64.trim(), 'base64');
  if (key.length !== 32) throw new Error('CREDENTIALS_KEY must be 32 bytes, base64-encoded');
  const [version, iv, tag, data] = String(payload).split('.');
  if (version !== 'v1' || !iv || !tag || data === undefined) throw new Error('unknown secret format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

// Returns { row, reason }: row is null when nothing usable was found, with the reason why.
export async function fetchStoreRow({ url, secretKey, slug }) {
  if (!url || !secretKey) return { row: null, reason: 'Supabase is not configured' };
  try {
    const client = createClient(url, secretKey, { auth: { persistSession: false } });
    const { data, error } = await client.from('stores').select(COLUMNS).eq('slug', slug).maybeSingle();
    if (error) return { row: null, reason: `stores table not readable (${error.code ?? 'error'}: ${error.message})` };
    return data ? { row: data, reason: null } : { row: null, reason: `no "${slug}" row in stores` };
  } catch (err) {
    return { row: null, reason: `stores lookup failed (${err.message})` };
  }
}

// Shopify credentials from the row, or null with the reason when they can't be used.
export function credentialsFromRow(row, credentialsKey) {
  if (!row) return { credentials: null, reason: null };
  if (!credentialsKey) return { credentials: null, reason: 'CREDENTIALS_KEY is not set' };
  try {
    return {
      credentials: {
        storeDomain: row.shop_domain,
        clientId: row.client_id,
        clientSecret: decryptSecret(row.client_secret_encrypted, credentialsKey),
      },
      reason: null,
    };
  } catch (err) {
    return { credentials: null, reason: `could not decrypt the client secret (${err.message})` };
  }
}
