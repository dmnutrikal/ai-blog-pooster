// CollagenLab — store-specific settings.
//
// Everything in here is specific to THIS store. Shared engine defaults (model
// names, thresholds, scene styles, anchor-text pools, pipeline behavior) stay
// in src/config.js, which deep-merges this file over them at startup.
//
// NO SECRETS IN THIS FILE. It is committed. Secrets live in the environment;
// this file only declares the NAMES of the env vars that carry them, so a
// second store can use differently-named vars (BLOG_GID_GUTEXPERT, etc.)
// without the engine knowing anything about either store.
export default {
  id: 'collagenlab',

  // Names of the env vars holding this store's credentials/identifiers.
  // src/config.js reads process.env[...] through these and requires the four
  // marked `required` below to be non-empty before the pipeline may start.
  env: {
    // required
    shopifyStoreDomain: 'SHOPIFY_STORE_DOMAIN',
    shopifyClientId: 'SHOPIFY_CLIENT_ID',
    shopifyClientSecret: 'SHOPIFY_CLIENT_SECRET',
    storePublicDomain: 'STORE_PUBLIC_DOMAIN',
    // optional — fall back to the defaults below when unset
    blogGid: 'BLOG_GID_COLLAGENLAB',
    primaryProductHandle: 'PRIMARY_PRODUCT_HANDLE_COLLAGENLAB',
  },

  shopify: {
    // Deferred to the first real publish run — publish.js falls back to
    // fetching+logging the store's default blog if this isn't set yet.
    // Currently supplied via BLOG_GID_COLLAGENLAB (.env / the Actions job env).
    blogGid: null,
  },

  products: {
    // Fallback product handle. When matchProduct.js finds no semantic match
    // confident enough to clear the guards, this product is used instead so
    // every article still carries a product link — see fetchPrimaryProduct().
    primaryHandle: 'collagen-lab-hydrolized-collagen-peptides',
  },
};
