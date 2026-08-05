import { pathToFileURL } from 'node:url';
import { embed } from '../providers/openai.js';
import { supabase } from '../lib/supabase.js';
import { config } from '../config.js';

const STORE = 'collagenlab';
const RPC_MATCH_COUNT = 5;

// Runs before writeArticle() — there is no article yet, so the query is
// built from the topic alone (keyword + angle) rather than the finished
// title_bg, unlike the article-linking embedding in linkArticles.js.
export async function embedTopicQuery(topic) {
  return embed([topic.keyword, topic.angle].filter(Boolean).join('\n'));
}

export async function fetchCandidateProducts(queryEmbedding) {
  const { data, error } = await supabase.rpc('match_products', {
    query_embedding: queryEmbedding,
    match_store: STORE,
    match_count: RPC_MATCH_COUNT,
  });
  if (error) {
    throw new Error(`match_products RPC failed: ${error.message}`);
  }
  return data ?? [];
}

// Shared with generateTopics.js's safety filter, so "is this text about an
// accessory" (dosing scoops, spoons, shakers, etc — not the collagen
// supplement itself) is defined in exactly one place.
export function containsAccessoryKeyword(text) {
  const haystack = (text ?? '').toLowerCase();
  return config.linking.accessoryKeywords.some((keyword) => haystack.includes(keyword));
}

function isAccessory(product) {
  return containsAccessoryKeyword(
    `${product.title_bg ?? product.title ?? ''} ${product.handle ?? ''} ${product.product_type ?? ''}`
  );
}

// GUARD 1 (similarity) + GUARD 2 (accessory exclusion). Returns both the
// products that passed and the rejected ones (with the reason), so callers
// can log/inspect the full picture rather than just the survivors.
export function applyGuards(products) {
  const passed = [];
  const rejected = [];

  for (const product of products) {
    if (product.similarity < config.linking.minSimilarity) {
      rejected.push({ ...product, guardFailed: 'similarity' });
      continue;
    }
    if (isAccessory(product)) {
      rejected.push({ ...product, guardFailed: 'accessory' });
      continue;
    }
    passed.push(product);
  }

  return { passed, rejected };
}

// topic: { keyword, angle }. Returns the single best-matching product that
// clears both guards, or null — writeArticle() weaves in at most one product
// link, so there is never a reason to hand it more than one candidate. null
// means "write the article with no product link at all" (no forced/irrelevant
// link is better than a weak one).
export async function matchProduct(topic) {
  const queryEmbedding = await embedTopicQuery(topic);
  const candidates = await fetchCandidateProducts(queryEmbedding);
  const { passed } = applyGuards(candidates);
  return passed[0] ?? null;
}

// Fallback for when matchProduct() finds nothing that clears the guards —
// looks up this store's configured PRIMARY_PRODUCT_HANDLE directly (no
// semantic search, no similarity/accessory guards) so every article can
// still carry a product link. Returns null if this store has no primary
// product configured, or if the configured handle doesn't exist in the
// products table (logged loudly rather than silently skipped, since a
// misconfigured handle should be fixed, not quietly ignored).
export async function fetchPrimaryProduct() {
  const handle = config.products.primaryHandleByStore[STORE];
  if (!handle) return null;

  const { data, error } = await supabase
    .from('products')
    .select('shopify_gid, handle, title, title_bg, url')
    .eq('store', STORE)
    .eq('handle', handle)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch primary product "${handle}" for store="${STORE}": ${error.message}`);
  }
  if (!data) {
    console.warn(
      `fetchPrimaryProduct: configured handle "${handle}" for store="${STORE}" not found in products table.`
    );
    return null;
  }

  return data;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const testTopic = { keyword: 'колаген за кожа', angle: 'ползи и научна информация' };

  const queryEmbedding = await embedTopicQuery(testTopic);
  const candidates = await fetchCandidateProducts(queryEmbedding);
  const { passed, rejected } = applyGuards(candidates);

  console.log('=== CANDIDATE PRODUCTS (match_products) ===');
  for (const product of candidates) {
    const outcome = rejected.find((r) => r.shopify_gid === product.shopify_gid);
    console.log(
      `- ${product.title_bg ?? product.title} | similarity=${product.similarity.toFixed(4)} | ` +
        (outcome ? `REJECTED (${outcome.guardFailed})` : 'PASSED')
    );
  }

  console.log('\n=== MATCHED PRODUCT (final) ===');
  console.log(JSON.stringify(await matchProduct(testTopic), null, 2));

  process.exit(0);
}
