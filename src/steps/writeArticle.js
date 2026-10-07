import { pathToFileURL } from 'node:url';
import { generateJson } from '../lib/generateJson.js';
import { WRITER_GUARDRAILS_BG, WRITER_GUARDRAILS_EN } from '../lib/storeRegulatory.js';
import { WRITER_STORE_BG, WRITER_STORE_EN, LINK_EXAMPLES } from '../lib/storeContent.js';
import { config } from '../config.js';

// The active store's claim guardrails — stores/<STORE>/regulatory.js. What the
// article may and may not claim is entirely store-specific.
const CLAIM_GUARDRAILS_BG = WRITER_GUARDRAILS_BG;

// Told to whichever writer produces the store's primary/canonical language
// (store.config.js primaryLocale) — the other language is published as its
// Shopify translation (see publish.js).
function primaryLanguageNote(locale) {
  if (locale !== config.store.primaryLocale) return '';
  const language = locale === 'en' ? 'English' : 'Bulgarian';
  return ` ${language} is this store's primary/canonical
content language.`;
}

const PRODUCT_LINK_INSTRUCTIONS_BG = `
ЛИНК КЪМ ПРОДУКТ (по избор):
- Ако по-долу е предоставен ПРОДУКТ, спомени го ТОЧНО ВЕДНЪЖ вътре в основния текст на
  body_bg_html — в изречение, където естествено пасва на редакционния контекст (не в отделно,
  откроено изречение накрая).
- Спомени го като HTML връзка във формàта: <a href="URL">ТЕКСТ НА ВРЪЗКАТА</a>, като URL идва
  от предоставения ПРОДУКТ по-долу. За ТЕКСТ НА ВРЪЗКАТА използвай ТОЧНО текста, посочен по-долу
  като "ТЕКСТ НА ВРЪЗКАТА В ТЕКСТА" (ако е предоставен) — вплети го естествено в изречението,
  дори когато не е самото име на продукта (напр. ${LINK_EXAMPLES.anchorBg}). Ако такъв
  текст НЕ е предоставен, използвай точното българско име на продукта като текст на връзката.
- Това ТРЯБВА да звучи като естествено редакционно споменаване — например докато обясняваш
  ${LINK_EXAMPLES.contextBg} — а НЕ като реклама
  или като изречение от типа "разгледайте нашия продукт", добавено накрая.
- НЕ добавяй никакви претенции за продукта в това изречение — важат същите регулаторни
  ограничения (EC 1924/2006) като за останалата част от статията.
- Само ЕДНА такава естествена, вплетена в текста връзка в цялата статия.
- Ако по-долу НЕ е предоставен ПРОДУКТ, не добавяй никаква връзка към продукт — статията
  трябва да е напълно чиста от продуктови линкове.

ЗАКЛЮЧИТЕЛЕН CTA (само ако е предоставен ПРОДУКТ):
- В допълнение към естественото споменаване по-горе, добави точно ЕДИН отделен ред с покана за
  действие (call-to-action), позициониран непосредствено ПРЕДИ задължителния абзац с
  предупреждението за хранителни добавки в самия край на статията.
- Формат: кратко изречение в <p>, съдържащо HTML връзка към ПРОДУКТА: <a href="URL">ТЕКСТ НА
  ВРЪЗКАТА</a>. За ТЕКСТ НА ВРЪЗКАТА използвай ТОЧНО текста, посочен по-долу като "ТЕКСТ НА
  ВРЪЗКАТА В CTA" (ако е предоставен) — той вече звучи като покана за действие, така че кратко
  въвеждащо изречение около него стига, напр.: <p>Готови ли сте да започнете?
  <a href="URL">Поръчайте сега</a>.</p> Ако такъв текст НЕ е предоставен, използвай естествен
  текст на връзката, включващ името на продукта — например: <p>Започнете своя ежедневен ритуал с
  <a href="URL">Точното българско име на продукта</a>.</p>
- Този ред е чисто поканващ (CTA) — НЕ съдържа никаква здравна или ефективностна претенция за
  продукта, само покана да се разгледа/пробва.
- Резултат: когато е предоставен продукт, статията съдържа точно ДВА линка към него — едното
  естествено вплетено споменаване в тялото и този отделен CTA ред точно преди предупреждението.
  Ако НЕ е предоставен продукт, не добавяй никакъв CTA ред.
`.trim();

