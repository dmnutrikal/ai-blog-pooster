// Nutrikal — editorial voice for the shared engine's prompts.
//
// Who the store is and who it writes for. Compliance wording (authorised
// claims, novel food, auditor rules, image restrictions, disclaimer) is NOT
// here — that is regulatory.js. Loaded for the active store by
// src/lib/storeContent.js.
//
// English-only, CSV catalog, image.mode 'scene-only' (see store.config.js), so
// the loader needs WRITER_STORE_EN, LINK_EXAMPLES, TOPIC_BRIEF and
// IMAGE.lifestyleSubject (+ the optional TOPIC_CONTEXT). No WRITER_STORE_BG or
// IMAGE product-cutout fields — nothing reads them for this store.
// PRODUCT_LINK is imported by store.config.js (its productLink).

import { readFileSync } from 'node:fs';

// "You are an expert English SEO content writer for <this>." (writeArticle.js)
export const WRITER_STORE_EN = `Nutrikal, an EU private-label and contract food supplement
manufacturer. The readers are brand owners and businesses sourcing private-label or
contract-manufactured supplements — write like an experienced formulation, regulatory and
production expert advising them: practical, specific, commercially aware, no hype, no
consumer-style health promises. Speak about the company as "we" / "our team"`;

// Examples + wording in the English product-link instructions (writeArticle.js).
export const LINK_EXAMPLES = {
  anchorEn: '"our Magnesium Glycinate formula"',
  contextEn:
    'choose a ready-to-brand formula for a new supplement range, or which formats a private-label ' +
    'line typically starts with',
  regulationEn: 'Regulations (EC) 1924/2006 and (EU) 2015/2283',
  disclaimerNameEn: 'food supplement disclaimer',
  ctaExampleEn:
    '<p>Ready to develop this as your own private-label supplement? <a href="URL">Request samples ' +
    'of our Magnesium Glycinate formula</a>.</p>',
};

// Products whose whole name is a health or function claim. The writer and the
// anchors never see these names — they get the neutral wording in
// NEUTRAL_PRODUCT_LINK instead; the link still goes to the real product page.
const CLAIM_NAMED_PRODUCTS = [
  'Appetite Suppressing Formula',
  'Beauty Collagen Glow™ Collagen Drink Mix',
  'Blood Sugar Support Complex',
  'Calm Focus Formula',
  'Candida Cleanse Complex',
  'Cholesterol Support',
  'Cognitive Support Complex',
  'Colon Cleanse Complex',
  'Constipation Support',
  'DeepRest™ Night Recovery & Relaxation Drink Mix',
  'Estrogen Control Formula',
  'FemFlow™ Female Hormone Balance Drink Mix',
  'GameMode+™ Performance Drink Mix',
  'Gluco Signal™ Metabolism Support Formula',
  'Gut Lining Restore Formula',
  'GutEase™ Daily Digest',
  'Hair Support Formula',
  'Heart Support Formula',
  'Horny Goat Weed',
  'Immune Support Formula',
  'Joint Support Complex',
  'Liver Support Formula',
  'MindFuel™ Nootropic Drink Mix',
  'NeuroCalm™ Relaxation & Balance Drink Mix',
  'Prostate Health Complex',
  'Sleep Support Complex',
  'Sleep Support Complex 2',
  'Testosterone Support',
  'Thermogenic Formula',
  'Thyroid Support Complex',
  'Weigh Management Formula',
];

const NEUTRAL_PRODUCT_LINK = {
  nameEn: 'related private-label formula',
  inlineAnchorsEn: ['our related private-label formula', 'a related formula from our private-label range'],
  ctaAnchorsEn: ['Explore our related private-label formula', 'Request samples of our related private-label formula'],
};

// Benefit words stripped from every other product name before the writer or
// an anchor sees it (a safety net — the claim-named products above are the
// ones that actually carry them).
const CLAIM_WORDS = [
  'support', 'booster', 'boost', 'management', 'relief', 'burning', 'suppressing', 'suppress',
  'control', 'detox', 'anti-inflammatory', 'thermogenic', 'testosterone', 'libido', 'appetite', 'fat',
];

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function productDisplayName(name) {
  let out = name.replace(/™/g, '');
  for (const word of CLAIM_WORDS) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi'), ' ');
  }
  out = out.replace(/\s{2,}/g, ' ').trim();
  return out || NEUTRAL_PRODUCT_LINK.nameEn;
}

