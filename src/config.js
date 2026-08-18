import 'dotenv/config';

const COMPLIANCE_MODES = new Set(['log', 'block', 'off']);
const PUBLISH_STATUSES = new Set(['draft', 'published']);

// Required — the pipeline cannot run at all without these.
const REQUIRED_VARS = [
  'OPENAI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SHOPIFY_STORE_DOMAIN',
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CLIENT_SECRET',
  'STORE_PUBLIC_DOMAIN',
];

function missingVars() {
  return REQUIRED_VARS.filter((key) => !process.env[key] || process.env[key].trim() === '');
}

function assertValid() {
  const missing = missingVars();
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill them in.'
    );
  }

  const complianceMode = process.env.COMPLIANCE_MODE ?? 'block';
  if (!COMPLIANCE_MODES.has(complianceMode)) {
    throw new Error(
      `Invalid COMPLIANCE_MODE "${complianceMode}". Must be one of: ${[...COMPLIANCE_MODES].join(', ')}.`
    );
  }

  const publishStatus = process.env.PUBLISH_STATUS ?? 'draft';
  if (!PUBLISH_STATUSES.has(publishStatus)) {
    throw new Error(
      `Invalid PUBLISH_STATUS "${publishStatus}". Must be one of: ${[...PUBLISH_STATUSES].join(', ')}.`
    );
  }
}

// Fail loudly and immediately on import — better to crash at startup than
// halfway through generating an article.
assertValid();

export const config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    models: {
      terra: process.env.OPENAI_MODEL_TERRA ?? 'gpt-5.6-terra',
      luna: process.env.OPENAI_MODEL_LUNA ?? 'gpt-5.6-luna',
      // gpt-image-2 (not gpt-image-1/-1.5) — validated via prototyping that gpt-image-2 reliably
      // reproduces the product label's exact text when used as an edit-endpoint reference image,
      // where gpt-image-1 consistently garbled it regardless of prompt wording. Used for both
      // the product-in-scene edit call and the plain text-to-image fallback (generateImage.js).
      image: process.env.OPENAI_MODEL_IMAGE ?? 'gpt-image-2',
      embedding: process.env.OPENAI_MODEL_EMBEDDING ?? 'text-embedding-3-small',
    },
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
  },
  shopify: {
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN,
    // The customer-facing storefront host used to build public URLs (article
    // links, etc). NOT necessarily the same as storeDomain (the *.myshopify.com
    // admin/API host) or the shop's primaryDomain — confirmed live for this
    // store: products' onlineStoreUrl resolves on collagenlab.bg, which is
    // neither the admin domain nor shop.primaryDomain (collagenlab.eu).
    publicDomain: process.env.STORE_PUBLIC_DOMAIN,
    clientId: process.env.SHOPIFY_CLIENT_ID,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    apiVersion: process.env.SHOPIFY_API_VERSION ?? '2026-07',
    // Deferred to the first real publish run — publish.js falls back to
    // fetching+logging the store's default blog if this isn't set yet.
    blogGid: process.env.BLOG_GID_COLLAGENLAB || null,
  },
  pipeline: {
    complianceMode: process.env.COMPLIANCE_MODE ?? 'block',
    articlesPerRun: Number(process.env.ARTICLES_PER_RUN ?? 1),
    publishStatus: process.env.PUBLISH_STATUS ?? 'draft',
  },
  linking: {
    // Below this cosine similarity, a product match is too weak to be a
    // genuine recommendation — skip it rather than force an irrelevant link.
    minSimilarity: Number(process.env.LINK_MIN_SIMILARITY ?? 0.35),
    // Products whose title/product_type match one of these (case-insensitive,
    // substring) are accessories, not supplements, and are never linked as a
    // "related product" — e.g. a dosing scoop is semantically close to any
    // collagen article but isn't a genuine supplement recommendation.
    // TODO: tune this list as CollagenLab's catalog grows.
    accessoryKeywords: (
      process.env.ACCESSORY_KEYWORDS ?? 'spoon,scoop,лъжичка,мерителна,аксесоар,accessory'
    )
      .split(',')
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean),
  },
  image: {
    // Blog thumbnail, not a hero image — keep size/quality modest for cost.
    size: process.env.IMAGE_SIZE ?? '1024x1024',
    quality: process.env.IMAGE_QUALITY ?? 'medium',
    // Test/trial-run override — when set to a slug matching a filename discovered in
    // assets/products/ (see generateImage.js's listFlavors()), that exact flavor is used
    // instead of picking one at random. Unset in normal pipeline runs.
    forceFlavorSlug: process.env.IMAGE_FORCE_FLAVOR || null,
    // Background/surface variety for the product-in-scene edit prompt — one is picked at random
    // per article so featured images don't all look like the same setting with a different
    // pouch. The composition rules (three-quarter angle, rule-of-thirds placement, depth of
    // field, scale, shadow, lighting, label fidelity) are shared across all styles — see
    // generateImage.js's buildProductScenePrompt.
    sceneStyles: [
      {
        name: 'kitchen-counter',
        sceneText:
          'A bright kitchen countertop, soft morning natural light, a light wood or marble ' +
          'surface, a window or greenery softly visible in the background.',
      },
      {
        name: 'wooden-table',
        sceneText:
          'A rustic wooden dining or breakfast table, natural wood grain, warm natural ' +
          'daylight, relaxed homely mood.',
      },
      {
        name: 'cutting-board',
        sceneText:
          'A wooden cutting board resting on a kitchen counter, soft window light, clean ' +
          'minimal styling.',
      },
      {
        name: 'minimal-shelf',
        sceneText:
          'A minimal wooden side-table or shelf surface against a soft neutral wall, gentle ' +
          'natural light, calm uncluttered editorial mood.',
      },
    ],
  },
  products: {
    // Per-store fallback product handle. When matchProduct.js finds no
    // semantic match confident enough to clear the guards, this product is
    // used instead so every article still carries a product link — see
    // matchProduct.js's fetchPrimaryProduct(). Keyed by the same store name
    // used as the STORE constant in matchProduct.js/publish.js/etc.
    primaryHandleByStore: {
      collagenlab: process.env.PRIMARY_PRODUCT_HANDLE_COLLAGENLAB || 'collagen-lab-hydrolized-collagen-peptides',
    },
  },
  productLink: {
    // Anchor text pools for the product link(s) woven into an article — one
    // inline anchor and one CTA anchor are chosen at random per article (see
    // index.js's processTopic()) so articles don't all read "Exact Product
    // Name" verbatim. writeArticle.js falls back to the full product name if
    // no anchor is provided (e.g. no product matched for the topic).
    inlineAnchorsBg: ['колаген', 'колаген за кожа', 'телешки колаген', 'CollagenLab', 'хидролизиран телешки колаген'],
    ctaAnchorsBg: ['Поръчайте сега', 'Кликнете тук', 'Разгледайте продукта', 'Вижте CollagenLab'],
    inlineAnchorsEn: ['collagen', 'collagen for skin', 'bovine collagen', 'CollagenLab', 'hydrolysed bovine collagen'],
    ctaAnchorsEn: ['Order now', 'Shop now', 'Check it out', 'Discover CollagenLab'],
  },
  topics: {
    // If a run finds fewer than this many 'pending' topics for the store,
    // index.js auto-generates more via generateTopics.js before picking a
    // topic — see the trigger at the start of run().
    minPending: Number(process.env.MIN_PENDING_TOPICS ?? 5),
    // How many NEW topics generateTopics.js proposes per auto-generation call.
    generateCount: Number(process.env.TOPICS_GENERATE_COUNT ?? 15),
  },
};

export default config;