const BG_SYSTEM_PROMPT = `
You are an expert Bulgarian SEO content writer for ${WRITER_STORE_BG}.${primaryLanguageNote('bg')}

${CLAIM_GUARDRAILS_BG}

${PRODUCT_LINK_INSTRUCTIONS_BG}

TASK: Write a Bulgarian SEO blog article for the given keyword/angle.

REQUIREMENTS:
- Primary language: Bulgarian. Natural, fluent BG, as if written by a native Bulgarian
  copywriter — not translated-sounding.
- H1 title (title_bg): compelling, includes the keyword naturally.
- meta_bg: meta description, <= 155 characters.
- body_bg_html: TARGET LENGTH ~1500-2200 words. Valid HTML using only <h2>, <h3>, <p>,
  <ul>/<li>. No <h1> in the body (the title is separate). No inline styles, no <script>,
  no other tags. Structure, in this order:
  1. Кратко въведение (2-4 изречения, без H2 заглавие) представящо темата.
  2. 6 до 9 секции с <h2> заглавие, покриващи темата задълбочено и логично; част от тях (не
     всички) трябва да съдържат и <h3> подсекции и/или <ul>/<li> списъци, където това има
     смисъл за четимостта.
  3. Секция "Контролен списък" с <h2>Контролен списък</h2> и <ul>/<li> с практични,
     проверими точки, свързани с темата (напр. какво да проверите на етикета, на какво да
     обърнете внимание при избор) — не медицински съвети или дозировка като лечение.
  4. Секция с чести въпроси: <h2>Често задавани въпроси</h2>, съдържаща 5 до 8 двойки
     въпрос/отговор, всяка като <h3>въпрос</h3><p>отговор</p>.
  5. Кратко заключение (2-4 изречения) обобщаващо статията — без ново H2 заглавие, освен ако
     не е част от последната съдържателна секция.
  Задължителният ЗАКЛЮЧИТЕЛЕН CTA (ако има продукт) и абзацът с предупреждението вървят след
  заключението, в самия край на body_bg_html, по реда, описан в ЗАКЛЮЧИТЕЛЕН CTA по-горе.
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

const CLAIM_GUARDRAILS_EN = WRITER_GUARDRAILS_EN;

const PRODUCT_LINK_INSTRUCTIONS_EN = `
PRODUCT LINK (optional):
- If a PRODUCT is provided below, mention it EXACTLY ONCE inside the main body text of
  body_en_html — inside a sentence where it genuinely fits the editorial flow (not as a
  separate, tacked-on sentence at the end).
- Mention it as an HTML link in this exact form: <a href="URL">LINK TEXT</a>, using the URL from
  the provided PRODUCT below. For LINK TEXT, use EXACTLY the text given below as "INLINE ANCHOR
  TEXT" (if provided) — weave it naturally into the sentence, even when it isn't the product name
  itself (e.g. ${LINK_EXAMPLES.anchorEn}). If no such text is provided, use the exact
  product name as the link text instead.
- This MUST read as a natural editorial mention — for example while explaining how people
  ${LINK_EXAMPLES.contextEn} — NOT as an advertisement or a
  "check out our product" line bolted on at the end.
- Do NOT make any product claims in that sentence — the same regulatory guardrails (EC
  1924/2006) apply to it as to the rest of the article.
- Only ONE such natural, woven-in link in the entire article.
- If NO PRODUCT is provided below, do not add any product link at all — the article must be
  completely free of product links.

CLOSING CTA (only if a PRODUCT is provided):
- In addition to the natural mention above, add exactly ONE separate call-to-action line,
  positioned immediately BEFORE the mandatory food-supplements disclaimer paragraph at the very
  end of the article.
