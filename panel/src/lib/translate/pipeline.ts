// mask → translate → unmask → validate, for one batch of items going to one locale.

import type { TranslateItem, TranslateRequest, TranslationEngine, Usage } from "./engine";
import { mask, unmask } from "./placeholders";
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

export async function translateBatch(
  engine: TranslationEngine,
  items: SourceItem[],
  options: Omit<TranslateRequest, "items"> & { neverTranslate?: string[] },
): Promise<BatchOutcome> {
  const { neverTranslate = [], ...request } = options;
  const masked = new Map(items.map((item) => [item.id, mask(item.text, neverTranslate)]));

  const toEngine: TranslateItem[] = items.map((item) => ({
    id: item.id,
    kind: item.kind,
    field: item.field,
    text: masked.get(item.id)!.text,
  }));

  const { translations, usage } = await engine.translate({ ...request, items: toEngine });

  const outcomes = items.map((item): ItemOutcome => {
    const m = masked.get(item.id)!;
    const out = translations.get(item.id) ?? "";
    // URLs are never sent for rewriting; whatever came back, keep the original.
    if (item.kind === "url") return { id: item.id, ok: true, value: item.text };
    const issues = validateTranslation(m.text, out, item.kind);
    return issues.length ? { id: item.id, ok: false, issues } : { id: item.id, ok: true, value: unmask(out, m.tokens) };
  });

  return { items: outcomes, usage };
}

// Shopify's LocalizableContentType → how we treat the value.
// null: structured JSON (RICH_TEXT_FIELD, JSON, LINK, LIST_*) that must be translated field by field
// inside the structure. Not supported yet; such keys are skipped and reported.
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
    default:
      return null;
  }
}
