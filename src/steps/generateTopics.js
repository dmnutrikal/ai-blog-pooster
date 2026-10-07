import { pathToFileURL } from 'node:url';
import { generateJson } from '../lib/generateJson.js';
import { supabase } from '../lib/supabase.js';
import { config, STORE } from '../config.js';
import { containsAccessoryKeyword } from './matchProduct.js';
import { TOPIC_BRIEF } from '../lib/storeContent.js';

const DEFAULT_STORE = STORE;
const RECENT_PUBLISHED_LIMIT = 100;

async function fetchExistingKeywords(store) {
  const { data, error } = await supabase.from('topics').select('keyword').eq('store', store);
  if (error) {
    throw new Error(`Failed to fetch existing topic keywords: ${error.message}`);
  }
  return (data ?? []).map((row) => row.keyword).filter(Boolean);
}

async function fetchRecentPublishedTitles(store) {
  const { data, error } = await supabase
    .from('articles')
    .select('title_bg, title_en')
    .eq('store', store)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(RECENT_PUBLISHED_LIMIT);
  if (error) {
    throw new Error(`Failed to fetch recent published article titles: ${error.message}`);
  }
  return data ?? [];
}

async function fetchProducts(store) {
  const { data, error } = await supabase
    .from('products')
    .select('handle, title, title_bg, description, product_type, tags')
    .eq('store', store);
  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`);
  }
  return data ?? [];
}

// The niche, grounding and compliance rules for proposed topics are the active
// store's TOPIC_BRIEF (stores/<STORE>/content.js); the engine fixes the output
// shape.
const SYSTEM_PROMPT = `
${TOPIC_BRIEF}

OUTPUT FORMAT: Respond with STRICT JSON only — no markdown code fences, no commentary before or
after. The JSON object must have exactly this shape:
{
  "topics": [
    { "keyword": string, "angle": string },
    ...
  ]
}
`.trim();

function formatProductsBlock(products) {
  if (products.length === 0) {
    return '(no products found for this store)';
  }
  return products
    .map((p) => {
      const name = p.title_bg ?? p.title;
      const parts = [name, p.product_type, (p.tags ?? []).join(', '), p.description]
        .filter(Boolean)
        .join(' | ');
      return `- ${parts}`;
    })
    .join('\n');
}

function formatExistingKeywordsBlock(keywords) {
  if (keywords.length === 0) {
    return '(none yet)';
  }
  return keywords.map((k) => `- ${k}`).join('\n');
}

function formatRecentTitlesBlock(articles) {
  if (articles.length === 0) {
    return '(none yet)';
  }
  return articles.map((a) => `- ${a.title_bg ?? ''}${a.title_en ? ` / ${a.title_en}` : ''}`).join('\n');
}

async function insertTopics(store, topics) {
  if (topics.length === 0) return 0;

  const rows = topics.map((t) => ({ store, keyword: t.keyword, angle: t.angle, status: 'pending' }));

  // ignoreDuplicates:true -> INSERT ... ON CONFLICT (store, keyword) DO NOTHING.
  // .select() then returns only the rows that were actually inserted, so its
  // length is the real inserted count (excluding conflicts) — no rows already
  // matching an existing (store, keyword) pair are returned.
  const { data, error } = await supabase
    .from('topics')
    .upsert(rows, { onConflict: 'store,keyword', ignoreDuplicates: true })
    .select('id');

  if (error) {
    throw new Error(`Failed to insert generated topics: ${error.message}`);
  }

  return (data ?? []).length;
}

function buildPrompt({ count, existingKeywords, recentArticles, products }) {
  return `Propose exactly ${count} NEW topics.

PRODUCTS (this store's catalog — ground topics in these where natural):
${formatProductsBlock(products)}

EXISTING KEYWORDS (all statuses — do NOT duplicate or closely paraphrase any of these):
${formatExistingKeywordsBlock(existingKeywords)}

RECENTLY PUBLISHED TITLES (do NOT duplicate or closely paraphrase the topic of any of these):
${formatRecentTitlesBlock(recentArticles)}`;
}

// GUARD: catches any accessory topic the model proposed despite the system
// prompt instruction — checked against both keyword and angle text, reusing
// the exact same accessoryKeywords list matchProduct.js uses to exclude
// accessory products from product matching (config.linking.accessoryKeywords
// via containsAccessoryKeyword()), so the two stay in sync by construction.
function isAccessoryTopic(topic) {
  return containsAccessoryKeyword(`${topic.keyword} ${topic.angle ?? ''}`);
}

// store: string (e.g. 'collagenlab').
// count: how many NEW {keyword, angle} topics to propose.
// dryRun: true (default) returns the proposed topics without touching the
// DB. false inserts them into `topics` (status='pending') and returns
// { topics, insertedCount } instead.
export async function generateTopics(store, { count = 15, dryRun = true } = {}) {
  const [existingKeywords, recentArticles, products] = await Promise.all([
    fetchExistingKeywords(store),
    fetchRecentPublishedTitles(store),
    fetchProducts(store),
  ]);

  const result = await generateJson({
    model: config.openai.models.terra,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt({ count, existingKeywords, recentArticles, products }),
  });

  const rawTopics = Array.isArray(result?.topics) ? result.topics : [];
  const parsedTopics = rawTopics
    .filter((t) => t && typeof t.keyword === 'string' && t.keyword.trim() !== '')
    .map((t) => ({
      keyword: t.keyword.trim(),
      angle: typeof t.angle === 'string' && t.angle.trim() !== '' ? t.angle.trim() : null,
    }));

  const topics = parsedTopics.filter((t) => !isAccessoryTopic(t));
  const droppedCount = parsedTopics.length - topics.length;
  if (droppedCount > 0) {
    console.warn(`generateTopics: dropped ${droppedCount} proposed topic(s) that matched an accessory keyword.`);
  }

  if (dryRun) {
    return topics;
  }

  const insertedCount = await insertTopics(store, topics);
  return { topics, insertedCount };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const store = args.find((a) => !a.startsWith('--')) ?? DEFAULT_STORE;
  const countArg = args.find((a) => a.startsWith('--count='));
  const count = countArg ? Number(countArg.slice('--count='.length)) : 15;

  generateTopics(store, { count, dryRun: !write })
    .then((result) => {
      const topics = write ? result.topics : result;

      console.log(
        `Proposed topics for store="${store}" (${write ? 'WRITE MODE — inserting into DB' : 'DRY RUN — nothing inserted'}):\n`
      );
      topics.forEach((t, i) => {
        console.log(`${i + 1}. keyword="${t.keyword}" | angle="${t.angle ?? ''}"`);
      });

      if (write) {
        const skipped = topics.length - result.insertedCount;
        console.log(`\n${topics.length} topic(s) proposed, ${result.insertedCount} inserted, ${skipped} skipped (duplicate keyword).`);
      } else {
        console.log(`\n${topics.length} topic(s) proposed.`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
