import { pathToFileURL } from 'node:url';
import { graphql } from '../lib/shopify.js';
import { supabase } from '../lib/supabase.js';
import { embed } from '../providers/openai.js';
import { config, STORE } from '../config.js';

const EMBED_BATCH_SIZE = 100;

// Only sync ACTIVE (published) products — drafts/archived items should never
// end up linked into articles.
// The store's Shopify base language is its primaryLocale; the other language
// comes from that locale's registered translations. The products table keeps
// fixed columns regardless: title = English name, title_bg = Bulgarian name.
const { primaryLocale, secondaryLocale } = config.store;

const PRODUCTS_QUERY = `
  query SyncProducts($cursor: String, $translationLocale: String!) {
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
          seo {
            title
            description
          }
          translations(locale: $translationLocale) {
            key
            value
          }
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
    const data = await graphql(PRODUCTS_QUERY, { cursor, translationLocale: secondaryLocale });
    const edges = data.products.edges;

    for (const edge of edges) {
      products.push(edge.node);
    }

    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = edges.at(-1)?.cursor ?? null;
  }

  return products;
}

// Reads the secondary-locale translation set nested on each product (see
// PRODUCTS_QUERY's `translations(locale: $translationLocale)`), keyed by field
// name. Products with no translation registered in Shopify simply produce an
// empty map here, so the corresponding columns stay null / fall back.
function translationsByKey(product) {
  const byKey = {};
  for (const t of product.translations ?? []) {
    byKey[t.key] = t.value;
  }
  return byKey;
}

// Normalizes a product into its English/Bulgarian fields, whichever of the two
// is Shopify's base language for this store.
function localize(product) {
  const tr = translationsByKey(product);
  if (primaryLocale === 'en') {
    // English base (collagenlab): Bulgarian comes from the 'bg' translations.
    return {
      titleEn: product.title,
      titleBg: tr.title ?? null,
      descriptionEn: product.description,
      descriptionBgHtml: tr.body_html ?? null,
      description: product.description,
      metaTitleBg: tr.meta_title ?? null,
      metaDescriptionBg: tr.meta_description ?? null,
    };
  }
  // Bulgarian base (gutexpert): English comes from the 'en' translations.
  return {
    titleEn: tr.title ?? product.title,
    titleBg: product.title,
    descriptionEn: null,
    descriptionBgHtml: null,
    // The Bulgarian plain-text description — what the topic generator reads.
    description: product.description,
    metaTitleBg: product.seo?.title ?? null,
    metaDescriptionBg: product.seo?.description ?? null,
  };
}

function buildEmbeddingInput(product) {
  // TODO: tune this composite string if match_products relevance turns out
  // to weight some fields too heavily (e.g. tags dominating description).
  const l = localize(product);
  const parts =
    primaryLocale === 'en'
      ? [l.titleEn, l.titleBg, l.descriptionEn, l.descriptionBgHtml]
      : // Bulgarian-first: topics are Bulgarian, so the BG title + description
        // carry the match. The English title is kept as a secondary signal; the
        // English body translation is left out (it carries on-page styling/CSS
        // and marketing copy, not useful matching signal).
        [l.titleBg, l.description, l.titleEn];
  return [...parts, product.productType, (product.tags ?? []).join(', ')].filter(Boolean).join('\n');
}

function toRow(product, embedding) {
  const l = localize(product);
  return {
    store: STORE,
    shopify_gid: product.id,
    handle: product.handle,
    title: l.titleEn,
    title_bg: l.titleBg,
    description: l.description,
    product_type: product.productType,
    tags: product.tags,
    url: product.onlineStoreUrl,
    embedding,
    // Not used anywhere yet — stored for future SEO/meta work.
    meta_title_bg: l.metaTitleBg,
    meta_description_bg: l.metaDescriptionBg,
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
