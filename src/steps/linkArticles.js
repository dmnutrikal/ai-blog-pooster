import { pathToFileURL } from 'node:url';
import { embed } from '../providers/openai.js';
import { supabase } from '../lib/supabase.js';

const STORE = 'collagenlab';
const MAX_ARTICLE_LINKS = 2;
const RPC_MATCH_COUNT = 5;

// Must match the exact sentence writeArticle.js's mandatory disclaimer starts
// with, so links get inserted right before it rather than after.
const BG_DISCLAIMER_MARKER = 'Хранителните добавки не са заместител';

// Runs AFTER writeArticle() — needs the finished title_bg to embed against,
// unlike matchProduct.js's topic-only query (which runs before an article
// exists).
export async function embedQuery(article, topic) {
  return embed(`${article.title_bg}\n${topic.keyword}`);
}

export async function fetchCandidateArticles(queryEmbedding) {
  const { data, error } = await supabase.rpc('match_articles', {
    query_embedding: queryEmbedding,
    match_store: STORE,
    match_count: RPC_MATCH_COUNT,
  });
  if (error) {
    throw new Error(`match_articles RPC failed: ${error.message}`);
  }
  // Guard: skip articles with no usable public URL. Articles published before
  // the url column existed store urls ending in "/null" (handle was null at
  // publish time) — rendering them produces broken links.
  return (data ?? []).filter(
    (a) => typeof a.url === 'string' && a.url.length > 0 && !a.url.endsWith('/null')
  );
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
// Product linking no longer happens here — matchProduct.js finds a product
// BEFORE writing, and writeArticle() weaves it into the prose directly. This
// function only handles related-article cross-linking, which necessarily
// runs after writing (it can only recommend articles that already exist).
export async function linkArticles(article, topic) {
  const queryEmbedding = await embedQuery(article, topic);

  const candidateArticles = await fetchCandidateArticles(queryEmbedding);
  const linkedArticles = candidateArticles.slice(0, MAX_ARTICLE_LINKS);

  const bgSnippet = buildArticleLinksBg(linkedArticles);

  return {
    ...article,
    body_bg_html: insertBeforeDisclaimer(article.body_bg_html, bgSnippet, BG_DISCLAIMER_MARKER),
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
  const candidateArticles = await fetchCandidateArticles(queryEmbedding);
  console.log(`=== CANDIDATE ARTICLES (match_articles): ${candidateArticles.length} found ===`);

  const result = await linkArticles(testArticle, testTopic);

  console.log('\n=== FULL body_bg_html ===');
  console.log(result.body_bg_html);

  process.exit(0);
}
