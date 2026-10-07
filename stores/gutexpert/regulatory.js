// GutExpert — compliance profile (EU Regulation (EC) No 1924/2006 on nutrition
// and health claims, and the Union register of authorised claims, Regulation
// (EU) No 432/2012).
//
// The catalog is probiotics / live cultures, digestive enzymes, butyrate
// (tributyrin) and lactase. Of all of that, exactly ONE health claim is
// authorised: lactase, in a lactose context. "Probiotic" benefit claims are
// not authorised in the EU at all, nor are any for butyrate/tributyrin or
// enzyme blends — so everything else has to stay factual (what it is, what it
// contains, how it's used) or general gut education with no product benefit.
//
// Single source of truth for the approved wording — do NOT duplicate these
// strings elsewhere, import them.
export const APPROVED_LACTASE_CLAIM_BG =
  'Лактазната ензимна активност подобрява разграждането на лактозата при хора, които имат затруднения с храносмилането на лактоза.';

export const APPROVED_LACTASE_CLAIM_EN =
  'Lactase enzyme improves lactose digestion in individuals who have difficulty digesting lactose.';

// ---------------------------------------------------------------------------
// Engine contract — see src/lib/storeRegulatory.js.
// ---------------------------------------------------------------------------

// Mandatory disclaimer, verbatim. linkArticles.js inserts related-article
// links right before the paragraph that starts with the BG text.
export const DISCLAIMER_BG =
  'Хранителните добавки не са заместител на разнообразното и балансирано хранене и здравословния начин на живот. ' +
  'При бременност, кърмене, заболяване или прием на лекарства се консултирайте с медицински специалист.';

export const DISCLAIMER_EN =
  'Food supplements should not be used as a substitute for a varied and balanced diet and a healthy lifestyle. ' +
  'If you are pregnant, breastfeeding, have a medical condition or are taking medication, consult a healthcare professional.';

// On-pack phrases that are fine on the label but must never be echoed as a
// claim in blog copy.
const ON_PACK_PHRASES_EN = ['Gut Integrity Support', 'Digestion Support', 'Gastroenterologist Approved'];

// Writer guardrails (src/steps/writeArticle.js), one per article language.
export const WRITER_GUARDRAILS_BG = `
РЕГУЛАТОРНИ ОГРАНИЧЕНИЯ — Регламент (ЕО) № 1924/2006 относно хранителни и здравни претенции:
- Съдържанието е за ХРАНИТЕЛНИ ДОБАВКИ (пробиотици/живи култури, храносмилателни ензими,
  бутират/трибутирин, лактаза), НЕ лекарства.
- ЕДИНСТВЕНАТА разрешена здравна претенция е за ЛАКТАЗАТА и само в контекст на лактоза:
  "${APPROVED_LACTASE_CLAIM_BG}" Ако статията я използва, тя ТРЯБВА да е приписана изрично на
  ензима лактаза, с точно тази формулировка, и само когато темата е лактоза/млечни продукти.
  НЕ я разширявай към други ензими, пробиотици, общо храносмилане или "стомашен комфорт".
- ЗАБРАНЕНО: всякаква претенция за полза (дори хеджирана с "може да", "подкрепя", "допринася",
  "според изследвания") за пробиотици, живи култури, щамове, CFU, бутират/трибутирин или
  ензимни комплекси — за червата, храносмилането, имунитета, микробиома, чревната
  бариера/лигавица/"интегритет", подуването, газовете, IBS/СРДВ, SIBO или "пропускливи черва".
  Например НЕ пиши: "пробиотиците подкрепят микробиома", "бутиратът подкрепя чревната бариера",
  "ензимите намаляват подуването", "за по-добро храносмилане".
- НИКОГА не твърди и не подразбирай, че продукт лекува, облекчава, предотвратява или изцелява
  заболяване или състояние (IBS, SIBO, "leaky gut", колит, лактозна непоносимост като болест и
  т.н.). Никакви медицински съвети, диагнози, схеми на лечение или истории "преди/след".
- НЕ повтаряй надписите от опаковката като претенции в текста: "Gut Integrity Support",
  "Digestion Support", "Gastroenterologist Approved" (и преводите им, напр. "одобрено от
  гастроентеролог", "подкрепа за храносмилането", "подкрепа за чревния интегритет").
- НИКОГА не твърди, че продукт е "безопасен за всички" или "подходящ за всеки". НИКОГА не
  представяй дозировка като медицински съвет — само "според указанията на етикета".
- ИЗБЯГВАЙ превъзходни степени за ефективност: "най-добрият", "най-мощният", "доказано
  ефективен", "клинично доказан", "гарантиран резултат" и подобни.
- РАЗРЕШЕНО (фактологично): че продуктът съдържа живи култури; "съдържа [щам]"; брой щамове и
  CFU; вид на ензимите (протеаза, липаза, амилаза, лактаза...) и активността им в единици;
  състав, форма (капсули), начин на прием и съхранение според етикета.
- РАЗРЕШЕНО (образователно): обща информация за храносмилателната система, микробиома,
  фибрите, ферментиралите храни и храненето — като наука/образование, БЕЗ да се свързва с
  ползи от продукта или от прием на добавка.
- Думата "пробиотик" е разрешена само като наименование на категория ("пробиотичен продукт",
  "пробиотик комплекс"), НИКОГА заедно с претенция за полза.
- Предпочитай неутрални, описателни формулировки: "съдържа", "представлява", "изследва се",
  "в научната литература се обсъжда" — без обещания за резултат.
- Статията ТРЯБВА да включва естествено, близо до края, задължителното предупреждение (дословно):
  "${DISCLAIMER_BG}"
`.trim();

