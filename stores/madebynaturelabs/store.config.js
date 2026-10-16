// Made By Nature Labs — store-specific settings.
//
// Everything in here is specific to THIS store. Shared engine defaults (model
// names, thresholds, pipeline behavior) stay in src/config.js, which merges
// this file over them at startup.
//
// NO SECRETS IN THIS FILE. It is committed. Secrets live in the environment;
// this file only declares the NAMES of the env vars that carry them.

import { PRODUCT_LINK } from './content.js';

// The blog GID comes from BLOG_GID_MADEBYNATURELABS (local .env / repository
// secret), so none is hardcoded here.
const BLOG_GID_TODO = null;

export default {
  id: 'madebynaturelabs',

  // Byline on published articles.
  brand: { name: 'Made By Nature Labs' },

  // English-only store: the English article goes in the main (canonical)
  // fields and no translation is registered (secondaryLocale null).
  primaryLocale: 'en',
  secondaryLocale: null,

  // 'draft' = articles are created Hidden in Shopify for manual review;
  // 'published' = they go live immediately.
  publishStatus: 'published',

  // Product catalog imported from data/products.csv (npm run
  // import-products-csv), not synced from Shopify. Each article links the most
  // relevant product (match_products, LINK_MIN_SIMILARITY); topics are still
  // grounded in content.js's TOPIC_CONTEXT.
  catalog: { enabled: true, source: 'csv' },

  // B2B anchor wording + claim-free display names — see content.js.
  productLink: PRODUCT_LINK,

  // Nearly every product description ends with the same private-label / MOQ
  // boilerplate, so a generic B2B topic ("cosmetics minimum order quantity")
  // clears LINK_MIN_SIMILARITY against random products. A real match also has
  // to beat the 30th-best product by 0.09 (measured on 45 calendar topics:
  // genuine matches >= 0.093, generic topics <= 0.089). Otherwise the article
  // falls back to the fixed CTA.
  linking: { minLift: 0.09, liftRank: 30 },

  // No product cutouts — featured images are text-only editorial scenes.
  image: { mode: 'scene-only' },

  // Fixed B2B call-to-action inserted by code before the disclaimer
  // (src/steps/insertCta.js) — only as the FALLBACK, when an article carries
  // no product link. The URL comes from B2B_CTA_URL_MADEBYNATURELABS, which is
  // required at startup.
  cta: {
    anchorEn: 'Request samples & pricing',
    leadInEn: 'Ready to develop this as your own private-label product?',
  },

  // Names of the env vars holding this store's credentials/identifiers.
  env: {
    // required
    shopifyStoreDomain: 'SHOPIFY_STORE_DOMAIN_MADEBYNATURELABS',
    shopifyClientId: 'SHOPIFY_CLIENT_ID_MADEBYNATURELABS',
    shopifyClientSecret: 'SHOPIFY_CLIENT_SECRET_MADEBYNATURELABS',
    // optional overrides of the non-secret defaults below
    storePublicDomain: 'STORE_PUBLIC_DOMAIN_MADEBYNATURELABS',
    blogGid: 'BLOG_GID_MADEBYNATURELABS',
  },

  shopify: {
    // Customer-facing storefront host for public article URLs.
    publicDomain: 'madebynaturelabs.com',
    blogGid: BLOG_GID_TODO,
  },
};
