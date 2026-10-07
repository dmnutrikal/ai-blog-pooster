// CollagenLab — editorial voice for the shared engine's prompts.
//
// Everything a prompt says about WHO this store is and WHAT it sells lives
// here; the engine (src/steps/*) owns only the task structure and the output
// formats. Compliance wording (claims, guardrails, auditor rules, image
// restrictions) is NOT here — that is regulatory.js. Loaded for the active
// store by src/lib/storeContent.js.

// Writer system prompts (src/steps/writeArticle.js): "You are an expert
// <language> SEO content writer for <WRITER_STORE_xx>." The engine appends a
// "<language> is this store's primary/canonical content language." line to
// whichever prompt matches store.config.js's primaryLocale.
export const WRITER_STORE_BG = `CollagenLab, an e-commerce store selling
collagen peptide food supplements in Bulgaria/the EU`;

export const WRITER_STORE_EN = `CollagenLab, an e-commerce store selling
collagen peptide food supplements in the EU`;

// Examples dropped into the product-link instructions so the model knows what
// a non-product-name anchor and a natural editorial context look like here.
export const LINK_EXAMPLES = {
  anchorBg: 'само "колаген" или "CollagenLab"',
  contextBg: 'как хората обичайно приемат колагенови пептиди или каква форма избират',
  anchorEn: 'just "collagen" or "CollagenLab"',
  contextEn: 'typically take collagen peptides or what format they choose',
};

// Topic generator brief (src/steps/generateTopics.js). The engine appends the
// JSON output format.
export const TOPIC_BRIEF = `
You are a Bulgarian SEO content strategist for CollagenLab, an e-commerce store selling
collagen peptide food supplements in Bulgaria/the EU.

TASK: Propose NEW Bulgarian blog topics as {keyword, angle} pairs — the same shape this store's
existing topic backlog uses (e.g. keyword="говежди колаген", angle="как да изберем").

REQUIREMENTS:
- Both "keyword" and "angle" are short Bulgarian phrases, in the same terse, lowercase,
  non-sentence style as the EXISTING KEYWORDS shown below (not full sentences, no punctuation).
- Every proposed topic MUST be relevant to the collagen-supplement niche and, where natural,
  grounded in what this store's PRODUCTS actually are (see below) — but topics do not have to
  name a specific product.
- NEVER propose a topic about an accessory or non-ingestible item — dosing scoops/spoons,
  shakers, mixing bottles, packaging, or similar. Every topic must focus on the collagen
  supplement itself (the ingestible product), not tools used to measure or mix it.
- Every proposed topic MUST NOT duplicate or closely paraphrase any keyword in EXISTING
  KEYWORDS, nor closely paraphrase the topic of any title in RECENTLY PUBLISHED TITLES. Do not
  just swap a synonym for an existing keyword (e.g. if "колаген за кожа" exists, do not propose
  "колаген за кожата" or "ползи на колагена за кожата").
- Angles MUST suit EC 1924/2006-compliant articles: label-reading, how-to, comparison,
  buying-guide, or general informational framing only. NEVER propose an angle framed around
  treating, curing, or preventing a disease or medical condition, and never an angle that implies
  a guaranteed health outcome from taking collagen.
- Prefer variety across angle types (how-to, comparison, label-reading, myth-busting,
  informational/explainer, buying-guide) rather than repeating the same angle shape for every
  topic.
`.trim();

// Featured-image styling (src/steps/generateImage.js).
export const IMAGE = {
  // Noun used for the cutout throughout the product-in-scene prompt.
  packaging: 'pouch',
  // Describes the attached reference cutout. label comes from the PNG filename
  // in products/ ("Wild-Berries.png" -> "Wild Berries").
  describeReference: (label) => `a CollagenLab collagen-peptide pouch (flavor: ${label})`,
  // Flavor-appropriate styling props, matched by keyword against the flavor label so this
  // generalizes to any future cutout naming rather than hardcoding exact filenames.
  propsFor(label) {
    const lower = label.toLowerCase();
    if (lower.includes('caramel')) {
      return 'a few pieces of salted caramel and a small dish of sea salt flakes nearby, warm cozy styling';
    }
    if (lower.includes('berr')) {
      return 'fresh wild berries — blueberries, raspberries, blackberries — loosely scattered nearby';
    }
    if (lower.includes('tropical') || lower.includes('elixir')) {
      return 'tropical fruit — passion fruit, pineapple, a little coconut — arranged nearby';
    }
    if (lower.includes('original')) {
      return 'a warm ceramic coffee mug and a simple linen napkin nearby, calm neutral morning styling';
    }
    return 'a few natural ingredients loosely related to the flavor, arranged nearby';
  },
  // Subject line of the text-only fallback scene (no product).
  lifestyleSubject:
    'Subject matter: everyday lifestyle, food, and natural ingredients — for example fresh ' +
    'fruit, a glass of water or smoothie, a calm skincare or wellness routine moment, ' +
    'natural textures. General depiction of healthy-looking skin in an everyday context is fine.',
};