- Format: a short <p> sentence containing an HTML link to the PRODUCT: <a href="URL">LINK
  TEXT</a>. For LINK TEXT, use EXACTLY the text given below as "CTA ANCHOR TEXT" (if provided) —
  it already reads as a call-to-action, so a brief lead-in around it is enough, e.g.: <p>Ready to
  start? <a href="URL">Order now</a>.</p> If no such text is provided, use natural anchor text
  that includes the product name instead — for example: <p>Start your daily ritual with
  <a href="URL">Exact Product Name</a>.</p>
- This line is purely a call-to-action — it must NOT contain any health or efficacy claim about
  the product, only an invitation to check it out/try it.
- Result: when a product is provided, the article contains exactly TWO links to it — the one
  natural in-body mention, and this separate CTA line right before the disclaimer. If NO product
  is provided, do not add any CTA line at all.
`.trim();

const EN_SYSTEM_PROMPT = `
You are an expert English SEO content writer for ${WRITER_STORE_EN}.${primaryLanguageNote('en')}

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
- body_en_html: TARGET LENGTH ~1500-2200 words. Valid HTML using only <h2>, <h3>, <p>,
  <ul>/<li>. No <h1> in the body (the title is separate). No inline styles, no <script>,
  no other tags. Structure, in this order:
  1. A short intro (2-4 sentences, no H2 heading) introducing the topic.
  2. 6 to 9 <h2> sections covering the topic thoroughly and logically; some (not all) of them
     should include <h3> subsections and/or <ul>/<li> lists where that helps readability.
  3. A checklist section: <h2>Checklist</h2> followed by <ul>/<li> with practical, checkable
     points related to the topic (e.g. what to check on the label, what to look for when
     choosing) — not medical advice or dosage framed as treatment.
  4. An FAQ section: <h2>Frequently Asked Questions</h2>, containing 5 to 8 question/answer
     pairs, each as <h3>question</h3><p>answer</p>.
  5. A short conclusion (2-4 sentences) wrapping up the article — no new H2 heading unless it's
     part of the last content section.
  The mandatory CLOSING CTA (if a product is present) and the disclaimer paragraph go after the
  conclusion, at the very end of body_en_html, in the order described under CLOSING CTA above.
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

function buildProductLineBg(product, anchors) {
  if (!product) {
    return 'ПРОДУКТ: няма предоставен продукт — не добавяй връзка към продукт.';
  }
  const name = product.title_bg ?? product.title;
  let line = `ПРОДУКТ (спомени максимум веднъж, само ако естествено пасва): "${name}" — ${product.url}`;
  if (anchors?.inlineAnchorBg) {
    line += `\nТЕКСТ НА ВРЪЗКАТА В ТЕКСТА: "${anchors.inlineAnchorBg}"`;
  }
  if (anchors?.ctaAnchorBg) {
    line += `\nТЕКСТ НА ВРЪЗКАТА В CTA: "${anchors.ctaAnchorBg}"`;
  }
  return line;
}

function buildProductLineEn(product, anchors) {
  if (!product) {
    return 'PRODUCT: none provided — do not add a product link.';
  }
  let line = `PRODUCT (mention at most once, only if it genuinely fits): "${product.title}" — ${product.url}`;
  if (anchors?.inlineAnchorEn) {
    line += `\nINLINE ANCHOR TEXT: "${anchors.inlineAnchorEn}"`;
  }
  if (anchors?.ctaAnchorEn) {
    line += `\nCTA ANCHOR TEXT: "${anchors.ctaAnchorEn}"`;
  }
  return line;
}

function buildFixedTitleLineBg(fixedTitleBg) {
  if (!fixedTitleBg) return null;
  return (
    `ЗАГЛАВИЕ (ЗАДЪЛЖИТЕЛНО, ИЗПОЛЗВАЙ ТОЧНО ТАКА): "${fixedTitleBg}"\n` +
    'Това е окончателното, вече фиксирано заглавие на статията — върни го БУКВАЛНО, дума по ' +
    'дума и знак по знак, в полето "title_bg". НЕ съчинявай друго заглавие и не го перифразирай. ' +
    'Напиши body_bg_html, meta_bg и summary_bg така, че да пасват логично и естествено на това ' +
    'заглавие и неговия фокус.'
  );
}

