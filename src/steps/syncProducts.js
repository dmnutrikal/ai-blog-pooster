import { pathToFileURL } from 'node:url';
import { graphql } from '../lib/shopify.js';
import { supabase } from '../lib/supabase.js';
import { embed } from '../providers/openai.js';

// TODO: single-store for now. If this pipeline ever serves more than one
// Shopify store, this should come from config instead of being hardcoded.
const STORE = 'collagenlab';

const EMBED_BATCH_SIZE = 100;

// Only sync ACTIVE (published) products — drafts/archived items should never
// end up linked into articles.
const PRODUCTS_QUERY = `
  query SyncProducts($cursor: String) {
    products(first: 50, after: $cursor, query: "status:ACTIVE") {
      edges {
        cursor
        node {
          id
          handle
          title
          description
          productType
          tags
          onlineStoreUrl
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

async function fetchAllProducts() {
  const products = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await graphql(PRODUCTS_QUERY, { cursor });
    const edges = data.products.edges;

    for (const edge of edges) {
      products.push(edge.node);
    }

    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = edges.at(-1)?.cursor ?? null;
  }

  return products;
}

function buildEmbeddingInput(product) {
  // TODO: tune this composite string if match_products relevance turns out
  // to weight some fields too heavily (e.g. tags dominating description).
  return [product.title, product.description, product.productType, (product.tags ?? []).join(', ')]
    .filter(Boolean)
    .join('\n');
}

function toRow(product, embedding) {
  return {
    store: STORE,
    shopify_gid: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description,
    product_type: product.productType,
    tags: product.tags,
    url: product.onlineStoreUrl,
    embedding,
  };
}

export async function syncProducts() {
  const products = await fetchAllProducts();
  console.log(`Fetched ${products.length} product(s) from Shopify.`);

  const rows = [];
  for (let i = 0; i < products.length; i += EMBED_BATCH_SIZE) {
    const batch = products.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await embed(batch.map(buildEmbeddingInput));
    batch.forEach((product, idx) => rows.push(toRow(product, embeddings[idx])));
  }

  const { error } = await supabase.from('products').upsert(rows, { onConflict: 'store,shopify_gid' });
  if (error) {
    throw new Error(`Failed to upsert products into Supabase: ${error.message}`);
  }

  console.log(`Synced ${rows.length} product(s) into Supabase.`);

  // Reconcile: remove rows for products that are no longer active (or were
  // deleted) in Shopify, so drafts/archived items never linger.
  //
  // Zero fetched products is treated as a probable fetch failure (Shopify
  // API hiccup, bad query, etc.), not a genuinely empty store — refuse to
  // touch existing rows rather than wipe the whole store out.
  if (rows.length === 0) {
    console.warn(
      `Skipping reconciliation: fetched 0 active product(s) from Shopify for store="${STORE}". ` +
        'This looks like a fetch failure rather than a real empty store — leaving existing rows untouched.'
    );
    return rows.length;
  }

  const activeGids = rows.map((row) => row.shopify_gid);
  const notActiveFilter = `(${activeGids.map((gid) => `"${gid}"`).join(',')})`;

  const { count: staleCount, error: countError } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('store', STORE)
    .not('shopify_gid', 'in', notActiveFilter);

  if (countError) {
    throw new Error(`Failed to count stale products in Supabase: ${countError.message}`);
  }

  // Safety cap: a delete larger than what we just synced smells like a
  // partial fetch (pagination cut short, transient API error, etc.) rather
  // than real churn. Skip and let a human investigate instead of nuking rows.
  if (staleCount > rows.length) {
    console.warn(
      `Skipping reconciliation: would delete ${staleCount} stale product(s), which exceeds the ` +
        `${rows.length} product(s) just synced for store="${STORE}". This looks like a partial ` +
        'fetch rather than real deletions — leaving stale rows in place. Investigate and re-run manually.'
    );
    return rows.length;
  }

  const { error: deleteError, count: deletedCount } = await supabase
    .from('products')
    .delete({ count: 'exact' })
    .eq('store', STORE)
    .not('shopify_gid', 'in', notActiveFilter);

  if (deleteError) {
    throw new Error(`Failed to reconcile stale products in Supabase: ${deleteError.message}`);
  }
  if (deletedCount) {
    console.log(`Removed ${deletedCount} stale product(s) no longer active in Shopify.`);
  }

  return rows.length;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncProducts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
