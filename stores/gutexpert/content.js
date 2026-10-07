// GutExpert — editorial voice for the shared engine's prompts.
//
// Who the store is and what it sells, as the prompts describe it. Compliance
// wording (the lactase claim, forbidden claims, auditor rules, image
// restrictions) is NOT here — that is regulatory.js. Loaded for the active
// store by src/lib/storeContent.js; see stores/collagenlab/content.js for the
// meaning of each export.

export const WRITER_STORE_BG = `GutExpert, an e-commerce store selling gut-focused food
supplements (a multi-strain probiotic, a digestive multi-enzyme complex, butyrate/tributyrin
and lactase) in Bulgaria/the EU`;

export const WRITER_STORE_EN = `GutExpert, an e-commerce store selling gut-focused food
supplements (a multi-strain probiotic, a digestive multi-enzyme complex, butyrate/tributyrin
and lactase) in the EU`;

export const LINK_EXAMPLES = {
  anchorBg: 'само "лактаза" или "GutExpert"',
  contextBg: 'как се чете етикетът на хранителна добавка, какво означават щамовете и CFU или каква форма избират хората',
  anchorEn: 'just "lactase" or "GutExpert"',
  contextEn: 'read a supplement label, what strains and CFU mean, or what format they choose',
};

// Topic generator brief (src/steps/generateTopics.js). gutexpert has no fixed
// editorial calendar — its backlog comes entirely from this generator.
export const TOPIC_BRIEF = `
You are a Bulgarian SEO content strategist for GutExpert, an e-commerce store selling
gut-focused food supplements in Bulgaria/the EU: a multi-strain probiotic complex (live
cultures, CFU), a digestive multi-enzyme complex, butyrate (tributyrin) and lactase.

TASK: Propose NEW Bulgarian blog topics as {keyword, angle} pairs (e.g. keyword="лактаза",
angle="как да четем етикета").

REQUIREMENTS:
- Both "keyword" and "angle" are short Bulgarian phrases, in the same terse, lowercase,
  non-sentence style as the EXISTING KEYWORDS shown below (not full sentences, no punctuation).
- Every proposed topic MUST be relevant to the gut / digestion / microbiome niche and, where
  natural, grounded in what this store's PRODUCTS actually are (see below) — probiotics and live
  cultures, digestive enzymes, butyrate/tributyrin, lactase and lactose — but topics do not have
  to name a specific product.
- Spread topics across all four product areas, plus general gut/digestion education (fibre,
  fermented foods, how digestion works, what the microbiome is).
- NEVER propose a topic about an accessory or non-ingestible item — pill organisers, shakers,
  packaging, or similar.
- Every proposed topic MUST NOT duplicate or closely paraphrase any keyword in EXISTING
  KEYWORDS, nor closely paraphrase the topic of any title in RECENTLY PUBLISHED TITLES. Do not
  just swap a synonym for an existing keyword.
- Angles MUST suit EC 1924/2006-compliant articles: label-reading, how-to, comparison,
  buying-guide, myth-busting, or general informational/educational framing only. The ONLY
  authorised health claim in this niche is for lactase (lactose digestion) — so:
  - NEVER propose an angle that promises a benefit from probiotics, live cultures, strains, CFU,
    butyrate/tributyrin or enzyme blends (e.g. "за по-добро храносмилане", "срещу подуване",
    "за имунитета", "за здрава чревна бариера", "възстановяване на микробиома").
  - NEVER propose an angle framed around treating, curing, relieving or preventing a disease or
    condition (IBS/СРДВ, SIBO, "пропускливи черва", колит, лактозна непоносимост като болест).
  - Prefer factual angles: what it is, what a label says (strains, CFU, enzyme units), how to
    take/store it, how forms compare, what the science discusses, common myths.
- Prefer variety across angle types (how-to, comparison, label-reading, myth-busting,
  informational/explainer, buying-guide) rather than repeating the same angle shape for every
  topic.
`.trim();

// Featured-image styling (src/steps/generateImage.js). Cutouts are named by
// product handle (probiotic-complex.png, lactase.png, ...), so generateImage.js
// uses the cutout of the product the article links.
export const IMAGE = {
  packaging: 'bottle',
  // label: the cutout filename with dashes as spaces ("multi enzyme complex").
  describeReference: (label) => `a GutExpert food-supplement capsule bottle (product: ${label})`,
  propsFor(label) {
    const lower = label.toLowerCase();
    if (lower.includes('lactase')) {
      return 'a glass of milk and a small board with a few slices of cheese nearby, bright calm breakfast styling';
    }
    if (lower.includes('enzyme')) {
      return 'a simple, colourful plate of whole foods — grains, vegetables, a little olive oil — nearby, relaxed mealtime styling';
    }
    if (lower.includes('butyrate') || lower.includes('tributyrin')) {
      return 'a small bowl of oats, a few leafy greens and a glass of water nearby, calm minimal styling';
    }
    if (lower.includes('probiotic')) {
      return 'a small bowl of plain yogurt, a jar of sauerkraut and a glass of water nearby, fresh natural styling';
    }
    return 'a glass of water and a few fresh natural ingredients arranged nearby';
  },
  lifestyleSubject:
    'Subject matter: everyday lifestyle, food, and natural ingredients — for example a balanced ' +
    'meal, fermented foods such as yogurt or sauerkraut, fibre-rich grains and vegetables, a glass ' +
    'of water, natural textures. No depiction of bodies, stomachs or digestive discomfort.',
};
