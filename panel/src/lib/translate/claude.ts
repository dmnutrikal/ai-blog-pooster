import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { EngineError, type TranslateRequest, type TranslateResult, type TranslationEngine } from "./engine";

// Haiku for bulk text, Sonnet for product pages (see the plan, "Стек").
export const MODELS = {
  bulk: "claude-haiku-5-5",
  product: "claude-sonnet-5-5",
} as const;

// USD per million tokens, standard (non-batch) rates. Verify against
// https://www.anthropic.com/pricing before relying on job cost figures.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

const OutputSchema = z.object({
  translations: z.array(z.object({ id: z.string(), text: z.string() })),
});

// Kept identical across requests so it can be cached; everything request-specific goes in the user turn.
const SYSTEM_PROMPT = `You translate content of a Shopify online store. The store sells food supplements, so accuracy matters more than style: a mistranslated health or ingredient claim can break the law in the target market.

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

function buildUserMessage(req: TranslateRequest): string {
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

export interface ClaudeEngineOptions {
  model?: string;
  effort?: "low" | "medium" | "high";
  client?: Anthropic;
}

export class ClaudeEngine implements TranslationEngine {
  readonly name = "claude";
  readonly model: string;
  private readonly effort: "low" | "medium" | "high";
  private readonly client: Anthropic;

  constructor(options: ClaudeEngineOptions = {}) {
    this.model = options.model ?? MODELS.bulk;
    this.effort = options.effort ?? "medium";
    this.client = options.client ?? new Anthropic();
  }

  async translate(req: TranslateRequest): Promise<TranslateResult> {
    let response;
    try {
      response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(req) }],
        output_config: { effort: this.effort, format: zodOutputFormat(OutputSchema) },
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
        throw new EngineError(`Claude API temporarily unavailable: ${err.message}`, true);
      }
      if (err instanceof Anthropic.APIError) throw new EngineError(`Claude API error: ${err.message}`, false);
      throw err;
    }

    if (response.stop_reason === "refusal") {
      throw new EngineError(`Model declined the batch (${response.stop_details?.category ?? "no category"})`, false);
    }
    if (response.stop_reason === "max_tokens") {
      throw new EngineError("Output hit max_tokens; send a smaller batch", false);
    }
    const parsed = response.parsed_output;
    if (!parsed) throw new EngineError("Model output did not match the schema", true);

    // A missing or extra id fails the whole batch.
    const expected = new Set(req.items.map((i) => i.id));
    const translations = new Map<string, string>();
    for (const t of parsed.translations) {
      if (!expected.has(t.id) || translations.has(t.id)) {
        throw new EngineError(`Unexpected or duplicate id "${t.id}" in model output`, true);
      }
      translations.set(t.id, t.text);
    }
    const missing = [...expected].filter((id) => !translations.has(id));
    if (missing.length) throw new EngineError(`Model output is missing ids: ${missing.join(", ")}`, true);

    const { input_tokens, output_tokens } = response.usage;
    return {
      translations,
      usage: {
        model: this.model,
        inputTokens: input_tokens,
        outputTokens: output_tokens,
        costUsd: costUsd(this.model, input_tokens, output_tokens),
      },
    };
  }
}