function buildFixedTitleLineEn(fixedTitleEn) {
  if (!fixedTitleEn) return null;
  return (
    `TITLE (MANDATORY, USE EXACTLY AS GIVEN): "${fixedTitleEn}"\n` +
    'This is the final, already-fixed title of the article — return it VERBATIM, word for word ' +
    'and punctuation for punctuation, in the "title_en" field. Do NOT invent a different title or ' +
    'paraphrase it. Write body_en_html, meta_en, and summary_en so they cohere naturally with ' +
    'this title and its focus.'
  );
}

function buildBgPrompt(topic, product, anchors, fixedTitleBg) {
  const angleLine = topic.angle
    ? `Ъгъл/фокус на статията: ${topic.angle}`
    : 'Няма зададен конкретен ъгъл — избери подходящ информативен фокус за темата.';
  return [buildFixedTitleLineBg(fixedTitleBg), `Ключова дума: ${topic.keyword}`, angleLine, buildProductLineBg(product, anchors)]
    .filter(Boolean)
    .join('\n');
}

function buildEnPrompt(topic, product, anchors, fixedTitleEn) {
  const angleLine = topic.angle
    ? `Angle/focus (noted in Bulgarian — write about this same angle, natively in English): ${topic.angle}`
    : 'No specific angle given — choose an appropriate informative focus for the topic.';
  return [
    buildFixedTitleLineEn(fixedTitleEn),
    `Topic keyword (Bulgarian phrasing — translate the underlying concept, do not write in Bulgarian): ${topic.keyword}`,
    angleLine,
    buildProductLineEn(product, anchors),
  ]
    .filter(Boolean)
    .join('\n');
}

// topic: { keyword: string, angle: string | null }
// product: the object returned by matchProduct.js (needs title, title_bg, url), or null/
// undefined if no product cleared the relevance guards — in which case the article is
// written with no product link at all.
// anchors: { inlineAnchorBg, ctaAnchorBg, inlineAnchorEn, ctaAnchorEn } — one anchor pair per
// language, chosen per-article by index.js's processTopic() from config.productLink. Ignored
// when product is null; falls back to the full product name if omitted (see
// PRODUCT_LINK_INSTRUCTIONS_BG/EN above).
// fixedTitleBg / fixedTitleEn: when the topic comes from the fixed editorial calendar
// (topics.fixed_title_bg/fixed_title_en), these carry that exact title through. The model is
// told to use them verbatim and write the rest of the article to fit; the returned title_bg/
// title_en are then forced back to these exact strings regardless of what the model actually
// returned, since a model can still lightly reword a title despite instructions. When absent,
// title_bg/title_en come straight from the model as before.
// English and Bulgarian are generated independently and in parallel — neither
// is a translation/adaptation of the other, both are full-quality articles
// under the same store guardrails. Which one is canonical is decided at publish
// time from store.config.js's primaryLocale.
export async function writeArticle(topic, { product = null, anchors = null, fixedTitleBg = null, fixedTitleEn = null } = {}) {
  const [bgArticle, enArticle] = await Promise.all([
    generateJson({ system: BG_SYSTEM_PROMPT, prompt: buildBgPrompt(topic, product, anchors, fixedTitleBg) }),
    generateJson({ system: EN_SYSTEM_PROMPT, prompt: buildEnPrompt(topic, product, anchors, fixedTitleEn) }),
  ]);

  return {
    title_bg: fixedTitleBg ?? bgArticle.title_bg,
    meta_bg: bgArticle.meta_bg,
    body_bg_html: bgArticle.body_bg_html,
    summary_bg: bgArticle.summary_bg,
    title_en: fixedTitleEn ?? enArticle.title_en,
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
