// The translation prompt and output handling shared by every engine (Claude, OpenAI).
// Engine-specific wire formats live in the engine files; what the model is asked to do
// and how its answer is checked must not differ between engines.

import { z } from "zod";
import { EngineError, type TranslateRequest } from "./engine";

export const OutputSchema = z.object({
  translations: z.array(z.object({ id: z.string(), text: z.string() })),
});

// Kept identical across requests so it can be cached; everything request-specific goes in the user turn.
export const SYSTEM_PROMPT = `You translate content of a Shopify online store. The store sells food supplements, so accuracy matters more than style: a mistranslated health or ingredient claim can break the law in the target market.

You receive a JSON list of items. Translate the "text" of every item from the source language into the target language and return one entry per item with the same "id". Do not skip, merge, split or add items.

Rules:
- Markers like ⟦0⟧, ⟦1⟧ stand for content that must not change (code, links, emails, brand names). Copy every marker exactly once into the translation. You may move a marker within the sentence if the grammar of the target language needs it.
- Items of kind "html": keep every tag and every attribute exactly as in the source, in the same order. Translate only the visible text between tags and the values of alt and title attributes.
- Items of kind "url": return the text unchanged.
- Apply every "translate as" rule from the glossary exactly as given.
- Health, nutrition and ingredient statements: translate them faithfully. Do not make a claim stronger, weaker, more specific or more general than in the source.
- Keep numbers, units, dosages, product codes and measurements as they are; adapt only the decimal separator to the target language convention.
- Text that is already in the target language, or that has nothing to translate (codes, SKUs), is returned unchanged.
- Write natural text for a shopper in the target market, following the tone and instructions given for the store and the language.`;

export function buildUserMessage(req: TranslateRequest): string {
  const parts = [`Source language: ${req.sourceLocale}`, `Target language: ${req.targetLocale}`];
  if (req.storeContext) parts.push(`<store_context>\n${req.storeContext}\n</store_context>`);
  if (req.tone) parts.push(`<tone>\n${req.tone}\n</tone>`);
  if (req.instructions) parts.push(`<language_instructions>\n${req.instructions}\n</language_instructions>`);
  if (req.translateAs?.length) {
    parts.push(`<glossary_translate_as>\n${req.translateAs.map((g) => `${g.source} => ${g.target}`).join("\n")}\n</glossary_translate_as>`);
  }
  const items = req.items.map(({ id, text, kind, field }) => ({ id, kind, ...(field ? { field } : {}), text }));
  parts.push(`<items>\n${JSON.stringify(items, null, 1)}\n</items>`);
  return parts.join("\n\n");
}

// A missing, unexpected or duplicate id fails the whole batch.
export function collectTranslations(items: TranslateRequest["items"], output: z.infer<typeof OutputSchema>): Map<string, string> {
  const expected = new Set(items.map((i) => i.id));
  const translations = new Map<string, string>();
  for (const t of output.translations) {
    if (!expected.has(t.id) || translations.has(t.id)) {
      throw new EngineError(`Unexpected or duplicate id "${t.id}" in model output`, true);
    }
    translations.set(t.id, t.text);
  }
  const missing = [...expected].filter((id) => !translations.has(id));
  if (missing.length) throw new EngineError(`Model output is missing ids: ${missing.join(", ")}`, true);
  return translations;
}
