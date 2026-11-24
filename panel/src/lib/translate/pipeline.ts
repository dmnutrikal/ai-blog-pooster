// mask → translate → unmask → validate, for one batch of items going to one locale.
// Structured items (rich text, text lists) are exploded into plain text parts before
// the engine and rebuilt afterwards; a part that fails validation fails its whole item.

import type { TranslateItem, TranslateRequest, TranslationEngine, Usage } from "./engine";
import { mask, unmask } from "./placeholders";
import { explodeStructured, type ExplodedStructure } from "./structured";
import { validateTranslation, type ContentKind, type ValidationIssue } from "./validate";

export interface SourceItem {
  id: string;
  text: string;
  kind: ContentKind;
  field?: string;
}

export type ItemOutcome =
  | { id: string; ok: true; value: string }
  | { id: string; ok: false; issues: ValidationIssue[] };

export interface BatchOutcome {
  items: ItemOutcome[];
  usage: Usage;
}

const PART = "#part-"; // joins an item id and a structured part index; ids are DB numbers, so no collisions

interface PlannedPart {
  engineId: string;
  maskedText: string;
  tokens: string[];
}

export async function translateBatch(
  engine: TranslationEngine,
  items: SourceItem[],
  options: Omit<TranslateRequest, "items"> & { neverTranslate?: string[] },
): Promise<BatchOutcome> {
  const { neverTranslate = [], ...request } = options;

  const toEngine: TranslateItem[] = [];
  const flat = new Map<string, PlannedPart>(); // engineId → masked part (plain items have one part)
  const structured = new Map<string, { exploded: ExplodedStructure; partIds: string[] }>();
  const preFailed = new Map<string, ValidationIssue[]>();
  const htmlFallback = new Set<string>(); // rich_text fields whose value turned out to be HTML

  for (const item of items) {
    if (item.kind === "rich_text" || item.kind === "list_text") {
      let exploded: ExplodedStructure;
      try {
        exploded = explodeStructured(item.kind, item.text);
      } catch (err) {
        // Theme "richtext" settings declare RICH_TEXT_FIELD but actually hold HTML.
        // Translate those as HTML; anything else malformed stays a structure failure.
        if (item.kind === "rich_text" && item.text.trimStart().startsWith("<")) {
          const m = mask(item.text, neverTranslate);
          flat.set(item.id, { engineId: item.id, maskedText: m.text, tokens: m.tokens });
          toEngine.push({ id: item.id, kind: "html", field: item.field, text: m.text });
          htmlFallback.add(item.id);
          continue;
        }
        preFailed.set(item.id, [{ code: "structure", message: `Invalid ${item.kind} JSON: ${err instanceof Error ? err.message : String(err)}` }]);
        continue;
      }
      const partIds: string[] = [];
      exploded.parts.forEach((part, i) => {
        const engineId = `${item.id}${PART}${i}`;
        partIds.push(engineId);
        if (!part.trim()) {
          // Empty or whitespace-only parts are kept verbatim and never sent out.
          flat.set(engineId, { engineId, maskedText: part, tokens: [] });
          return;
        }
        const m = mask(part, neverTranslate);
        flat.set(engineId, { engineId, maskedText: m.text, tokens: m.tokens });
        toEngine.push({ id: engineId, kind: "text", field: item.field, text: m.text });
      });
      structured.set(item.id, { exploded, partIds });
      continue;
    }

    const m = mask(item.text, neverTranslate);
    flat.set(item.id, { engineId: item.id, maskedText: m.text, tokens: m.tokens });
    toEngine.push({ id: item.id, kind: item.kind, field: item.field, text: m.text });
  }

  const { translations, usage } = toEngine.length
    ? await engine.translate({ ...request, items: toEngine })
    : { translations: new Map<string, string>(), usage: { model: engine.model ?? "none", inputTokens: 0, outputTokens: 0, costUsd: 0 } };

  // Validate and unmask one engine-level part; empty parts pass through unchanged.
  const partResult = (engineId: string, kind: ContentKind): { ok: true; value: string } | { ok: false; issues: ValidationIssue[] } => {
    const planned = flat.get(engineId)!;
    if (!planned.maskedText.trim()) return { ok: true, value: planned.maskedText };
    const out = translations.get(engineId) ?? "";
    const issues = validateTranslation(planned.maskedText, out, kind);
    return issues.length ? { ok: false, issues } : { ok: true, value: unmask(out, planned.tokens) };
  };

  const outcomes = items.map((item): ItemOutcome => {
    // URLs are never sent for rewriting; whatever came back, keep the original.
    if (item.kind === "url") return { id: item.id, ok: true, value: item.text };
    const failed = preFailed.get(item.id);
    if (failed) return { id: item.id, ok: false, issues: failed };

    const plan = structured.get(item.id);
    if (!plan) {
      const r = partResult(item.id, htmlFallback.has(item.id) ? "html" : item.kind);
      return r.ok ? { id: item.id, ok: true, value: r.value } : { id: item.id, ok: false, issues: r.issues };
    }

    const values: string[] = [];
    const issues: ValidationIssue[] = [];
    for (const partId of plan.partIds) {
      const r = partResult(partId, "text");
      if (r.ok) values.push(r.value);
      else issues.push(...r.issues);
    }
    if (issues.length) return { id: item.id, ok: false, issues };
    try {
      return { id: item.id, ok: true, value: plan.exploded.rebuild(values) };
    } catch (err) {
      return { id: item.id, ok: false, issues: [{ code: "structure", message: err instanceof Error ? err.message : String(err) }] };
    }
  });

  return { items: outcomes, usage };
}

// Shopify's LocalizableContentType → how we treat the value.
// null: structured JSON we cannot translate safely yet (generic JSON, other LIST_* kinds);
// such fields are counted and reported, never guessed at.
export function contentKind(shopifyType: string): ContentKind | null {
  switch (shopifyType) {
    case "STRING":
    case "SINGLE_LINE_TEXT_FIELD":
    case "MULTI_LINE_TEXT_FIELD":
      return "text";
    case "HTML":
    case "INLINE_RICH_TEXT":
      return "html";
    case "URL":
    case "URI":
    case "FILE_REFERENCE":
      return "url";
    case "RICH_TEXT_FIELD":
      return "rich_text";
    case "LIST_SINGLE_LINE_TEXT_FIELD":
      return "list_text";
    default:
      return null;
  }
}
