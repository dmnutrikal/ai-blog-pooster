import { describe, expect, it } from "vitest";
import type { TranslateRequest, TranslateResult, TranslationEngine } from "../src/lib/translate/engine";
import { contentKind, translateBatch } from "../src/lib/translate/pipeline";
import { mask, unmask } from "../src/lib/translate/placeholders";
import { tagSequence, validateTranslation } from "../src/lib/translate/validate";

describe("mask / unmask", () => {
  it("protects Liquid, URLs, emails and never-translate terms, and restores them", () => {
    const src = "Hi {{ customer.name }}, CollagenLab ships fast. See https://collagenlab.eu/faq or mail info@collagenlab.eu {% if x %}!{% endif %}";
    const m = mask(src, ["CollagenLab"]);
    expect(m.text).not.toMatch(/customer\.name|https:|info@|CollagenLab|\{%/);
    expect(m.tokens).toHaveLength(6);
    expect(unmask(m.text, m.tokens)).toBe(src);
  });

  it("matches never-translate terms case-sensitively and on word boundaries", () => {
    const m = mask("collagenlab and CollagenLab and CollagenLabs", ["CollagenLab"]);
    expect(m.tokens).toEqual(["CollagenLab"]);
    expect(m.text).toBe("collagenlab and ⟦0⟧ and CollagenLabs");
  });

  it("prefers the longest term", () => {
    const m = mask("Gut Expert Pro", ["Gut Expert", "Gut Expert Pro"]);
    expect(m.tokens).toEqual(["Gut Expert Pro"]);
  });

  it("does not mask inside an already masked URL", () => {
    const m = mask("https://collagenlab.eu/CollagenLab", ["CollagenLab"]);
    expect(m.tokens).toEqual(["https://collagenlab.eu/CollagenLab"]);
  });
});

describe("validateTranslation", () => {
  it("accepts a faithful HTML translation", () => {
    expect(validateTranslation("<p>Hello <strong>⟦0⟧</strong></p>", "<p>Hallo <strong>⟦0⟧</strong></p>", "html")).toEqual([]);
  });

  it("rejects missing or duplicated markers", () => {
    expect(validateTranslation("Buy ⟦0⟧ now ⟦1⟧", "Kaufen Sie jetzt ⟦1⟧", "text").map((i) => i.code)).toEqual(["markers"]);
    expect(validateTranslation("Buy ⟦0⟧", "⟦0⟧ kaufen ⟦0⟧", "text").map((i) => i.code)).toEqual(["markers"]);
  });

  it("rejects changed HTML tags", () => {
    const issues = validateTranslation("<p>One</p><ul><li>Two</li></ul>", "<p>Eins</p><li>Zwei</li>", "html");
    expect(issues.map((i) => i.code)).toContain("html_tags");
  });

  it("rejects empty and truncated output", () => {
    expect(validateTranslation("Hello", "  ", "text").map((i) => i.code)).toEqual(["empty"]);
    const long = "Collagen peptides support skin elasticity and joint comfort every day.";
    expect(validateTranslation(long, "Kollagen.", "text").map((i) => i.code)).toEqual(["length"]);
  });

  it("reads tag sequences including self-closing and attributes", () => {
    expect(tagSequence('<p class="a">x<br/><img src="y" alt="z"></p>')).toEqual(["p", "br", "img", "/p"]);
  });
});

describe("contentKind", () => {
  it("maps Shopify content types and refuses structured JSON", () => {
    expect(contentKind("SINGLE_LINE_TEXT_FIELD")).toBe("text");
    expect(contentKind("HTML")).toBe("html");
    expect(contentKind("URL")).toBe("url");
    expect(contentKind("RICH_TEXT_FIELD")).toBe("rich_text");
    expect(contentKind("JSON")).toBeNull();
    expect(contentKind("LIST_SINGLE_LINE_TEXT_FIELD")).toBe("list_text");
  });
});

class FakeEngine implements TranslationEngine {
  readonly name = "fake";
  lastRequest?: TranslateRequest;
  constructor(private readonly fn: (text: string) => string) {}
  async translate(req: TranslateRequest): Promise<TranslateResult> {
    this.lastRequest = req;
    return {
      translations: new Map(req.items.map((i) => [i.id, this.fn(i.text)])),
      usage: { model: "fake", inputTokens: 1, outputTokens: 1, costUsd: 0 },
    };
  }
}

describe("translateBatch", () => {
  const base = { sourceLocale: "en", targetLocale: "de", neverTranslate: ["CollagenLab"] };

  it("sends masked text and returns unmasked, validated output", async () => {
    const engine = new FakeEngine((t) => t.replace("Buy", "Kaufen"));
    const out = await translateBatch(engine, [{ id: "title", text: "Buy CollagenLab {{ price }}", kind: "text" }], base);
    expect(engine.lastRequest!.items[0]!.text).toBe("Buy ⟦1⟧ ⟦0⟧");
    expect(out.items[0]).toEqual({ id: "title", ok: true, value: "Kaufen CollagenLab {{ price }}" });
  });

  it("rejects an item whose protected part was dropped", async () => {
    const engine = new FakeEngine(() => "Kaufen");
    const out = await translateBatch(engine, [{ id: "title", text: "Buy CollagenLab", kind: "text" }], base);
    expect(out.items[0]!.ok).toBe(false);
  });

  it("keeps URLs as they are", async () => {
    const engine = new FakeEngine(() => "https://evil.example");
    const out = await translateBatch(engine, [{ id: "u", text: "https://collagenlab.eu", kind: "url" }], base);
    expect(out.items[0]).toEqual({ id: "u", ok: true, value: "https://collagenlab.eu" });
  });
});

describe("structured content (rich text, text lists)", () => {
  const base = { sourceLocale: "en", targetLocale: "de", neverTranslate: ["CollagenLab"] };

  it("translates rich text leaves and keeps the structure byte-identical otherwise", async () => {
    const rich = JSON.stringify({
      type: "root",
      children: [
        { type: "paragraph", children: [{ type: "text", value: "Buy CollagenLab now", bold: true }] },
        { type: "link", url: "https://collagenlab.eu", children: [{ type: "text", value: "Shop" }] },
      ],
    });
    const engine = new FakeEngine((t) => t.replace("Buy", "Kaufen").replace("now", "jetzt").replace("Shop", "Laden"));
    const out = await translateBatch(engine, [{ id: "m1", text: rich, kind: "rich_text" }], base);
    const item = out.items[0]!;
    expect(item.ok).toBe(true);
    const rebuilt = JSON.parse((item as { value: string }).value);
    expect(rebuilt.children[0].children[0].value).toBe("Kaufen CollagenLab jetzt");
    expect(rebuilt.children[0].children[0].bold).toBe(true);
    expect(rebuilt.children[1].url).toBe("https://collagenlab.eu");
    expect(rebuilt.children[1].children[0].value).toBe("Laden");
    // The engine saw plain text parts, not JSON.
    expect(engine.lastRequest!.items.every((i) => i.kind === "text")).toBe(true);
    expect(engine.lastRequest!.items[0]!.text).toContain("Kaufen".length ? "Buy" : "");
  });

  it("translates a list of strings and returns a JSON array", async () => {
    const engine = new FakeEngine((t) => t.toUpperCase());
    const out = await translateBatch(engine, [{ id: "l1", text: JSON.stringify(["one", "two"]), kind: "list_text" }], base);
    expect(out.items[0]).toEqual({ id: "l1", ok: true, value: JSON.stringify(["ONE", "TWO"]) });
  });

  it("fails the item on invalid JSON instead of guessing", async () => {
    const engine = new FakeEngine((t) => t);
    const out = await translateBatch(engine, [{ id: "bad", text: "{not json", kind: "rich_text" }], base);
    const item = out.items[0]!;
    expect(item.ok).toBe(false);
    expect((item as { issues: { code: string }[] }).issues[0]!.code).toBe("structure");
  });

  it("fails the whole item when one part loses a protected marker", async () => {
    const rich = JSON.stringify({ type: "root", children: [{ type: "text", value: "Visit CollagenLab" }, { type: "text", value: "Plain" }] });
    const engine = new FakeEngine((t) => (t.includes("⟦") ? "dropped it" : t));
    const out = await translateBatch(engine, [{ id: "m2", text: rich, kind: "rich_text" }], base);
    expect(out.items[0]!.ok).toBe(false);
  });

  it("keeps empty parts verbatim without sending them to the engine", async () => {
    const engine = new FakeEngine((t) => t.toUpperCase());
    const out = await translateBatch(engine, [{ id: "l2", text: JSON.stringify(["", "word"]), kind: "list_text" }], base);
    expect(out.items[0]).toEqual({ id: "l2", ok: true, value: JSON.stringify(["", "WORD"]) });
    expect(engine.lastRequest!.items).toHaveLength(1);
  });

  it("maps the new Shopify content types", () => {
    expect(contentKind("RICH_TEXT_FIELD")).toBe("rich_text");
    expect(contentKind("LIST_SINGLE_LINE_TEXT_FIELD")).toBe("list_text");
    expect(contentKind("JSON")).toBeNull();
  });
});
