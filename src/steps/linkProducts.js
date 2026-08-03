import { pathToFileURL } from 'node:url';
import { embed } from '../providers/openai.js';
import { supabase } from '../lib/supabase.js';
import { config } from '../config.js';

const STORE = 'collagenlab';
const MAX_PRODUCT_LINKS = 2;
const MAX_ARTICLE_LINKS = 2;
const RPC_MATCH_COUNT = 5;

// Must match the exact sentence writeArticle.js's mandatory disclaimer starts
// with, so links get inserted right before it rather than after.
const BG_DISCLAIMER_MARKER = 'Хранителните добавки не са заместител';

export async function embedQuery(article, topic) {
  return embed(`${article.title_bg}\n${topic.keyword}`);
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

// TODO: match_articles has never returned rows yet (no articles published),
// so this return shape (title_bg/url/similarity) is inferred from the
// products RPC's naming convention, not yet verified against real data.
// Confirm/adjust field names once publish.js has produced at least one row.
export async function fetchCandidateArticles(queryEmbedding) {
  const { data, error } = await supabase.rpc('match_articles', {
    query_embedding: queryEmbedding,
    match_store: STORE,
    match_count: RPC_MATCH_COUNT,
  });
  if (error) {
    throw new Error(`match_articles RPC failed: ${error.message}`);
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

function buildProductLinksBg(products) {
  if (products.length === 0) return '';
  if (products.length === 1) {
    return `<p>Разгледайте: <a href="${products[0].url}">${products[0].title_bg ?? products[0].title}</a>.</p>`;
  }
  const items = products.map((p) => `<li><a href="${p.url}">${p.title_bg ?? p.title}</a></li>`).join('');
  return `<p>Разгледайте свързаните продукти:</p><ul>${items}</ul>`;
}

function buildArticleLinksBg(articles) {
  if (articles.length === 0) return '';
  const items = articles.map((a) => `<li><a href="${a.url}">${a.title_bg ?? a.title}</a></li>`).join('');
  return `<p>Свързани статии:</p><ul>${items}</ul>`;
}

// Inserts `snippet` right before the <p> containing `marker`. If the marker
// isn't found (shouldn't happen once compliance.js has run), appends at the
// end instead of silently dropping the links.
function insertBeforeDisclaimer(html, snippet, marker) {
  if (!snippet) return html;

  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    return html + snippet;
  }

  const pStart = html.lastIndexOf('<p>', markerIndex);
  const insertAt = pStart === -1 ? markerIndex : pStart;
  return html.slice(0, insertAt) + snippet + html.slice(insertAt);
}

// article: the object returned by writeArticle() (needs title_bg, body_bg_html).
// topic: { keyword, angle }.
export async function linkProducts(article, topic) {
  const queryEmbedding = await embedQuery(article, topic);

  const candidateProducts = await fetchCandidateProducts(queryEmbedding);
  const { passed: passedProducts } = applyGuards(candidateProducts);
  const linkedProducts = passedProducts.slice(0, MAX_PRODUCT_LINKS);

  const candidateArticles = await fetchCandidateArticles(queryEmbedding);
  const linkedArticles = candidateArticles.slice(0, MAX_ARTICLE_LINKS);

  const bgSnippet = buildProductLinksBg(linkedProducts) + buildArticleLinksBg(linkedArticles);

  return {
    ...article,
    body_bg_html: insertBeforeDisclaimer(article.body_bg_html, bgSnippet, BG_DISCLAIMER_MARKER),
    linked_products: linkedProducts.map((p) => p.shopify_gid),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const testTopic = { keyword: 'колаген за кожа', angle: 'ползи и научна информация' };
  const testArticle = {
    title_bg: 'Колаген за кожа: научна информация, видове и разумен избор',
    body_bg_html:
      '<h2>Витамин C и образуването на колаген</h2><p>Пример.</p><p>Хранителните добавки не са заместител на разнообразното хранене и здравословния начин на живот.</p>',
  };

  const queryEmbedding = await embedQuery(testArticle, testTopic);

  const candidateProducts = await fetchCandidateProducts(queryEmbedding);
  const { passed, rejected } = applyGuards(candidateProducts);

  console.log('=== CANDIDATE PRODUCTS (match_products) ===');
  for (const product of candidateProducts) {
    const outcome = rejected.find((r) => r.shopify_gid === product.shopify_gid);
    console.log(
      `- ${product.title} | similarity=${product.similarity.toFixed(4)} | ` +
        (outcome ? `REJECTED (${outcome.guardFailed})` : 'PASSED')
    );
  }

  const candidateArticles = await fetchCandidateArticles(queryEmbedding);
  console.log(`\n=== CANDIDATE ARTICLES (match_articles): ${candidateArticles.length} found ===`);

  const result = await linkProducts(testArticle, testTopic);

  console.log('\n=== LINKED PRODUCTS (final) ===');
  console.log(JSON.stringify(result.linked_products, null, 2));

  console.log('\n=== FULL body_bg_html ===');
  console.log(result.body_bg_html);

  process.exit(0);
}
