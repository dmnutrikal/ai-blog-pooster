import { describe, expect, it } from "vitest";
import { EngineError } from "../src/lib/translate/engine";
import { MODELS, OpenAIEngine, costUsd } from "../src/lib/translate/openai";

function completionResponse(translations: { id: string; text: string }[], overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ translations }), refusal: null }, ...overrides }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
    { status: 200 },
  );
}

function engineWith(fetchImpl: typeof fetch, model?: string) {
  return new OpenAIEngine({ apiKey: "test-key", model, fetchImpl });
}

const req = {
  sourceLocale: "en",
  targetLocale: "de",
  items: [{ id: "title", text: "Buy ⟦0⟧", kind: "text" as const }],
};

describe("OpenAIEngine", () => {
  it("sends a strict json_schema request and returns translations with usage", async () => {
    let captured: { url: string; body: Record<string, unknown> } | undefined;
    const engine = engineWith(async (url, init) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      return completionResponse([{ id: "title", text: "Kaufen ⟦0⟧" }]);
    });

    const result = await engine.translate(req);

    expect(captured!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(captured!.body.model).toBe(MODELS.bulk);
    const format = captured!.body.response_format as { type: string; json_schema: { strict: boolean } };
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.strict).toBe(true);
    expect(result.translations.get("title")).toBe("Kaufen ⟦0⟧");
    expect(result.usage).toEqual({
      model: MODELS.bulk,
      inputTokens: 100,
      outputTokens: 50,
      costUsd: costUsd(MODELS.bulk, 100, 50),
    });
  });

  it("marks 429 and 5xx as retryable, other statuses as not", async () => {
    const at = (status: number) => engineWith(async () => new Response(JSON.stringify({ error: { message: "x" } }), { status }));
    await expect(at(429).translate(req)).rejects.toMatchObject({ name: "EngineError", retryable: true });
    await expect(at(500).translate(req)).rejects.toMatchObject({ name: "EngineError", retryable: true });
    await expect(at(400).translate(req)).rejects.toMatchObject({ name: "EngineError", retryable: false });
  });

  it("fails the batch on a missing or unexpected id", async () => {
    const missing = engineWith(async () => completionResponse([]));
    await expect(missing.translate(req)).rejects.toThrow(/missing ids/);
    const unexpected = engineWith(async () => completionResponse([{ id: "other", text: "x" }]));
    await expect(unexpected.translate(req)).rejects.toThrow(/Unexpected or duplicate/);
  });

  it("refuses to run without an API key and surfaces refusals and truncation", async () => {
    const noKey = new OpenAIEngine({ apiKey: "", fetchImpl: async () => completionResponse([]) });
    await expect(noKey.translate(req)).rejects.toThrow(/OPENAI_API_KEY/);

    const refused = engineWith(async () =>
      completionResponse([], { message: { content: null, refusal: "no" } }),
    );
    await expect(refused.translate(req)).rejects.toMatchObject({ retryable: false });

    const truncated = engineWith(async () =>
      completionResponse([], { finish_reason: "length", message: { content: "{", refusal: null } }),
    );
    await expect(truncated.translate(req)).rejects.toThrow(/max_completion_tokens/);
  });

  it("treats malformed model output as retryable", async () => {
    const engine = engineWith(async () =>
      completionResponse([], { message: { content: "not json", refusal: null } }),
    );
    const err = await engine.translate(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).retryable).toBe(true);
  });
});
