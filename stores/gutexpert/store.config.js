// GutExpert — store-specific settings.
//
// Everything in here is specific to THIS store. Shared engine defaults (model
// names, thresholds, scene styles, pipeline behavior) stay in src/config.js,
// which merges this file over them at startup.
//
// NO SECRETS IN THIS FILE. It is committed. Secrets live in the environment;
// this file only declares the NAMES of the env vars that carry them.
export default {
  id: 'gutexpert',

  // Byline on published articles.
  brand: { name: 'GutExpert' },

  // Article language direction. The shop's base language is Bulgarian, so the
  // Bulgarian article goes in the main (canonical) article fields and the
  // English one is registered as its 'en' Shopify translation.
  primaryLocale: 'bg',
  secondaryLocale: 'en',

  // 'draft' = articles are created Hidden in Shopify for manual review;
  // 'published' = they go live immediately. Hidden until the content is
  // approved — switch to 'published' then.
  publishStatus: 'draft',

  // Names of the env vars holding this store's credentials/identifiers.
  // src/config.js reads process.env[...] through these and requires the three
  // Shopify credentials below to be non-empty before the pipeline may start.
  env: {
    // required
    shopifyStoreDomain: 'SHOPIFY_STORE_DOMAIN_GUTEXPERT',
    shopifyClientId: 'SHOPIFY_CLIENT_ID_GUTEXPERT',
    shopifyClientSecret: 'SHOPIFY_CLIENT_SECRET_GUTEXPERT',
    // optional overrides of the non-secret defaults below
    storePublicDomain: 'STORE_PUBLIC_DOMAIN_GUTEXPERT',
    blogGid: 'BLOG_GID_GUTEXPERT',
    primaryProductHandle: 'PRIMARY_PRODUCT_HANDLE_GUTEXPERT',
  },

  shopify: {
    // Customer-facing storefront host for public article URLs. Not a secret —
    // hardcoded here, so STORE_PUBLIC_DOMAIN_GUTEXPERT is optional.
    publicDomain: 'gutexpert.bg',
    // "GutExpert Academy" (handle "academy") — the shop's only blog, fetched
    // via the Admin API when this store was wired up.
    blogGid: 'gid://shopify/Blog/125275472217',
  },

  products: {
    // Fallback product handle when matchProduct.js finds no confident match.
    primaryHandle: 'probiotic-complex',
  },

  // Anchor text pools for the product links (see collagenlab's store.config.js
  // for how they're used). Four different products, so the inline anchors are
  // per product (byHandle) — a generic "probiotic" anchor must never end up
  // linking to the lactase product. Anchors are category/product names only,
  // never a benefit ("за храносмилане", "for gut health", ...).
  //
  // nameBg/nameEn replace the Shopify product title in the writer prompt: the
  // shop's titles carry claims after the dash ("– подкрепа за чревната
  // бариера", "– при лактозна непоносимост") that must not leak into articles.
  productLink: {
    inlineAnchorsBg: ['GutExpert'],
    ctaAnchorsBg: ['Разгледайте продукта', 'Вижте повече', 'Научете повече за продукта', 'Вижте GutExpert'],
    inlineAnchorsEn: ['GutExpert'],
    ctaAnchorsEn: ['View the product', 'Shop now', 'Learn more', 'Discover GutExpert'],
    byHandle: {
      'probiotic-complex': {
        nameBg: 'GutExpert® Advanced Probiotic Complex',
        nameEn: 'GutExpert® Advanced Probiotic Complex',
        inlineAnchorsBg: ['пробиотик комплекс', 'GutExpert Advanced Probiotic Complex', 'пробиотик с 50 щама'],
        inlineAnchorsEn: ['probiotic complex', 'GutExpert Advanced Probiotic Complex', '50-strain probiotic'],
      },
      'multi-enzyme-complex': {
        nameBg: 'GutExpert® Мулти Ензимен Комплекс',
        nameEn: 'GutExpert® Multi-Enzyme Complex',
        inlineAnchorsBg: ['храносмилателни ензими', 'мулти ензимен комплекс', 'GutExpert Мулти Ензимен Комплекс'],
        inlineAnchorsEn: ['digestive enzymes', 'multi-enzyme complex', 'GutExpert Multi-Enzyme Complex'],
      },
      'butyrate-tributyrin': {
        nameBg: 'GutExpert® Бутират (Трибутирин)',
        nameEn: 'GutExpert® Butyrate (Tributyrin)',
        inlineAnchorsBg: ['трибутирин', 'бутират (трибутирин)', 'GutExpert Бутират'],
        inlineAnchorsEn: ['tributyrin', 'butyrate (tributyrin)', 'GutExpert Butyrate'],
      },
      lactase: {
        nameBg: 'GutExpert® Лактаза 20 000 ALU',
        nameEn: 'GutExpert® Lactase 20,000 ALU',
        inlineAnchorsBg: ['лактаза', 'ензим лактаза', 'GutExpert Лактаза'],
        inlineAnchorsEn: ['lactase', 'lactase enzyme', 'GutExpert Lactase'],
      },
    },
  },
};
