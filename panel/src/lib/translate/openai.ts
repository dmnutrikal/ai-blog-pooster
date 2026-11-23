// OpenAI engine behind the same TranslationEngine interface as Claude. Calls the
// Chat Completions API with a strict JSON schema directly over fetch — the panel
// keeps no OpenAI SDK dependency for one endpoint.

import { EngineError, type TranslateRequest, type TranslateResult, type TranslationEngine } from "./engine";
import { buildUserMessage, collectTranslations, OutputSchema, SYSTEM_PROMPT } from "./prompt";

// The same models the blog pipeline runs on: luna for bulk text, terra for product pages.
export const MODELS = {
  bulk: "gpt-5.6-luna",
  product: "gpt-5.6-terra",
} as const;

// USD per million tokens, standard tier, inputs ≤272K tokens. Verify against
// https://developers.openai.com/api/docs/pricing before relying on job cost figures.
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
  "gpt-5.6-terra": { input: 2, output: 12 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

// Strict structured outputs: every field required, no additional properties.
const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "translations",
    strict: true,
    schema: {
      type: "object",
      properties: {
        translations: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, text: { type: "string" } },
            required: ["id", "text"],
            additionalProperties: false,
          },
        },
      },
      required: ["translations"],
      additionalProperties: false,
    },
  },
} as const;

interface ChatCompletion {
  choices: {
    finish_reason: string;
    message: { content: string | null; refusal: string | null };
  }[];
  usage: { prompt_tokens: number; completion_tokens: number };
}

export interface OpenAIEngineOptions {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class OpenAIEngine implements TranslationEngine {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIEngineOptions = {}) {
    this.model = options.model ?? MODELS.bulk;
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async translate(req: TranslateRequest): Promise<TranslateResult> {
    if (!this.apiKey) throw new EngineError("OPENAI_API_KEY is not set", false);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          max_completion_tokens: 16000,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserMessage(req) },
          ],
          response_format: RESPONSE_FORMAT,
        }),
      });
    } catch (err) {
      throw new EngineError(`OpenAI API unreachable: ${err instanceof Error ? err.message : String(err)}`, true);
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      let detail = "";
      try {
        detail = ((await response.json()) as { error?: { message?: string } }).error?.message ?? "";
      } catch {
        /* keep the status alone */
      }
      throw new EngineError(`OpenAI API error ${response.status}${detail ? `: ${detail}` : ""}`, retryable);
    }

    const completion = (await response.json()) as ChatCompletion;
    const choice = completion.choices[0];
    if (!choice) throw new EngineError("OpenAI returned no choices", true);
    if (choice.message.refusal) throw new EngineError(`Model declined the batch: ${choice.message.refusal}`, false);
    if (choice.finish_reason === "length") throw new EngineError("Output hit max_completion_tokens; send a smaller batch", false);

    let parsed;
    try {
      parsed = OutputSchema.parse(JSON.parse(choice.message.content ?? ""));
    } catch {
      throw new EngineError("Model output did not match the schema", true);
    }

    const translations = collectTranslations(req.items, parsed);

    const { prompt_tokens, completion_tokens } = completion.usage;
    return {
      translations,
      usage: {
        model: this.model,
        inputTokens: prompt_tokens,
        outputTokens: completion_tokens,
        costUsd: costUsd(this.model, prompt_tokens, completion_tokens),
      },
    };
  }
}
