// Which engine and model a job runs on. TRANSLATE_ENGINE picks the engine
// ("openai" or "claude"); the kind picks the model tier within it.

import { ClaudeEngine, MODELS as CLAUDE_MODELS } from "./claude";
import type { TranslationEngine } from "./engine";
import { MODELS as OPENAI_MODELS, OpenAIEngine } from "./openai";

export type ModelKind = "bulk" | "product";

export function engineFromEnv(kind: ModelKind = "bulk"): TranslationEngine {
  const engine = (process.env.TRANSLATE_ENGINE ?? "openai").trim().toLowerCase();
  switch (engine) {
    case "openai":
      return new OpenAIEngine({ model: OPENAI_MODELS[kind] });
    case "claude":
      return new ClaudeEngine({ model: CLAUDE_MODELS[kind] });
    default:
      throw new Error(`Unknown TRANSLATE_ENGINE "${engine}" — use "openai" or "claude"`);
  }
}
