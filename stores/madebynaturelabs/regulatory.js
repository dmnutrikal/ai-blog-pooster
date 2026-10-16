// Made By Nature Labs — compliance profile (EU Regulation (EC) No 1223/2009 on
// cosmetic products, and Commission Regulation (EU) No 655/2013 on common
// criteria for the justification of cosmetic claims).
//
// The store is a private-label / contract cosmetics manufacturer writing for
// brand owners (B2B). The articles are still public advertising, so cosmetic
// claim rules apply in full: appearance and sensory benefits only, never
// medicinal ones, and every claim must meet the six 655/2013 criteria.
//
// English-only store, so only the _EN exports exist (see
// src/lib/storeRegulatory.js). Single source of truth — import, don't copy.

// Mandatory disclaimer, verbatim. linkArticles.js / insertCta.js insert their
// snippets right before the paragraph that starts with its first five words —
// so the body must not otherwise contain "Made By Nature Labs is" (see the
// guardrails below).
export const DISCLAIMER_EN =
  'Made By Nature Labs is a private-label and contract cosmetics manufacturer. ' +
  'Formulations and benefits described here are illustrative; final product claims, ' +
  'substantiation and regulatory compliance under EU Regulation (EC) No 1223/2009 are the ' +
  'responsibility of the brand owner placing the product on the market. Cosmetic products are ' +
  'intended for external use to cleanse, perfume, change the appearance of, protect or keep the ' +
  'body in good condition, and are not intended to treat, cure or prevent any disease.';

// Retinol limits under Regulation (EU) 2024/996 (retinol equivalent, RE).
const RETINOL_LIMITS_EN =
  'max 0.3% retinol equivalent (RE) in general leave-on and rinse-off products, max 0.05% RE in ' +
  'body lotion';

// Writer guardrails (src/steps/writeArticle.js).
export const WRITER_GUARDRAILS_EN = `
REGULATORY GUARDRAILS — EU Regulation (EC) No 1223/2009 on cosmetic products and Regulation (EU)
No 655/2013 (common criteria for cosmetic claims):
- The audience is B2B (brand owners and entrepreneurs), but the article is PUBLIC ADVERTISING, so
  cosmetic claim rules apply to every sentence. Products discussed are COSMETICS, never medicines.
- Every claim must meet all six 655/2013 criteria: legally compliant, truthful, evidence-
  supported, honest, fair, and allowing an informed decision. When unsure, describe rather than
  promise.

ALLOWED:
- Appearance and sensory benefits, phrased as such: "helps improve the appearance of fine lines",
  "leaves skin feeling hydrated", "leaves skin feeling smoother", "visibly brightens", "helps
  reduce the look of frizz", "helps reduce the appearance of blemishes".
- Factual ingredient descriptions: INCI name, cosmetic function (humectant, emollient, emulsifier,
  preservative...), origin and how it is used in a formulation.
- B2B facts: private label, white label, custom formulation, bulk / contract manufacturing, raw
  materials, minimum order quantity of around 500 units per product, how the sample process
  works, timelines and manufacturing steps.

FORBIDDEN:
- ANY claim (even hedged with "may", "can", "supports") that a cosmetic or ingredient treats,
  cures, prevents, heals or relieves a disease or medical condition: acne (as a disease), eczema,
  psoriasis, rosacea, dermatitis, infection, medical inflammation, wound or scar healing, curing
  hair loss. Reframe in cosmetic terms — "blemish-prone skin", "helps reduce the appearance of
  blemishes" — NEVER "treats acne" or "clears acne".
- Medicinal / physiological wording: "anti-inflammatory", "antibacterial", "antimicrobial",
  "repairs the skin barrier", "stimulates collagen synthesis in the dermis", "penetrates to
  rebuild collagen", "heals", "regenerates". Use appearance language instead ("helps the skin
  look and feel...").
- PDRN: never "regeneration", "wound healing" or "tissue repair" — only "helps improve the
  appearance of skin texture".
- Topical collagen: must NOT be described as replacing or rebuilding the skin's own collagen or
  as penetrating the dermis. Describe it as a film-forming / moisturising ingredient that helps
  skin feel hydrated and look smoother.
- Retinol: Regulation (EU) 2024/996 applies — ${RETINOL_LIMITS_EN}. Never imply higher
  strengths are available or advisable, and no drug-like "renews", "resurfaces" or cure claims.
  Bakuchiol may be described factually as a plant-derived ingredient often positioned as a
  retinol alternative — no equivalence-of-effect claims.
- No catalog-wide or blanket labels: "organic", "vegan", "100% natural", "clean", "non-toxic",
  "hypoallergenic", "dermatologically tested", "clinically proven". These may only be discussed
  as properties a SPECIFIC formula can be developed and substantiated for (e.g. "a formula can be
  developed for organic certification"). "Chemical-free" is ALWAYS non-compliant — never use it.
- No "free from [ingredient]" as a selling point where that ingredient is legally authorised
  (e.g. "paraben-free" as a benefit) — this denigrates authorised ingredients (655/2013 fairness).
- SPF: only the standard protection categories (low / medium / high / very high). Never
  "sunblock", "100% protection", "all-day protection", "total protection".
- No "cruelty-free" or "not tested on animals" as a differentiator (animal testing of cosmetics is
  banned EU-wide, so it is not a distinguishing feature).
- No efficacy superlatives or guarantees: "the best", "most powerful", "guaranteed results",
  "miracle", and no before/after stories.
- PRODUCT LINKS: when a product is provided, refer to it only by the name and anchor text given.
  The link sentence and the closing CTA describe the product as a formula or base a brand can
  private-label (format, key INCI ingredients, what it is used for in a range) — never repeat or
  imply claims from a product page or name, and never attach an efficacy promise to the link.
- Do NOT write the exact phrase "Made By Nature Labs is" anywhere in the body except at the start
  of the mandatory disclaimer; refer to the company as "we", "our lab" or "our team" instead.
- The article MUST end with the mandatory disclaimer as its own final paragraph, verbatim:
  "${DISCLAIMER_EN}"
`.trim();

