import { pathToFileURL } from 'node:url';
import { config } from '../config.js';

// Loads the ACTIVE store's compliance profile from stores/<STORE>/regulatory.js.
// The engine never hardcodes a store's claim text or guardrails — each store
// owns its own file, because the authorised wording and the forbidden claims
// depend on the store's product category and market.
//
// Every store's regulatory.js must export the named constants re-exported
// below; that is the contract between the engine and a store folder (see
// stores/<id>/README.md). A store's approved-claim constants themselves
// (APPROVED_VITAMIN_C_CLAIM_*, APPROVED_LACTASE_CLAIM_*, ...) are store-specific
// and referenced from inside these blocks, not by the engine.
//
// Top-level await: the path is only known at runtime from config.store, but
// importers still get plain named constants.
const storeRegulatory = await import(pathToFileURL(config.store.paths.regulatory).href);

const REQUIRED_EXPORTS = [
  // Writer guardrails, one per article language (writeArticle.js).
  'WRITER_GUARDRAILS_BG',
  'WRITER_GUARDRAILS_EN',
  // Independent auditor brief, minus the JSON output format (compliance.js).
  'AUDIT_BRIEF',
  // Restrictions appended to every featured-image prompt (generateImage.js).
  'IMAGE_RULES',
  // Mandatory disclaimer, verbatim (linkArticles.js anchors on the BG one).
  'DISCLAIMER_BG',
  'DISCLAIMER_EN',
];

const missing = REQUIRED_EXPORTS.filter((name) => typeof storeRegulatory[name] !== 'string');
if (missing.length > 0) {
  throw new Error(
    `stores/${config.store.id}/regulatory.js is missing required export(s): ${missing.join(', ')}.`
  );
}

export const WRITER_GUARDRAILS_BG = storeRegulatory.WRITER_GUARDRAILS_BG;
export const WRITER_GUARDRAILS_EN = storeRegulatory.WRITER_GUARDRAILS_EN;
export const AUDIT_BRIEF = storeRegulatory.AUDIT_BRIEF;
export const IMAGE_RULES = storeRegulatory.IMAGE_RULES;
export const DISCLAIMER_BG = storeRegulatory.DISCLAIMER_BG;
export const DISCLAIMER_EN = storeRegulatory.DISCLAIMER_EN;

// The whole module, for store-specific constants (approved claims, etc).
export const regulatory = storeRegulatory;
