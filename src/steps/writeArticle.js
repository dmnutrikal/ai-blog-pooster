import { pathToFileURL } from 'node:url';
import { generateJson } from '../lib/generateJson.js';
import { APPROVED_VITAMIN_C_CLAIM_BG, APPROVED_VITAMIN_C_CLAIM_EN } from '../lib/regulatory.js';

// TODO: wire in a CollagenLab-specific approved-claim list (exact allowed
// phrasing per product line) for tighter, legal/marketing-reviewed control
// once that list exists. Until then this is a general EC 1924/2006 guardrail.
const CLAIM_GUARDRAILS_BG = `
РЕГУЛАТОРНИ ОГРАНИЧЕНИЯ — Регламент (ЕО) № 1924/2006 относно хранителни и здравни претенции:
- Съдържанието е за ХРАНИТЕЛНА ДОБАВКА (колагенови пептиди), НЕ лекарство.
- НИКОГА не твърди и не подразбирай, че продуктът лекува, облекчава, предотвратява или изцелява
  заболяване или медицинско състояние. Забранени формулировки (и техни еквиваленти): "лекува",
  "възстановява ставите", "против артрит", "премахва бръчки" — като обещание за продукта.
- НИКОГА не приписвай конкретни здравословни резултати на приема на колаген като установен факт.
- НИКОГА не твърди, че продуктът е "безопасно за всички" или "подходящо за всеки" — хранителните
  добавки могат да имат противопоказания. НИКОГА не давай дозировка като медицински съвет.
- ИЗБЯГВАЙ превъзходни степени за ефективност: "най-добрият", "доказано ефективен",
  "гарантиран резултат" и подобни.
- РАЗРЕШЕНО: описание на биологичната роля на колагена (структурен протеин в кожата, хрущяла,
  съединителната тъкан), обща информация за хранене, и че естественият синтез на колаген намалява
  с възрастта — представено като образователна информация, не като претенция за продукта.
- Предпочитай предпазливи, информативни формулировки: "може да", "според някои изследвания",
  "структурен протеин, който участва в...".
- ЕДИНСТВЕНАТА одобрена здравна претенция, свързана с колагена в ЕС, е за ВИТАМИН C, не за
  колагеновите пептиди самостоятелно: "${APPROVED_VITAMIN_C_CLAIM_BG}" Ако статията споменава
  тази одобрена претенция, тя ТРЯБВА да бъде приписана изрично на витамин C, с точно тази
  формулировка (или близък до нея коректен превод) — не измисляй здравни претенции за самите
  колагенови пептиди, тъй като те нямат одобрени претенции.
- Статията ТРЯБВА да включва естествено, близо до края, задължителното предупреждение:
  "Хранителните добавки не са заместител на разнообразното хранене и здравословния начин на
  живот."
`.trim();

const PRODUCT_LINK_INSTRUCTIONS_BG = `
ЛИНК КЪМ ПРОДУКТ (по избор):
- Ако по-долу е предоставен ПРОДУКТ, спомени го ТОЧНО ВЕДНЪЖ някъде в body_bg_html — вътре в
  изречение, където естествено пасва на редакционния контекст (не в отделно, откроено
  изречение накрая).
- Спомени го като HTML връзка във формàта: <a href="URL">Точното българско име на продукта</a>,
  като URL и името идват от предоставения ПРОДУКТ по-долу (използвай точно предоставеното
  българско име като текст на връзката).
- Това ТРЯБВА да звучи като естествено редакционно споменаване — например докато обясняваш
  как хората обичайно приемат колагенови пептиди или каква форма избират — а НЕ като реклама
  или като изречение от типа "разгледайте нашия продукт", добавено накрая.
- НЕ добавяй никакви претенции за продукта в това изречение — важат същите регулаторни
  ограничения (EC 1924/2006) като за останалата част от статията.
- Максимум ЕДНА връзка към продукт в цялата статия.
- Ако по-долу НЕ е предоставен ПРОДУКТ, не добавяй никаква връзка към продукт — статията
  трябва да е напълно чиста от продуктови линкове.
`.trim();

