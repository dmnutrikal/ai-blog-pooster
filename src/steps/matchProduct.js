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

function isAccessory(product) {
  const haystack = `${product.title_bg ?? product.title ?? ''} ${product.handle ?? ''} ${product.product_type ?? ''}`.toLowerCase();
  return config.linking.accessoryKeywords.some((keyword) => haystack.includes(keyword));
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