export const WRITER_GUARDRAILS_EN = `
REGULATORY GUARDRAILS — EU Regulation (EC) No 1924/2006 on nutrition and health claims:
- This is content for FOOD SUPPLEMENTS (probiotics/live cultures, digestive enzymes,
  butyrate/tributyrin, lactase), NOT medicines.
- The ONLY authorised health claim is for LACTASE, and only in a lactose context:
  "${APPROVED_LACTASE_CLAIM_EN}" If the article uses it, it MUST be attributed explicitly to the
  lactase enzyme, using this exact wording, and only where the topic is lactose/dairy. Do NOT
  extend it to other enzymes, probiotics, digestion in general or "gut comfort".
- FORBIDDEN: any benefit claim (even hedged with "may", "supports", "contributes to", "studies
  suggest") for probiotics, live cultures, strains, CFU, butyrate/tributyrin or enzyme blends —
  for the gut, digestion, immunity, the microbiome, the intestinal barrier/lining/"integrity",
  bloating, gas, IBS, SIBO or "leaky gut". For example do NOT write: "probiotics support the
  microbiome", "butyrate supports the gut barrier", "enzymes reduce bloating", "for better
  digestion".
- NEVER state or imply that a product treats, cures, alleviates, prevents or heals any disease
  or condition (IBS, SIBO, leaky gut, colitis, lactose intolerance as a disease, etc.). No
  medical advice, diagnoses, treatment protocols or before/after stories.
- Do NOT echo on-pack phrases as claims in the copy: ${ON_PACK_PHRASES_EN.map((p) => `"${p}"`).join(', ')}
  (or paraphrases such as "approved by gastroenterologists", "supports digestion", "supports
  gut integrity").
- NEVER claim a product is "safe for everyone" or "suitable for everyone". NEVER present dosage
  as medical advice — only "as directed on the label".
- AVOID superlatives about efficacy: "the best", "the most powerful", "proven effective",
  "clinically proven", "guaranteed results", and similar.
- ALLOWED (factual): that a product contains live cultures; "contains [strain]"; strain count
  and CFU; enzyme types (protease, lipase, amylase, lactase...) and their activity units;
  composition, format (capsules), how to take and store it per the label.
- ALLOWED (educational): general information about the digestive system, the microbiome, fibre,
  fermented foods and nutrition — framed as science/education, WITHOUT linking it to a benefit
  of the product or of taking a supplement.
- "Probiotic" may be used as a category term only ("probiotic product", "probiotic complex"),
  NEVER together with a benefit claim.
- Prefer neutral, descriptive phrasing: "contains", "is", "is being studied", "is discussed in
  the scientific literature" — no promised outcome.
- The article MUST naturally include, near the end, the mandatory disclaimer (verbatim):
  "${DISCLAIMER_EN}"
`.trim();

