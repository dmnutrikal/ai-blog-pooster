// Engine-agnostic translation interface. Claude is the first implementation;
// DeepL or OpenAI can be added later behind the same interface.

import type { ContentKind } from "./validate";

export interface TranslateItem {
  id: string;
  text: string; // already masked
  kind: ContentKind;
  // Shopify key, e.g. "title" or "body_html"; helps the model pick register and length.
  field?: string;
}

export interface GlossaryEntry {
  source: string;
  target: string;
}

export interface TranslateRequest {
  sourceLocale: string;
  targetLocale: string;
  items: TranslateItem[];
  translateAs?: GlossaryEntry[]; // "Translate as" rules for this target locale
  storeContext?: string;
  tone?: string;
  instructions?: string; // per-locale instructions, e.g. "Use Sie, not du"
}

export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface TranslateResult {
  translations: Map<string, string>;
  usage: Usage;
}

export interface TranslationEngine {
  readonly name: string;
  translate(req: TranslateRequest): Promise<TranslateResult>;
}

export class EngineError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "EngineError";
  }
}
