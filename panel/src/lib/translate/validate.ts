// Checks run on every translation before it may be written to Shopify.
// A failed check keeps the translation out of the store and records the reason on the job item.

import { markersIn } from "./placeholders";

export type ContentKind = "text" | "html" | "url";

export interface ValidationIssue {
  code: "empty" | "markers" | "html_tags" | "length";
  message: string;
}

// Opening/closing/self-closing tag names in order, e.g. ["p", "/p", "br"].
export function tagSequence(html: string): string[] {
  return [...html.matchAll(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g)].map((m) => `${m[1]}${m[2]!.toLowerCase()}`);
}

function sameMultiset(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  return x.every((v, i) => v === y[i]);
}

// Text length differs between languages; this only catches truncation or runaway output.
const MIN_RATIO = 0.3;
const MAX_RATIO = 3.5;
const LENGTH_CHECK_MIN_CHARS = 40;

function visibleLength(s: string): number {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().length;
}

// Both arguments are the masked texts (markers still in place).
export function validateTranslation(source: string, translated: string, kind: ContentKind): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!translated.trim()) {
    issues.push({ code: "empty", message: "Translation is empty" });
    return issues;
  }

  const srcMarkers = markersIn(source);
  const outMarkers = markersIn(translated);
  if (!sameMultiset(srcMarkers, outMarkers)) {
    issues.push({
      code: "markers",
      message: `Protected parts changed: expected [${srcMarkers.join(",")}], got [${outMarkers.join(",")}]`,
    });
  }

  if (kind === "html") {
    const a = tagSequence(source);
    const b = tagSequence(translated);
    if (a.length !== b.length || a.some((t, i) => t !== b[i])) {
      issues.push({ code: "html_tags", message: `HTML tags differ: ${a.length} in source, ${b.length} in translation` });
    }
  }

  const srcLen = visibleLength(source);
  if (srcLen >= LENGTH_CHECK_MIN_CHARS) {
    const ratio = visibleLength(translated) / srcLen;
    if (ratio < MIN_RATIO || ratio > MAX_RATIO) {
      issues.push({ code: "length", message: `Length ratio ${ratio.toFixed(2)} is outside ${MIN_RATIO}–${MAX_RATIO}` });
    }
  }

  return issues;
}