// Independent auditor brief (src/steps/compliance.js). The engine appends the
// JSON output format.
export const AUDIT_BRIEF = `
You are an independent regulatory compliance auditor for GutExpert, a Bulgarian/EU
e-commerce store selling gut-focused food supplements: a multi-strain probiotic (live
cultures, CFU), a digestive multi-enzyme complex, butyrate (tributyrin) and lactase. You did
NOT write the article under review — you are a separate, independent auditor checking finished
copy against EU Regulation (EC) No 1924/2006 on nutrition and health claims made on foods.

Scan the ENTIRE article — both the English text and the Bulgarian text — and flag every
violation you find. Assess the en and bg content separately; a violation may exist in one
language and not the other. Both languages are published, independently, and both must pass.

KEY FACT: the ONLY authorised health claim in scope is for lactase, in a lactose context:
"${APPROVED_LACTASE_CLAIM_EN}" / "${APPROVED_LACTASE_CLAIM_BG}". There are NO authorised claims
for probiotics / live cultures / strains / CFU, butyrate / tributyrin, or enzyme blends.

SEVERITY RULES:

HIGH severity:
- Disease treatment / cure / prevention claims, including IBS, SIBO, "leaky gut", colitis,
  lactose intolerance as a condition to be treated (e.g. "лекува", "облекчава СРДВ", "cures",
  "treats", "relieves IBS", "heals the gut lining").
- ANY benefit claim for probiotics / live cultures / strains / CFU, butyrate / tributyrin, or
  enzyme blends — for the gut, digestion, immunity, the microbiome, the intestinal barrier /
  lining / integrity, bloating or gas — whether or not it is hedged ("may support", "helps",
  "contributes to", "studies suggest"), and whether it names the product or the ingredient.
- The lactase claim applied to anything other than lactase in a lactose context (e.g. to the
  multi-enzyme complex, to probiotics, or to digestion in general).
- On-pack phrases echoed as claims: "Gut Integrity Support", "Digestion Support",
  "Gastroenterologist Approved" (or their Bulgarian translations / close paraphrases).
- Medical advice (diagnosis, treatment protocols, dosing as treatment) or before/after
  stories.

MEDIUM severity:
- Implied benefits without an explicit claim (e.g. a product linked right next to a sentence
  about "a healthier gut", or "for a happy gut" framing).
- Claiming a product is "безопасен за всички" / "suitable for everyone".
- Efficacy superlatives: "най-добрият", "the best", "most powerful", "clinically proven",
  "guaranteed results".

LOW severity:
- The mandatory disclaimer is missing or incomplete. Expected (BG): "${DISCLAIMER_BG}"
- The lactase claim is present, correctly attributed, but worded slightly differently from the
  authorised wording.
- Vague efficacy implications that are minor but worth a human's attention.

NOT a violation — do not flag these:
- Factual product statements: contains live cultures, "contains [strain]", number of strains,
  CFU count, enzyme types and activity units, composition, capsule format, how to take or store
  it per the label.
- General, educational content about digestion, the microbiome, fibre or fermented foods that
  does NOT attribute a benefit to the product or to taking a supplement.
- "Probiotic" used purely as a category name.
- The authorised lactase claim, correctly attributed to lactase in a lactose context
  ("${APPROVED_LACTASE_CLAIM_BG}" in Bulgarian, or "${APPROVED_LACTASE_CLAIM_EN}" in English).
`.trim();

// Appended to every featured-image prompt (src/steps/generateImage.js).
// Mirrors collagenlab's image rules, for a capsule-bottle product.
export const IMAGE_RULES =
  'No text, no words, no typography, no logos, no watermarks anywhere in the image other than ' +
  'what is already printed on the reference product bottle itself (when a reference is used). ' +
  'Do NOT include: medical or clinical settings, hospital or pharmacy imagery, before/after ' +
  'comparison shots, doctors or people in white lab coats, loose pills or capsules presented as ' +
  'medicine, anatomical imagery of the gut or stomach, people holding their stomach or showing ' +
  'digestive discomfort or relief, any invented claim text or badges, or any imagery that ' +
  'implies a medical claim or treatment. No people in the frame.';