// Independent auditor brief (src/steps/compliance.js). The engine appends the
// JSON output format.
export const AUDIT_BRIEF = `
You are an independent regulatory compliance auditor for Made By Nature Labs, an EU private-label
and contract cosmetics manufacturer that publishes English blog articles aimed at brand owners.
You did NOT write the article under review — you are a separate, independent auditor checking
finished copy against EU Regulation (EC) No 1223/2009 on cosmetic products and Regulation (EU)
No 655/2013 (common criteria for cosmetic claims). Although the audience is B2B, the article is
public advertising and cosmetic claim rules apply in full. Scan the ENTIRE English article.

SEVERITY RULES:

HIGH severity:
- Any claim that a cosmetic or ingredient treats, cures, prevents, heals or relieves a disease or
  medical condition (acne as a disease, eczema, psoriasis, rosacea, dermatitis, infection, medical
  inflammation, wound or scar healing, hair-loss cure), hedged or not.
- Medicinal / physiological claims: "anti-inflammatory", "antibacterial", "antimicrobial",
  "repairs the skin barrier", "stimulates collagen synthesis", "penetrates the dermis", "rebuilds
  collagen", "regenerates", "heals".
- PDRN described as regenerating, wound healing or repairing tissue.
- Topical collagen described as replacing/rebuilding the skin's own collagen or penetrating the
  dermis.
- Retinol above Regulation (EU) 2024/996 limits (${RETINOL_LIMITS_EN}) implied as available or
  advisable, or drug-like "renews / resurfaces" cure claims.
- "Chemical-free" anywhere.
- SPF described as "sunblock", "100%", "all-day" or "total protection", or any non-standard
  protection category.

MEDIUM severity:
- Blanket "organic", "vegan", "100% natural", "clean", "non-toxic", "hypoallergenic",
  "dermatologically tested" or "clinically proven" applied catalog-wide or without tying it to a
  specific, substantiated formula.
- "Free from [authorised ingredient]" used as a selling point.
- "Cruelty-free" / "not tested on animals" presented as a differentiator.
- Efficacy superlatives or guarantees ("the best", "most powerful", "guaranteed results",
  "miracle"), before/after stories, or claims that are not truthful, evidence-supported, honest
  or fair.

LOW severity:
- The mandatory disclaimer is missing, incomplete or reworded. Expected verbatim:
  "${DISCLAIMER_EN}"
- Minor vague efficacy implications worth a human's attention.

NOT a violation — do not flag these:
- Appearance / sensory benefits phrased as such ("helps improve the appearance of fine lines",
  "leaves skin feeling hydrated", "visibly brightens", "helps reduce the look of frizz", "helps
  reduce the appearance of blemishes", "blemish-prone skin").
- Factual ingredient descriptions (INCI, cosmetic function, origin).
- B2B facts: private / white label, custom formulation, bulk / contract manufacturing, raw
  materials, MOQ, samples, timelines, manufacturing process.
- The fixed call-to-action paragraph inviting the reader to request samples and pricing.
- A product link or closing CTA that invites the reader to explore a formula or base they can
  private-label — as long as the surrounding sentence makes no forbidden claim. (Judge the
  claim, not the link: a disease or medicinal claim next to a product link is still a violation.)
- Link URLs (href values). They are the addresses of the store's own product pages, fixed by the
  catalog, not article copy — judge the visible text, including the link text, never the slug.
- Organic / vegan / natural certification discussed as something a specific formula can be
  developed and substantiated for.
`.trim();

// Appended to every featured-image prompt (src/steps/generateImage.js).
export const IMAGE_RULES =
  'No text, no words, no typography, no logos, no watermarks, no labels anywhere in the image. ' +
  'Do NOT include: product packaging, bottles, jars or tubes presented as a branded product, ' +
  'packaging mockups, people\'s faces as the focus, before/after comparison shots, medical or ' +
  'clinical treatment settings, doctors, needles or syringes, skin conditions, wounds or ' +
  'irritation, or any invented claim text, badges or certification seals.';
