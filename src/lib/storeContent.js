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

const REQUIRED = {
  // "You are an expert <language> SEO content writer for <this>." (writeArticle.js)
  WRITER_STORE_BG: 'string',
  WRITER_STORE_EN: 'string',
  // { anchorBg, contextBg, anchorEn, contextEn } — examples in the product-link
  // instructions (writeArticle.js).
  LINK_EXAMPLES: 'object',
  // Topic generator brief, minus the JSON output format (generateTopics.js).
  TOPIC_BRIEF: 'string',
  // { packaging, describeReference(label), propsFor(label), lifestyleSubject }
  // (generateImage.js).
  IMAGE: 'object',
};

const missing = Object.entries(REQUIRED)
  .filter(([name, type]) => typeof storeContent[name] !== type || storeContent[name] === null)
  .map(([name]) => name);
if (missing.length > 0) {
  throw new Error(`stores/${config.store.id}/content.js is missing required export(s): ${missing.join(', ')}.`);
}

export const WRITER_STORE_BG = storeContent.WRITER_STORE_BG;
export const WRITER_STORE_EN = storeContent.WRITER_STORE_EN;
export const LINK_EXAMPLES = storeContent.LINK_EXAMPLES;
export const TOPIC_BRIEF = storeContent.TOPIC_BRIEF;
export const IMAGE = storeContent.IMAGE;
