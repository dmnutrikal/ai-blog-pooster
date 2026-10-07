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

  // Byline on published articles.
  brand: { name: 'CollagenLab' },

  // Article language direction. publish.js writes the PRIMARY locale into the
  // main (canonical) article fields and registers the SECONDARY locale as a
  // Shopify translation on top. Each must be 'en' or 'bg' — the two languages
  // writeArticle.js generates.
  primaryLocale: 'en',
  secondaryLocale: 'bg',

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

  // Anchor text pools for the product link(s) woven into an article — one
  // inline anchor and one CTA anchor are chosen at random per article (see
  // index.js's processTopic()) so articles don't all read "Exact Product
  // Name" verbatim. writeArticle.js falls back to the full product name if
  // a pool is empty. Optional `byHandle: { <handle>: { inlineAnchorsBg, ... } }`
  // overrides pools for one product.
  productLink: {
    inlineAnchorsBg: ['колаген', 'колаген за кожа', 'телешки колаген', 'CollagenLab', 'хидролизиран телешки колаген'],
    ctaAnchorsBg: ['Поръчайте сега', 'Кликнете тук', 'Разгледайте продукта', 'Вижте CollagenLab'],
    inlineAnchorsEn: ['collagen', 'collagen for skin', 'bovine collagen', 'CollagenLab', 'hydrolysed bovine collagen'],
    ctaAnchorsEn: ['Order now', 'Shop now', 'Check it out', 'Discover CollagenLab'],
  },
};