// The claim-named products by handle (the slug in data/products.csv's URL, as
// importProductsCsv.js derives it), for PRODUCT_LINK.byHandle. Fails loudly if
// a name above is missing from the CSV, so a renamed product can't silently
// fall back to its claim name.
function claimNamedByHandle() {
  const csv = readFileSync(new URL('./data/products.csv', import.meta.url), 'utf8');
  const handleByName = new Map();
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const cut = line.lastIndexOf(',https://');
    if (cut === -1) continue;
    const name = line.slice(0, cut).replace(/^"|"$/g, '').trim();
    const slug = /\/products\/([^/?#]+)/.exec(line.slice(cut + 1))?.[1];
    if (slug) handleByName.set(name, decodeURIComponent(slug));
  }
  const missing = CLAIM_NAMED_PRODUCTS.filter((name) => !handleByName.has(name));
  if (missing.length > 0) {
    throw new Error(`stores/nutrikal/content.js: claim-named product(s) not in data/products.csv: ${missing.join(', ')}`);
  }
  return Object.fromEntries(CLAIM_NAMED_PRODUCTS.map((name) => [handleByName.get(name), NEUTRAL_PRODUCT_LINK]));
}

// Anchor pools for the product link (index.js picks one inline + one CTA
// anchor per article; {product} is the display name above). B2B wording —
// formulas a brand can private-label, never consumer "buy now" or a benefit.
export const PRODUCT_LINK = {
  inlineAnchorsEn: [
    'our {product} formula',
    'our private-label {product} formula',
    'the {product} formula in our private-label range',
  ],
  ctaAnchorsEn: [
    'Request samples of our {product} formula',
    'Explore our private-label {product} formula',
    'See the {product} formula you can private-label',
  ],
  displayNameEn: productDisplayName,
  byHandle: claimNamedByHandle(),
};

// Grounds generateTopics.js in place of the product list (whose names and
// URLs carry claim wording).
export const TOPIC_CONTEXT = `
Nutrikal is an EU private-label and contract food supplement manufacturer.

WHO WE WRITE FOR: brand owners, founders and businesses (supplement and wellness start-ups,
established nutrition brands extending a range, sports-nutrition brands, pharmacies and
retailers building an own-label line, practitioners and creators launching a product) who are
sourcing a private-label or contract-manufacturing partner.

SERVICES:
- Private label — ready-to-brand supplement formulas the client puts their own brand on.
- White label — existing products supplied for rebranding with minimal changes.
- Custom formulation — bespoke formulas developed to the brand's brief, within EU rules.
- Contract manufacturing — production at scale to the brand's specification.
- Minimum order quantities — discussed per project and format (no fixed figure published).
- Sample process — the brand requests samples, refines the formula, then moves to production.
- Certifications and quality — what brands should look for in a supplier (GMP, ISO 22000 /
  FSSC 22000, HACCP, organic, vegan, halal/kosher), stability testing, certificates of analysis.
- Supplement formats — capsules (incl. vegetarian shells), tablets, powders, gummies, liquids,
  softgels, sachets/stick packs.

EDITORIAL PILLARS (spread topics across all seven):
1. Starting and launching your own supplement brand
2. Private label, white label and finding a manufacturer
3. Product categories and own-brand opportunities
4. Ingredients and raw materials
5. Supplement trends and product innovation
6. Formats and custom product development
7. Launch execution, costs and business audiences
`.trim();

// Topic generator brief (src/steps/generateTopics.js).
export const TOPIC_BRIEF = `
You are an English B2B SEO content strategist for Nutrikal, an EU private-label and contract
food supplement manufacturer (see STORE CONTEXT below).

TASK: Propose NEW English blog topics as {keyword, angle} pairs (e.g. keyword="private label
supplements minimum order quantity", angle="Private label, white label and finding a manufacturer").

REQUIREMENTS:
- "keyword" is a short English search phrase a brand owner would type (lowercase, no
  punctuation). "angle" is exactly one of the seven EDITORIAL PILLARS in STORE CONTEXT.
- Every topic must be useful to someone planning, launching or scaling a supplement brand with
  a manufacturing partner — not consumer health advice.
- Spread topics across all seven pillars and across intents (how-to, comparison, cost/MOQ,
  checklist, explainer, trend analysis).
- Every proposed topic MUST NOT duplicate or closely paraphrase any keyword in EXISTING
  KEYWORDS, nor closely paraphrase the topic of any title in RECENTLY PUBLISHED TITLES.
- Topics must suit EU food-supplement-compliant articles (Regulation (EC) 1924/2006, (EU)
  2015/2283): NEVER a topic framed around preventing, treating or curing a disease or condition
  (diabetes, anxiety, insomnia, joint pain, IBS...), around an unauthorised health benefit
  ("immune boosting", "detox", "fat burning", "hormone balance"), or around an ingredient that
  lacks novel-food authorisation (e.g. CBD) as a launch option. Formulation, format, regulation,
  quality and business topics are fine.
`.trim();

// Featured-image styling (src/steps/generateImage.js). image.mode is
// 'scene-only', so only lifestyleSubject is used.
export const IMAGE = {
  lifestyleSubject:
    'Subject matter: clean, editorial styling for a food supplement manufacturer — for example ' +
    'raw supplement ingredients (botanical powders, dried herbs and roots, berries, seeds, ' +
    'mineral powders) arranged in small bowls or on a neutral surface; unbranded empty capsule ' +
    'shells, tablets or powder textures shown as production materials; glass lab beakers, ' +
    'precision scales and quality-control benchwork in a bright modern laboratory; or clean ' +
    'production details such as encapsulation or blending equipment. Hands in gloves may appear ' +
    'at work, but no person\'s face is the focus. No product packaging mockups or branded ' +
    'bottles, jars or pouches.',
};
