import { graphql } from '../lib/shopify.js';
import { supabase } from '../lib/supabase.js';
import { embed } from '../providers/openai.js';
import { config } from '../config.js';

const STORE = 'collagenlab';

const BLOGS_QUERY = `
  query Blogs {
    blogs(first: 1) {
      edges {
        node {
          id
          title
        }
      }
    }
  }
`;

const ARTICLE_CREATE = `
  mutation ArticleCreate($article: ArticleCreateInput!) {
    articleCreate(article: $article) {
      article {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Confirmed real translatable keys for an Article: title, body_html,
// summary_html, handle, meta_description (see registerBulgarianTranslation).
const TRANSLATABLE_CONTENT_QUERY = `
  query TranslatableContent($resourceId: ID!) {
    translatableResource(resourceId: $resourceId) {
      translatableContent {
        key
        value
        digest
        locale
      }
    }
  }
`;

const TRANSLATIONS_REGISTER = `
  mutation TranslationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      userErrors {
        field
        message
      }
    }
  }
`;

function summarizeFlags(flags) {
  return (flags ?? []).map((f) => `[${f.severity}] (${f.language}) ${f.rule}: "${f.quote}"`).join(' | ');
}

async function resolveBlogGid() {
  if (config.shopify.blogGid) {
    return config.shopify.blogGid;
  }

  const data = await graphql(BLOGS_QUERY);
  const blog = data.blogs.edges[0]?.node;
  if (!blog) {
    throw new Error('No blogs found on this Shopify store — create one in Shopify admin first.');
  }

  console.warn(
    `BLOG_GID_COLLAGENLAB is not set in .env — using the store's first blog "${blog.title}" (${blog.id}). ` +
      `Add BLOG_GID_COLLAGENLAB=${blog.id} to .env so future runs don't have to guess.`
  );
  return blog.id;
}

function adminUrlFor(articleGid) {
  const numericId = articleGid.split('/').pop();
  // TODO: verify this deep-link pattern still resolves on 2026-07 admin — it's
  // the long-standing Shopify admin URL convention, not confirmed against a
  // real article yet since none has been created.
  return `https://${config.shopify.storeDomain}/admin/articles/${numericId}`;
}

// Best-effort: on any failure, the caller logs a warning with the exact error
// and the English article publish itself is NOT rolled back. The store's
// separate Translate & Adapt app reads from this same Translations API, so a
// successful call here makes the Bulgarian text show up there as a
// high-quality (non-machine) translation rather than its own auto-translation.
async function registerBulgarianTranslation(articleGid, article) {
  const data = await graphql(TRANSLATABLE_CONTENT_QUERY, { resourceId: articleGid });
  const content = data.translatableResource?.translatableContent ?? [];

  // Confirmed against the live 2026-07 schema (via debug script): an Article's
  // translatableContent exposes title, body_html, summary_html, handle, and
  // meta_description. We deliberately do NOT translate "handle" — we don't
  // generate a Bulgarian handle, and forcing one isn't worth it; it stays the
  // English slug. The other four are registered whenever Shopify exposes them
  // for this resource (checked dynamically below rather than assumed).
  const fieldsToTranslate = {
    title: article.title_bg,
    body_html: article.body_bg_html,
    summary_html: article.summary_bg,
    meta_description: article.meta_bg,
  };

  const translations = [];
  const skippedKeys = [];
  for (const [key, value] of Object.entries(fieldsToTranslate)) {
    const original = content.find((c) => c.key === key);
    if (original) {
      translations.push({ locale: 'bg', key, value, translatableContentDigest: original.digest });
    } else {
      skippedKeys.push(key);
    }
  }

  if (skippedKeys.length > 0) {
    console.warn(
      `registerBulgarianTranslation: Shopify did not expose translatable key(s) [${skippedKeys.join(', ')}] ` +
        `for ${articleGid} — skipped (available keys: ${content.map((c) => c.key).join(', ') || 'none'}).`
    );
  }

  if (translations.length === 0) {
    throw new Error(
      `translatableResource returned none of the expected keys for ${articleGid} ` +
        `(got: ${content.map((c) => c.key).join(', ') || 'none'})`
    );
  }

  const result = await graphql(TRANSLATIONS_REGISTER, { resourceId: articleGid, translations });
  if (result.translationsRegister.userErrors.length > 0) {
    throw new Error(`translationsRegister userErrors: ${JSON.stringify(result.translationsRegister.userErrors)}`);
  }
}

