import { pickTopic } from './steps/pickTopic.js';
import { writeArticle } from './steps/writeArticle.js';
import { checkCompliance } from './steps/compliance.js';
import { linkProducts } from './steps/linkProducts.js';
import { generateImage } from './steps/generateImage.js';
import { publishArticle } from './steps/publish.js';
import { supabase } from './lib/supabase.js';
import { config } from './config.js';

async function processTopic(topic) {
  const written = await writeArticle({ keyword: topic.keyword, angle: topic.angle });

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

  article = await linkProducts(article, topic);

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
