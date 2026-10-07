// Single source of truth for the authorised EU vitamin C / collagen health
// claim wording (EU Regulation (EC) No 1924/2006 / (EU) No 432/2012). Do NOT
// duplicate this string elsewhere — import it. Getting a word in this claim
// wrong (e.g. "synthesis" vs "formation") is a real compliance issue, and it
// has already caused false-positive compliance flags once from drift between
// copies.
export const APPROVED_VITAMIN_C_CLAIM_BG =
  'Витамин С допринася за нормалното образуване на колаген за нормалната функция на кожата, костите и хрущялите.';

export const APPROVED_VITAMIN_C_CLAIM_EN =
  'Vitamin C contributes to normal collagen formation for the normal function of skin, bones and cartilage.';

// ---------------------------------------------------------------------------
// Engine contract — every store's regulatory.js exports these four blocks
// (see src/lib/storeRegulatory.js). They are this store's whole compliance
// profile: what the writer may say, what the independent auditor flags, and
// what featured images must never show.
// ---------------------------------------------------------------------------

// Mandatory disclaimer, verbatim. linkArticles.js inserts related-article
// links right before the paragraph that starts with the BG text.
export const DISCLAIMER_BG = 'Хранителните добавки не са заместител на разнообразното хранене и здравословния начин на живот.';
export const DISCLAIMER_EN =
  'Food supplements should not be used as a substitute for a varied and balanced diet and a healthy lifestyle.';

// Writer guardrails (src/steps/writeArticle.js), one per article language.
// TODO: wire in a CollagenLab-specific approved-claim list (exact allowed
// phrasing per product line) for tighter, legal/marketing-reviewed control
// once that list exists. Until then this is a general EC 1924/2006 guardrail.
export const WRITER_GUARDRAILS_BG = `
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
- НИКОГА не използвай формулировки за ефективността на самия колаген от рода на "изследванията
  показват обещаващи резултати за хидратацията/еластичността на кожата" или "доказано подобрява
  кожата/ставите" — дори хеджирани с "може да" или "според някои изследвания". Единствената
  претенция, свързана с колаген, която статията може да съдържа, е одобрената претенция за
  витамин C по-горе; всичко останало за ролята на колагена трябва да остане чисто описателно
  (структурен белтък, естествен спад на синтеза с възрастта) — без намек за резултат от прием.
- Статията ТРЯБВА да включва естествено, близо до края, задължителното предупреждение:
  "Хранителните добавки не са заместител на разнообразното хранене и здравословния начин на
  живот."
`.trim();

export const WRITER_GUARDRAILS_EN = `
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
- NEVER use collagen-efficacy phrasing such as "studies show promising results for skin
  hydration/elasticity" or "proven to improve skin/joints" — even hedged with "may" or "some
  studies suggest". The only collagen-related claim the article may contain is the authorised
  vitamin C claim above; everything else about collagen's role must stay purely descriptive
  (structural protein, natural decline in synthesis with age) — no implied outcome from taking it.
- The article MUST naturally include, near the end, the mandatory disclaimer: "Food supplements
  should not be used as a substitute for a varied and balanced diet and a healthy lifestyle."
`.trim();

// Independent auditor brief (src/steps/compliance.js). The engine appends the
// JSON output format; everything about WHAT to flag lives here.
export const AUDIT_BRIEF = `
You are an independent regulatory compliance auditor for CollagenLab, a Bulgarian/EU
e-commerce store selling collagen peptide food supplements. You did NOT write the article
under review — you are a separate, independent auditor checking finished copy against EU
Regulation (EC) No 1924/2006 on nutrition and health claims made on foods.

Scan the ENTIRE article — both the English text and the Bulgarian text — and flag every
violation you find. Assess the en and bg content separately; a violation may exist in one
language and not the other. Both languages are published, independently, and both must pass.

SEVERITY RULES:

HIGH severity:
- Disease treatment / cure / prevention claims (e.g. "лекува", "предотвратява болест",
  "cures", "treats", "prevents [disease]").
- Attributing specific health outcomes to collagen as an established fact (not hedged).
- An unauthorised health claim presented as if it were an authorised one.

MEDIUM severity:
- Implied medical benefits without hedging language.
- Claiming the product is "безопасно за всички" / "suitable for everyone".

LOW severity:
- The mandatory "food supplements are not a substitute for a varied diet and a healthy
  lifestyle" disclaimer is missing.
- The vitamin C claim is present but worded slightly differently from the authorised
  wording.
- Vague efficacy implications that are minor but worth a human's attention.

NOT a violation — do not flag these:
- Describing collagen's biological role (structural protein in skin, cartilage,
  connective tissue).
- Hedged, educational statements ("може да", "според някои изследвания", "may", "some
  studies suggest").
- A correctly-attributed vitamin C claim ("${APPROVED_VITAMIN_C_CLAIM_BG}" in Bulgarian, or
  "${APPROVED_VITAMIN_C_CLAIM_EN}" in English).
`.trim();

// Appended to every featured-image prompt (src/steps/generateImage.js).
export const IMAGE_RULES =
  'No text, no words, no typography, no logos, no watermarks anywhere in the image other than ' +
  'what is already printed on the reference product pouch itself (when a reference is used). ' +
  'Do NOT include: medical or clinical settings, hospital or pharmacy imagery, before/after ' +
  'comparison shots, doctors or people in white lab coats, pills or capsules presented as ' +
  'medicine, close-ups implying wrinkles or joints are being medically treated or cured, any ' +
  'invented claim text or badges, or any imagery that implies a medical claim or treatment. No ' +
  'people in the frame.';
