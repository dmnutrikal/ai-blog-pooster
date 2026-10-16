// Made By Nature Labs — editorial voice for the shared engine's prompts.
//
// Who the store is and who it writes for. Compliance wording (forbidden
// claims, auditor rules, image restrictions, disclaimer) is NOT here — that is
// regulatory.js. Loaded for the active store by src/lib/storeContent.js.
//
// English-only, CSV catalog, image.mode 'scene-only' (see store.config.js), so
// the loader needs WRITER_STORE_EN, LINK_EXAMPLES, TOPIC_BRIEF and
// IMAGE.lifestyleSubject (+ the optional TOPIC_CONTEXT). No WRITER_STORE_BG or
// IMAGE product-cutout fields — nothing reads them for this store.
// PRODUCT_LINK is imported by store.config.js (its productLink).

// "You are an expert English SEO content writer for <this>." (writeArticle.js)
export const WRITER_STORE_EN = `Made By Nature Labs, an EU private-label and contract cosmetics
manufacturer. The readers are brand owners and entrepreneurs evaluating a private-label or
contract-manufacturing partner — write like an experienced formulation and production expert
advising them: practical, specific, commercially aware, no hype, no consumer-style beauty
promises. Speak about the company as "we" / "our lab"`;

// Examples + wording in the English product-link instructions (writeArticle.js).
export const LINK_EXAMPLES = {
  anchorEn: '"explore our Hyaluronic Face Serum formula"',
  contextEn:
    'choose a ready-to-brand base formula for a new product, or what a private-label range ' +
    'typically starts with',
  regulationEn: 'EU Regulations 1223/2009 and 655/2013',
  disclaimerNameEn: 'cosmetics disclaimer',
  ctaExampleEn:
    '<p>Ready to develop this as your own private-label product? <a href="URL">See the base you ' +
    'can private-label</a>.</p>',
};

// Product names in the catalog sometimes carry claims the articles may not
// make (acne, rosacea, "regenerating", "repair", "hair loss prevention"...).
// The writer and anchors only ever see this cleaned-up name; the link still
// goes to the real product page. Checked phrases first, then single words —
// each with an adjacent "&" so "Comfort & Restore" becomes "Comfort".
const CLAIM_PHRASES = [
  'for cellulite reduction',
  'hair loss prevention',
  'sebum control',
  'clear skin',
  'clear & defence',
  'clear & defense',
];
const CLAIM_WORDS = [
  'acne', 'rosacea', 'regenerating', 'repair', 'restore', 'anti-age', 'anti-aging', 'anti-ageing',
  'anti-cellulite', 'natural', 'expert', 'advanced', 'intensive', 'defence', 'defense',
];

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function productDisplayName(name) {
  let out = name
    // size suffix: "- 250 ml.", "– 50 ml", "– 75 g."
    .replace(/\s*[-–]\s*\d+(?:[.,]\d+)?\s*(?:ml|g|kg|l)\.?\s*$/i, '');
  for (const term of [...CLAIM_PHRASES, ...CLAIM_WORDS]) {
    const t = escapeRegExp(term);
    out = out.replace(new RegExp(`(?:\\b${t}\\b\\s*&\\s*|\\s*&\\s*\\b${t}\\b|\\b${t}\\b)`, 'gi'), ' ');
  }
  out = out
    .replace(/\s*[-–]\s*$/, '')
    .replace(/^\s*&\s*|\s*&\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out || 'base formula';
}

// Anchor pools for the product link (index.js picks one inline + one CTA
// anchor per article; {product} is the display name above). B2B wording —
// formulas and bases a brand can private-label, never consumer "buy now".
export const PRODUCT_LINK = {
  inlineAnchorsEn: [
    'explore our {product} formula',
    'the {product} base',
    'the {product} formula you can private-label',
    'see the {product} base you can private-label',
  ],
  ctaAnchorsEn: [
    'See the {product} base you can private-label',
    'Explore our {product} formula',
    'Request samples of the {product} formula',
  ],
  displayNameEn: productDisplayName,
};

// Grounds generateTopics.js in place of the product list (377 products would
// swamp the prompt).
export const TOPIC_CONTEXT = `
Made By Nature Labs is an EU private-label and contract cosmetics manufacturer.

WHO WE WRITE FOR: brand owners, founders and entrepreneurs (beauty start-ups, salons and clinics
building a retail line, influencers and content creators, established brands extending a range)
who are evaluating a private-label or contract-manufacturing partner.

SERVICES:
- Private label — ready-to-brand formulas the client puts their own brand on.
- White label — existing products supplied for rebranding with minimal changes.
- Custom formulation — bespoke formulas developed to the brand's brief.
- Bulk / contract manufacturing — production at scale to the brand's specification.
- Raw materials — cosmetic ingredients and actives supplied in bulk.
- Minimum order quantity of around 500 units per product.
- Sample process — the brand requests samples, refines the formula, then moves to production.

EDITORIAL PILLARS (spread topics across all seven):
1. Brand launches
2. Private label & suppliers
3. Product categories
4. Ingredients & raw materials
5. Trends & innovation
6. Formats & custom development
7. Launch execution & audiences
`.trim();

// Topic generator brief (src/steps/generateTopics.js). The fixed editorial
// calendar (data/calendar.json) is the main source; this only tops up the
// backlog when it runs low.
export const TOPIC_BRIEF = `
You are an English B2B SEO content strategist for Made By Nature Labs, an EU private-label and
contract cosmetics manufacturer (see STORE CONTEXT below).

TASK: Propose NEW English blog topics as {keyword, angle} pairs (e.g. keyword="private label
skincare minimum order quantity", angle="Private label & suppliers").

REQUIREMENTS:
- "keyword" is a short English search phrase a brand owner would type (lowercase, no
  punctuation). "angle" is exactly one of the seven EDITORIAL PILLARS in STORE CONTEXT.
- Every topic must be useful to someone planning, launching or scaling a cosmetics brand with a
  manufacturing partner — not consumer beauty advice.
- Spread topics across all seven pillars and across intents (how-to, comparison, cost/MOQ,
  checklist, explainer, trend analysis).
- Every proposed topic MUST NOT duplicate or closely paraphrase any keyword in EXISTING
  KEYWORDS, nor closely paraphrase the topic of any title in RECENTLY PUBLISHED TITLES.
- Topics must suit EU cosmetics-compliant articles (Regulation (EC) 1223/2009, (EU) 655/2013):
  NEVER a topic framed around treating, curing or preventing a disease or condition (acne,
  eczema, psoriasis, rosacea, hair loss, wound healing), around "chemical-free", "non-toxic" or
  "free-from" positioning, or around medical effects such as "anti-inflammatory" or "collagen
  rebuilding". Appearance, ingredient, formulation and business topics are fine.
`.trim();

// Featured-image styling (src/steps/generateImage.js). image.mode is
// 'scene-only', so only lifestyleSubject is used.
export const IMAGE = {
  lifestyleSubject:
    'Subject matter: clean, editorial beauty styling for a cosmetics manufacturer — for example ' +
    'raw cosmetic ingredients (botanicals, oils, butters, clays, powders) arranged on a neutral ' +
    'surface; close-up cream, gel, serum or foam textures and swatches; glass lab beakers, ' +
    'pipettes and formulation benchwork in a bright modern laboratory; or clean production / ' +
    'filling-line details. Hands may appear at work, but no person\'s face is the focus. No ' +
    'product packaging mockups or branded bottles and jars.',
};
