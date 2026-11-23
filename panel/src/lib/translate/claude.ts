import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { EngineError, type TranslateRequest, type TranslateResult, type TranslationEngine } from "./engine";
import { buildUserMessage, collectTranslations, OutputSchema, SYSTEM_PROMPT } from "./prompt";

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

    const translations = collectTranslations(req.items, parsed);

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
