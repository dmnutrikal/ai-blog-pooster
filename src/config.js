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
      image: process.env.OPENAI_MODEL_IMAGE ?? 'gpt-image-1.5',
      embedding: process.env.OPENAI_MODEL_EMBEDDING ?? 'text-embedding-3-small',
    },
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
  },
  shopify: {
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN,
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
  },
};

export default config;