// article: { title_bg, meta_bg, body_bg_html, summary_bg, title_en, meta_en,
//            body_en_html, summary_en, imageUrl, compliance: { passed, flags },
//            topic_id, linked_products }
// English is PRIMARY/canonical (main article fields, SEO); Bulgarian is
// registered as a Shopify translation (locale 'bg') on top of it.
export async function publishArticle(article) {
  // CRITICAL SAFETY GATE — must run before anything touches Shopify.
  // Deliberately an allowlist (must be === true), not a blocklist (=== false):
  // passed===false, compliance undefined/null, and compliance-with-no-"passed"-
  // field all fail this check and fall into the block branch. Only an explicit
  // passed:true lets execution reach the publish path below.
  if (config.pipeline.complianceMode === 'block' && article.compliance?.passed !== true) {
    const flags = article.compliance?.flags ?? [];

    console.error('COMPLIANCE BLOCK — refusing to publish. Flags:');
    if (flags.length === 0) {
      console.error('  (no flags — compliance result was missing or malformed, treated as unsafe)');
    }
    for (const flag of flags) {
      console.error(`  [${flag.severity}] (${flag.language}) ${flag.rule}: "${flag.quote}" — ${flag.reason}`);
    }

    const { error: topicError } = await supabase
      .from('topics')
      .update({ status: 'blocked', last_error: summarizeFlags(flags) })
      .eq('id', article.topic_id);
    if (topicError) {
      throw new Error(`Failed to mark topic as blocked: ${topicError.message}`);
    }

    const { error: articleError } = await supabase.from('articles').insert({
      store: STORE,
      topic_id: article.topic_id,
      title_bg: article.title_bg,
      title_en: article.title_en,
      summary_bg: article.summary_bg,
      linked_products: article.linked_products ?? [],
      compliance_flags: flags,
      status: 'blocked',
    });
    if (articleError) {
      throw new Error(`Failed to record blocked article row: ${articleError.message}`);
    }

    return { shopify_gid: null, handle: null, adminUrl: null, status: 'blocked' };
  }

  // PUBLISH (gate passed, or compliance mode isn't 'block')
  const blogGid = await resolveBlogGid();

  // TODO: confirm "global"/"description_tag" (type "single_line_text_field")
  // is still the correct reserved metafield for Article SEO meta description
  // on the 2026-07 API before relying on this in production.
  const articleInput = {
    blogId: blogGid,
    title: article.title_en,
    body: article.body_en_html,
    summary: article.summary_en,
    // TODO: confirm the desired author byline with the store owner.
    author: { name: 'CollagenLab' },
    isPublished: config.pipeline.publishStatus === 'published',
    metafields: [{ namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: article.meta_en }],
    ...(article.imageUrl ? { image: { url: article.imageUrl } } : {}),
  };

  const createData = await graphql(ARTICLE_CREATE, { article: articleInput });
  if (createData.articleCreate.userErrors.length > 0) {
    throw new Error(`articleCreate failed: ${JSON.stringify(createData.articleCreate.userErrors)}`);
  }

  const createdArticle = createData.articleCreate.article;

  try {
    await registerBulgarianTranslation(createdArticle.id, article);
  } catch (err) {
    console.warn(
      `publishArticle: Bulgarian translation registration failed, English article was still published — ${err.message}`
    );
  }

  const articleEmbedding = await embed(article.title_bg);
  const now = new Date().toISOString();

  // NOTE: the Shopify article above already exists at this point. If either
  // Supabase write below fails, the article is published but untracked in our
  // DB (no automatic rollback of the Shopify side). Worth reconciling by hand
  // if this ever throws — logged loudly rather than silently swallowed.
  const { error: topicError } = await supabase
    .from('topics')
    .update({ status: 'published', published_at: now })
    .eq('id', article.topic_id);
  if (topicError) {
    throw new Error(
      `Article ${createdArticle.id} was published to Shopify but failed to update its topics row: ${topicError.message}`
    );
  }

  const { error: articleError } = await supabase.from('articles').insert({
    store: STORE,
    topic_id: article.topic_id,
    shopify_gid: createdArticle.id,
    handle: createdArticle.handle,
    title_bg: article.title_bg,
    title_en: article.title_en,
    summary_bg: article.summary_bg,
    image_url: article.imageUrl,
    linked_products: article.linked_products ?? [],
    compliance_flags: article.compliance?.flags ?? [],
    cost_usd: article.costUsd ?? null,
    status: config.pipeline.publishStatus,
    embedding: articleEmbedding,
    published_at: now,
  });
  if (articleError) {
    throw new Error(
      `Article ${createdArticle.id} was published to Shopify but failed to insert its articles row: ${articleError.message}`
    );
  }

  return {
    shopify_gid: createdArticle.id,
    handle: createdArticle.handle,
    adminUrl: adminUrlFor(createdArticle.id),
    status: config.pipeline.publishStatus,
  };
}
