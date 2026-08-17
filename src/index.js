import { pickTopic, countPendingTopics } from './steps/pickTopic.js';
import { matchProduct, fetchPrimaryProduct } from './steps/matchProduct.js';
import { writeArticle } from './steps/writeArticle.js';
import { checkCompliance } from './steps/compliance.js';
import { linkArticles } from './steps/linkArticles.js';
import { generateImage } from './steps/generateImage.js';
import { publishArticle } from './steps/publish.js';
import { generateTopics } from './steps/generateTopics.js';
import { supabase } from './lib/supabase.js';
import { config } from './config.js';

// TODO: single-store for now, same as matchProduct.js/publish.js/etc — see
// their STORE constants and TODOs about pulling this from config for
// multi-store support.
const STORE = 'collagenlab';

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// The model is instructed to weave the product in only if it genuinely fits
// (see writeArticle.js's PRODUCT_LINK_INSTRUCTIONS) — it may legitimately
// skip a provided product. Checking for the URL in the finished HTML (rather
// than trusting a flag from the model) is what actually decides what gets
// recorded in linked_products.
function articleLinksToProduct(article, product) {
  if (!product) return false;
  return (article.body_bg_html ?? '').includes(product.url) || (article.body_en_html ?? '').includes(product.url);
}

async function processTopic(topic) {
  // Matched BEFORE writing so the model can weave the link into the prose
  // itself, instead of a separate link snippet bolted on afterwards.
  let product = await matchProduct({ keyword: topic.keyword, angle: topic.angle });

  if (product) {
    console.log(`  -> product match: "${product.title}" sim=${Number(product.similarity).toFixed(3)}`);
  } else {
    console.log('  -> product match: none cleared guards');
    product = await fetchPrimaryProduct();
    if (product) {
      console.log('  -> product match: fallback to primary product');
    }
  }

  // A fresh random anchor pair per article/per language keeps the product
  // link from reading as "Exact Product Name" every single time — see
  // config.productLink and writeArticle.js's PRODUCT_LINK_INSTRUCTIONS_*.
  const anchors = product
    ? {
        inlineAnchorBg: pickRandom(config.productLink.inlineAnchorsBg),
        ctaAnchorBg: pickRandom(config.productLink.ctaAnchorsBg),
        inlineAnchorEn: pickRandom(config.productLink.inlineAnchorsEn),
        ctaAnchorEn: pickRandom(config.productLink.ctaAnchorsEn),
      }
    : null;

  const written = await writeArticle(
    { keyword: topic.keyword, angle: topic.angle },
    { product, anchors, fixedTitleBg: topic.fixed_title_bg, fixedTitleEn: topic.fixed_title_en }
  );

  const compliance = await checkCompliance(written);
  if (config.pipeline.complianceMode === 'block' && compliance.passed !== true) {
    console.warn(
      `  Topic ${topic.id}: compliance BLOCKED (${compliance.flags.length} flag(s)) — ` +
        'publish.js will record status=\'blocked\' and skip Shopify entirely.'
    );
  } else if (compliance.flags.length > 0) {
    console.warn(`  Topic ${topic.id}: compliance flagged ${compliance.flags.length} non-blocking issue(s).`);
  }

  let article = { ...written, compliance, topic_id: topic.id };

  article = await linkArticles(article, topic);
  article.linked_products = articleLinksToProduct(article, product) ? [product.shopify_gid] : [];
  console.log(`  -> product link woven into body: ${article.linked_products.length > 0}`);

  // generateImage() already fails soft internally (never throws, returns
  // imageUrl: null on any error) — this try/catch is a second safety net in
  // case of an unexpected error outside that internal handling.
  try {
    const { imageUrl } = await generateImage(article, topic);
    article.imageUrl = imageUrl;
  } catch (err) {
    console.warn(`  Topic ${topic.id}: generateImage threw unexpectedly, continuing without an image — ${err.message}`);
    article.imageUrl = null;
  }

  // TODO: real cost tracking needs generate()/embed()/image() in
  // src/providers/openai.js to surface token/image usage data — they
  // currently only return parsed content. Left null until that's wired up.
  article.costUsd = null;

  return publishArticle(article);
}

async function run() {
  const n = config.pipeline.articlesPerRun;
  console.log(
    `Starting pipeline run: up to ${n} article(s) | COMPLIANCE_MODE=${config.pipeline.complianceMode} | ` +
      `PUBLISH_STATUS=${config.pipeline.publishStatus}`
  );

  // Auto-generate more topics BEFORE picking one, if the backlog is running
  // low — keeps pickTopic() from ever starving even if nobody has manually
  // run `npm run generate-topics` in a while.
  const pendingCount = await countPendingTopics();
  if (pendingCount < config.topics.minPending) {
    console.log(
      `Pending topics (${pendingCount}) below minimum (${config.topics.minPending}) — generating more...`
    );
    try {
      const { topics, insertedCount } = await generateTopics(STORE, {
        count: config.topics.generateCount,
        dryRun: false,
      });
      console.log(
        `  -> generated ${topics.length} topic(s), inserted ${insertedCount} new ` +
          `(${topics.length - insertedCount} duplicate/skipped).`
      );
    } catch (err) {
      console.error(`  -> topic generation failed, continuing with existing backlog: ${err.message}`);
    }
  }

  const tally = { published: 0, draft: 0, blocked: 0, errored: 0 };
  const attemptedTopicIds = new Set();

  for (let i = 0; i < n; i++) {
    let topic;
    try {
      topic = await pickTopic();
    } catch (err) {
      console.error(`Failed to pick next topic — stopping run: ${err.message}`);
      break;
    }

    if (!topic) {
      console.log('No pending topics found — stopping run.');
      break;
    }

    // pickTopic() always returns the same highest-priority pending topic
    // until its status changes. If it already failed once this run (status
    // stays 'pending' on a generic error), retrying it would just loop on
    // the same broken topic instead of ever reaching healthier ones.
    if (attemptedTopicIds.has(topic.id)) {
      console.warn(
        `Topic ${topic.id} ("${topic.keyword}") failed earlier in this run and is still pending — ` +
          'stopping here rather than retrying it indefinitely.'
      );
      break;
    }
    attemptedTopicIds.add(topic.id);

    console.log(`\n[${i + 1}/${n}] Topic ${topic.id}: "${topic.keyword}"${topic.angle ? ` (angle: ${topic.angle})` : ''}`);

    try {
      const result = await processTopic(topic);

      if (result.status === 'blocked') tally.blocked++;
      else if (result.status === 'published') tally.published++;
      else tally.draft++;

      console.log(
        `  -> status=${result.status} shopify_gid=${result.shopify_gid ?? 'n/a'} adminUrl=${result.adminUrl ?? 'n/a'}`
      );
    } catch (err) {
      tally.errored++;
      console.error(`  -> ERROR processing topic ${topic.id}: ${err.message}`);

      const { error: updateError } = await supabase
        .from('topics')
        .update({ attempts: (topic.attempts ?? 0) + 1, last_error: err.message })
        .eq('id', topic.id);
      if (updateError) {
        console.error(`  -> also failed to record attempts/last_error on topic ${topic.id}: ${updateError.message}`);
      }
    }
  }

  console.log(
    `\nRun complete: ${tally.published} published, ${tally.draft} draft, ${tally.blocked} blocked, ${tally.errored} errored.`
  );
  // TODO: cost total not printed yet — depends on the costUsd TODO above.

  process.exitCode = tally.errored > 0 ? 1 : 0;
}

await run();
