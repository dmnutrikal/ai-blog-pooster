import { pathToFileURL } from 'node:url';
import { config } from '../config.js';

// Loads the ACTIVE store's editorial voice from stores/<STORE>/content.js —
// who the store is and what it sells, as the prompts describe it. The engine's
// prompts own only task structure and output formats; everything store-flavored
// comes from here (compliance wording comes from storeRegulatory.js instead).
//
// Same contract style as storeRegulatory.js: every store's content.js must
// export the names checked below.
const storeContent = await import(pathToFileURL(config.store.paths.content).href);

// Per-language and per-feature exports are required only when the store uses
// them (config.store.locales, config.catalog.enabled, config.image.mode).
const { locales } = config.store;
const REQUIRED = {
  // "You are an expert <language> SEO content writer for <this>." (writeArticle.js)
  ...(locales.includes('bg') ? { WRITER_STORE_BG: 'string' } : {}),
  ...(locales.includes('en') ? { WRITER_STORE_EN: 'string' } : {}),
  // { anchorBg, contextBg, anchorEn, contextEn } — examples in the product-link
  // instructions (writeArticle.js). Only stores with a catalog link products.
  ...(config.catalog.enabled ? { LINK_EXAMPLES: 'object' } : {}),
  // Topic generator brief, minus the JSON output format (generateTopics.js).
  TOPIC_BRIEF: 'string',
  // { packaging, describeReference(label), propsFor(label), lifestyleSubject }
  // (generateImage.js). The product fields are checked below.
  IMAGE: 'object',
};

const missing = Object.entries(REQUIRED)
  .filter(([name, type]) => typeof storeContent[name] !== type || storeContent[name] === null)
  .map(([name]) => name);
if (missing.length > 0) {
  throw new Error(`stores/${config.store.id}/content.js is missing required export(s): ${missing.join(', ')}.`);
}

// IMAGE fields: lifestyleSubject is always used (the text-only scene); the
// product-cutout fields only by image.mode 'product-scene'.
const IMAGE_FIELDS = {
  lifestyleSubject: 'string',
  ...(config.image.mode === 'product-scene'
    ? { packaging: 'string', describeReference: 'function', propsFor: 'function' }
    : {}),
};
const missingImage = Object.entries(IMAGE_FIELDS)
  .filter(([name, type]) => typeof storeContent.IMAGE[name] !== type)
  .map(([name]) => `IMAGE.${name}`);
if (missingImage.length > 0) {
  throw new Error(`stores/${config.store.id}/content.js is missing required field(s): ${missingImage.join(', ')}.`);
}

// TOPIC_CONTEXT (optional string): what a catalog-less store is about —
// grounds generateTopics.js in place of the product list.
if (storeContent.TOPIC_CONTEXT !== undefined && typeof storeContent.TOPIC_CONTEXT !== 'string') {
  throw new Error(`stores/${config.store.id}/content.js: TOPIC_CONTEXT must be a string when set.`);
}

export const WRITER_STORE_BG = storeContent.WRITER_STORE_BG;
export const WRITER_STORE_EN = storeContent.WRITER_STORE_EN;
export const LINK_EXAMPLES = storeContent.LINK_EXAMPLES;
export const TOPIC_BRIEF = storeContent.TOPIC_BRIEF;
export const IMAGE = storeContent.IMAGE;
export const TOPIC_CONTEXT = storeContent.TOPIC_CONTEXT ?? null;
