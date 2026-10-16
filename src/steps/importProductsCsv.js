import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { supabase } from '../lib/supabase.js';
import { embed } from '../providers/openai.js';
import { config, STORE } from '../config.js';

const EMBED_BATCH_SIZE = 100;

// For stores whose catalog comes from a CSV export (store.config.js
// catalog.source 'csv') instead of the Shopify Admin API — see syncProducts.js
// for the Shopify path. Reads stores/<STORE>/data/products.csv (columns Name,
// Link, Description; Link is the product-page URL) and upserts one products
// row per line, keyed on (store, handle), so re-runs update rather than
// duplicate.
const CSV_PATH = join(config.store.paths.root, 'data', 'products.csv');

// RFC 4180: quoted fields may contain commas, newlines and "" escapes.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// The slug after /products/ in the product-page URL.
export function handleFromLink(link) {
  const match = /\/products\/([^/?#]+)/.exec(link);
  return match ? decodeURIComponent(match[1]) : null;
}

export function readCatalogCsv(path = CSV_PATH) {
  const [header, ...lines] = parseCsv(readFileSync(path, 'utf8'));
  const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const idx = { name: col('name'), link: col('link'), description: col('description') };
  if (Object.values(idx).some((i) => i === -1)) {
    throw new Error(`${path}: expected columns Name, Link, Description (got ${header.join(', ')}).`);
  }

  const problems = [];
  const seen = new Set();
  const products = [];
  lines.forEach((cells, n) => {
    const line = n + 2;
    const name = (cells[idx.name] ?? '').trim();
    const url = (cells[idx.link] ?? '').trim();
    const description = (cells[idx.description] ?? '').trim();
    const handle = handleFromLink(url);
    if (!name) problems.push(`line ${line}: empty Name`);
    if (!handle) problems.push(`line ${line}: Link has no /products/ slug (${url || 'empty'})`);
    else if (seen.has(handle)) problems.push(`line ${line}: duplicate handle "${handle}"`);
    if (name && handle && !seen.has(handle)) products.push({ name, url, description, handle });
    if (handle) seen.add(handle);
  });
  return { products, problems, rowCount: lines.length };
}

export async function importProductsCsv({ path = CSV_PATH } = {}) {
  if (!config.catalog.enabled || config.catalog.source !== 'csv') {
    throw new Error(`Store "${STORE}" does not use a CSV catalog (catalog.source !== 'csv') — use sync-products.`);
  }

  const { products, problems, rowCount } = readCatalogCsv(path);
  console.log(`Read ${rowCount} row(s) from ${path}; ${products.length} valid.`);
  if (problems.length > 0) {
    throw new Error(`Refusing to import — fix the CSV first:\n  ${problems.join('\n  ')}`);
  }

  // Existing rows for this store, by handle, so the write is an upsert on
  // (store, handle) without depending on a unique index for that pair.
  const { data: existing, error: existingError } = await supabase
    .from('products')
    .select('id, handle')
    .eq('store', STORE);
  if (existingError) {
    throw new Error(`Failed to read existing products for store="${STORE}": ${existingError.message}`);
  }
  const idByHandle = new Map((existing ?? []).map((r) => [r.handle, r.id]));

  const toUpdate = [];
  const toInsert = [];
  for (let i = 0; i < products.length; i += EMBED_BATCH_SIZE) {
    const batch = products.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await embed(batch.map((p) => `${p.name}\n${p.description}`));
    batch.forEach((p, j) => {
      const row = {
        store: STORE,
        // products.shopify_gid is NOT NULL; a CSV row has no Shopify GID, so
        // store a stable placeholder that can never collide with a real one.
        shopify_gid: `csv:${p.handle}`,
        handle: p.handle,
        title: p.name,
        description: p.description,
        url: p.url,
        embedding: embeddings[j],
        synced_at: new Date().toISOString(),
      };
      const id = idByHandle.get(p.handle);
      if (id !== undefined) toUpdate.push({ id, ...row });
      else toInsert.push(row);
    });
    console.log(`  embedded ${Math.min(i + EMBED_BATCH_SIZE, products.length)}/${products.length}`);
  }

  if (toUpdate.length > 0) {
    const { error } = await supabase.from('products').upsert(toUpdate, { onConflict: 'id' });
    if (error) throw new Error(`Failed to update products: ${error.message}`);
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from('products').insert(toInsert);
    if (error) throw new Error(`Failed to insert products: ${error.message}`);
  }

  const csvHandles = new Set(products.map((p) => p.handle));
  const notInCsv = (existing ?? []).filter((r) => !csvHandles.has(r.handle));
  if (notInCsv.length > 0) {
    console.warn(`${notInCsv.length} existing row(s) for store="${STORE}" are not in the CSV (left in place).`);
  }

  const { count, error: countError } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('store', STORE);
  if (countError) throw new Error(`Failed to count products: ${countError.message}`);

  console.log(`Inserted ${toInsert.length}, updated ${toUpdate.length}. store="${STORE}" now has ${count} product row(s).`);
  return { inserted: toInsert.length, updated: toUpdate.length, total: count };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  importProductsCsv()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
