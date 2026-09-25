import { pathToFileURL } from 'node:url';
import { config } from '../config.js';

// Loads the ACTIVE store's approved claim wording from
// stores/<STORE>/regulatory.js. The engine never hardcodes a store's claim
// text — each store owns its own file, because the authorised wording depends
// on the store's product category and market.
//
// Every store's regulatory.js must export the named constants re-exported
// below; that is the contract between the engine and a store folder (see
// stores/<id>/README.md).
//
// Top-level await: the path is only known at runtime from config.store, but
// importers still get plain named constants, exactly as when this content
// lived at src/lib/regulatory.js.
const storeRegulatory = await import(pathToFileURL(config.store.paths.regulatory).href);

const REQUIRED_EXPORTS = ['APPROVED_VITAMIN_C_CLAIM_BG', 'APPROVED_VITAMIN_C_CLAIM_EN'];

const missing = REQUIRED_EXPORTS.filter((name) => typeof storeRegulatory[name] !== 'string');
if (missing.length > 0) {
  throw new Error(
    `stores/${config.store.id}/regulatory.js is missing required export(s): ${missing.join(', ')}.`
  );
}

export const APPROVED_VITAMIN_C_CLAIM_BG = storeRegulatory.APPROVED_VITAMIN_C_CLAIM_BG;
export const APPROVED_VITAMIN_C_CLAIM_EN = storeRegulatory.APPROVED_VITAMIN_C_CLAIM_EN;

// The whole module, for anything a future store adds beyond the two constants.
export const regulatory = storeRegulatory;
