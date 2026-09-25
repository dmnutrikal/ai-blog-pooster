import 'dotenv/config';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const COMPLIANCE_MODES = new Set(['log', 'block', 'off']);
const PUBLISH_STATUSES = new Set(['draft', 'published']);

// Repo root — src/config.js -> src/ -> <root>.
const ROOT_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STORES_DIR = path.join(ROOT_DIR, 'stores');

// The active store. Everything store-specific (credentials, regulatory
// wording, product cutouts, editorial calendar) is resolved from
// stores/<STORE>/ — so adding a store is a new folder plus its secrets, with
// no engine code change. Defaults to collagenlab, which is what every run did
// before this was configurable.
export const STORE = (process.env.STORE ?? 'collagenlab').trim();

const STORE_DIR = path.join(STORES_DIR, STORE);
const STORE_CONFIG_PATH = path.join(STORE_DIR, 'store.config.js');

if (!existsSync(STORE_CONFIG_PATH)) {
  throw new Error(
    `Unknown store "${STORE}": no store config at ${STORE_CONFIG_PATH}. ` +
      'See stores/<id>/README.md for what a store folder needs.'
  );
}

// Top-level await: the store config has to be chosen at runtime from STORE, but
// every consumer still imports a plain, fully-resolved `config` object.
const storeConfig = (await import(pathToFileURL(STORE_CONFIG_PATH).href)).default;

if (storeConfig.id !== STORE) {
  throw new Error(
    `Store config mismatch: stores/${STORE}/store.config.js declares id "${storeConfig.id}". ` +
      'The folder name and the id must match.'
  );
}

// Per-store paths. Anything the engine loads off disk for a store resolves
// through here — never a hardcoded assets/ or data/ path.
const storePaths = {
  root: STORE_DIR,
  // Product cutout PNGs for the featured image (src/steps/generateImage.js).
  products: path.join(STORE_DIR, 'products'),
  // Editorial calendar and friends (src/steps/loadCalendar.js).
  data: path.join(STORE_DIR, 'data'),
  // Recipe images. Reserved — nothing reads this yet.
  recipes: path.join(STORE_DIR, 'recipes'),
  // Approved claim wording. src/lib/storeRegulatory.js loads this for the active
  // store; compliance.js and writeArticle.js import it from there.
  regulatory: path.join(STORE_DIR, 'regulatory.js'),
};

const env = storeConfig.env ?? {};

// Shared across every store...
const REQUIRED_SHARED_VARS = ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY'];

// ...and the store's own credentials, under whatever var names it declares.
// Required — the pipeline cannot run at all without these.
const REQUIRED_VARS = [
  ...REQUIRED_SHARED_VARS,
  env.shopifyStoreDomain,
  env.shopifyClientId,
  env.shopifyClientSecret,
  env.storePublicDomain,
].filter(Boolean);

function missingVars() {
  return REQUIRED_VARS.filter((key) => !process.env[key] || process.env[key].trim() === '');
}

function assertValid() {
  const missing = missingVars();
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s) for store "${STORE}": ${missing.join(', ')}. ` +
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

// Reads a store-declared env var, falling back to the store config's own
// non-secret default. Secrets have no default and are validated above.
function fromStoreEnv(varName, fallback = null) {
  const value = varName ? process.env[varName] : undefined;
  return value && value.trim() !== '' ? value : fallback;
}

export const config = {
  // Identity + on-disk location of the active store.
  store: {
    id: STORE,
    dir: STORE_DIR,
    paths: storePaths,
  },
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
    storeDomain: fromStoreEnv(env.shopifyStoreDomain),
    // The customer-facing storefront host used to build public URLs (article
    // links, etc). NOT necessarily the same as storeDomain (the *.myshopify.com
    // admin/API host) or the shop's primaryDomain — confirmed live for
    // collagenlab: products' onlineStoreUrl resolves on collagenlab.bg, which is
    // neither the admin domain nor shop.primaryDomain (collagenlab.eu).
    publicDomain: fromStoreEnv(env.storePublicDomain),
    clientId: fromStoreEnv(env.shopifyClientId),
    clientSecret: fromStoreEnv(env.shopifyClientSecret),
    apiVersion: process.env.SHOPIFY_API_VERSION ?? '2026-07',
    // Deferred to the first real publish run — publish.js falls back to
    // fetching+logging the store's default blog if this isn't set yet.
    blogGid: fromStoreEnv(env.blogGid, storeConfig.shopify?.blogGid ?? null),
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
    // TODO: tune this list as the catalog grows.
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
    // stores/<STORE>/products/ (see generateImage.js's listFlavors()), that exact flavor is
    // used instead of picking one at random. Unset in normal pipeline runs.
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
    // Fallback product handle for the ACTIVE store. When matchProduct.js finds
    // no semantic match confident enough to clear the guards, this product is
    // used instead so every article still carries a product link — see
    // matchProduct.js's fetchPrimaryProduct(). Declared in
    // stores/<STORE>/store.config.js, overridable via that store's env var.
    primaryHandle: fromStoreEnv(env.primaryProductHandle, storeConfig.products?.primaryHandle ?? null),
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