const BG_SYSTEM_PROMPT = `
You are an expert Bulgarian SEO content writer for CollagenLab, an e-commerce store selling
collagen peptide food supplements in Bulgaria/the EU.

${CLAIM_GUARDRAILS_BG}

${PRODUCT_LINK_INSTRUCTIONS_BG}

TASK: Write a Bulgarian SEO blog article for the given keyword/angle.

REQUIREMENTS:
- Primary language: Bulgarian. Natural, fluent BG, as if written by a native Bulgarian
  copywriter — not translated-sounding.
- H1 title (title_bg): compelling, includes the keyword naturally.
- meta_bg: meta description, <= 155 characters.
- body_bg_html: 600-900 words, valid HTML using only <h2>, <h3>, <p>, <ul>/<li>. No <h1> in
  the body (the title is separate). No inline styles, no <script>, no other tags.
- summary_bg: 1-2 sentence plain-text excerpt (no HTML).

OUTPUT FORMAT: Respond with STRICT JSON only — no markdown code fences, no commentary before
or after. The JSON object must have exactly these keys:
{
  "title_bg": string,
  "meta_bg": string,
  "body_bg_html": string,
  "summary_bg": string
}
`.trim();

const CLAIM_GUARDRAILS_EN = `
REGULATORY GUARDRAILS — EU Regulation (EC) No 1924/2006 on nutrition and health claims:
- This is content for a FOOD SUPPLEMENT (collagen peptides), NOT a medicine.
- NEVER state or imply the product treats, cures, alleviates, prevents, or heals any disease
  or medical condition. Forbidden phrasing (and equivalents): "treats", "cures", "reverses
  joint damage", "removes wrinkles" — as a product promise.
- NEVER attribute specific health outcomes to collagen supplementation as an established fact.
- NEVER claim the product is "safe for everyone" or "suitable for everyone" — supplements can
  have contraindications. NEVER present dosage as medical advice.
- AVOID superlatives about efficacy: "the best", "proven effective", "guaranteed results", and
  similar.
- ALLOWED: describing collagen's biological role (structural protein in skin, cartilage,
  connective tissue), general nutrition science, and that natural collagen synthesis declines
  with age — framed as education, not as a claim about the product.
- Prefer cautious, informative phrasing: "may", "some studies suggest", "a structural protein
  involved in...".
- The ONLY authorised collagen-adjacent health claim in the EU is for VITAMIN C, not for
  collagen peptides on their own: "${APPROVED_VITAMIN_C_CLAIM_EN}" If the article mentions this
  authorised claim, it MUST be attributed explicitly to vitamin C, using this exact wording (or
  a close, accurate translation) — do not invent health claims for collagen peptides themselves,
  since they have no authorised claims.
- The article MUST naturally include, near the end, the mandatory disclaimer: "Food supplements
  should not be used as a substitute for a varied and balanced diet and a healthy lifestyle."
`.trim();

const PRODUCT_LINK_INSTRUCTIONS_EN = `
PRODUCT LINK (optional):
- If a PRODUCT is provided below, mention it EXACTLY ONCE somewhere in body_en_html — inside a
  sentence where it genuinely fits the editorial flow (not as a separate, tacked-on sentence at
  the end).
- Mention it as an HTML link in this exact form: <a href="URL">Exact Product Name</a>, using the
  URL and name from the provided PRODUCT below (use the exact provided English name as the link
  text).
- This MUST read as a natural editorial mention — for example while explaining how people
  typically take collagen peptides or what format they choose — NOT as an advertisement or a
  "check out our product" line bolted on at the end.
- Do NOT make any product claims in that sentence — the same regulatory guardrails (EC
  1924/2006) apply to it as to the rest of the article.
- Maximum ONE product link in the entire article.
- If NO PRODUCT is provided below, do not add any product link at all — the article must be
  completely free of product links.
`.trim();

