// Made By Nature Labs — store-specific settings.
//
// Everything in here is specific to THIS store. Shared engine defaults (model
// names, thresholds, pipeline behavior) stay in src/config.js, which merges
// this file over them at startup.
//
// NO SECRETS IN THIS FILE. It is committed. Secrets live in the environment;
// this file only declares the NAMES of the env vars that carry them.

// TODO(blogGid): no MADEBYNATURELABS Shopify credentials were available when
// this store was wired up, so the blog GID is unknown. Once
// SHOPIFY_*_MADEBYNATURELABS are set, fetch it (Admin API `blogs { id title }`)
// and put it here or in BLOG_GID_MADEBYNATURELABS. Until then publish.js falls
// back to the shop's first blog and logs its GID.
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
  publishStatus: 'draft',

  // No Shopify product catalog to sync, match or link — topics are grounded
  // in content.js's TOPIC_CONTEXT instead.
  catalog: { enabled: false },

  // No product cutouts — featured images are text-only editorial scenes.
  image: { mode: 'scene-only' },

  // Fixed B2B call-to-action inserted by code before the disclaimer
  // (src/steps/insertCta.js). The URL comes from B2B_CTA_URL_MADEBYNATURELABS,
  // which is required at startup.
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