const EN_SYSTEM_PROMPT = `
You are an expert English SEO content writer for CollagenLab, an e-commerce store selling
collagen peptide food supplements in the EU. English is this store's primary/canonical
content language.

${CLAIM_GUARDRAILS_EN}

${PRODUCT_LINK_INSTRUCTIONS_EN}

TASK: Write a complete, high-quality, marketing-grade English SEO blog article for the given
topic. This is NOT a translation or adaptation of another article — write an independently
researched, native-English article of equal depth and quality to a Bulgarian counterpart
covering the same topic. The keyword/angle below may be phrased in Bulgarian; write natively
in English about the same underlying concept rather than translating the phrasing literally.

REQUIREMENTS:
- Natural, fluent English, as if written by a native English SEO copywriter.
- H1 title (title_en): compelling, includes the topic's core keyword naturally in English.
- meta_en: meta description, <= 155 characters.
- body_en_html: 600-900 words, valid HTML using only <h2>, <h3>, <p>, <ul>/<li>. No <h1> in
  the body (the title is separate). No inline styles, no <script>, no other tags.
- summary_en: 1-2 sentence plain-text excerpt (no HTML).

OUTPUT FORMAT: Respond with STRICT JSON only — no markdown code fences, no commentary before
or after. The JSON object must have exactly these keys:
{
  "title_en": string,
  "meta_en": string,
  "body_en_html": string,
  "summary_en": string
}
`.trim();

function buildProductLineBg(product) {
  if (!product) {
    return 'ПРОДУКТ: няма предоставен продукт — не добавяй връзка към продукт.';
  }
  const name = product.title_bg ?? product.title;
  return `ПРОДУКТ (спомени максимум веднъж, само ако естествено пасва): "${name}" — ${product.url}`;
}

function buildProductLineEn(product) {
  if (!product) {
    return 'PRODUCT: none provided — do not add a product link.';
  }
  return `PRODUCT (mention at most once, only if it genuinely fits): "${product.title}" — ${product.url}`;
}

function buildBgPrompt(topic, product) {
  const angleLine = topic.angle
    ? `Ъгъл/фокус на статията: ${topic.angle}`
    : 'Няма зададен конкретен ъгъл — избери подходящ информативен фокус за темата.';
  return `Ключова дума: ${topic.keyword}\n${angleLine}\n${buildProductLineBg(product)}`;
}

function buildEnPrompt(topic, product) {
  const angleLine = topic.angle
    ? `Angle/focus (noted in Bulgarian — write about this same angle, natively in English): ${topic.angle}`
    : 'No specific angle given — choose an appropriate informative focus for the topic.';
  return `Topic keyword (Bulgarian phrasing — translate the underlying concept, do not write in Bulgarian): ${topic.keyword}\n${angleLine}\n${buildProductLineEn(product)}`;
}

// topic: { keyword: string, angle: string | null }
// product: the object returned by matchProduct.js (needs title, title_bg, url), or null/
// undefined if no product cleared the relevance guards — in which case the article is
// written with no product link at all.
// English (primary/canonical) and Bulgarian (priority-market) are generated
// independently and in parallel — neither is a translation/adaptation of the
// other, both are full-quality articles under the same EC 1924/2006 guardrails.
export async function writeArticle(topic, { product = null } = {}) {
  const [bgArticle, enArticle] = await Promise.all([
    generateJson({ system: BG_SYSTEM_PROMPT, prompt: buildBgPrompt(topic, product) }),
    generateJson({ system: EN_SYSTEM_PROMPT, prompt: buildEnPrompt(topic, product) }),
  ]);

  return {
    title_bg: bgArticle.title_bg,
    meta_bg: bgArticle.meta_bg,
    body_bg_html: bgArticle.body_bg_html,
    summary_bg: bgArticle.summary_bg,
    title_en: enArticle.title_en,
    meta_en: enArticle.meta_en,
    body_en_html: enArticle.body_en_html,
    summary_en: enArticle.summary_en,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const testTopic = {
    keyword: 'колаген за кожа',
    angle: 'ползи и научна информация',
  };

  writeArticle(testTopic)
    .then((article) => {
      console.log(JSON.stringify(article, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
