// Masks text the model must not touch (Liquid, URLs, emails, "Never translate" terms)
// with numbered markers before translation, and restores it afterwards.

export interface Masked {
  text: string;
  tokens: string[]; // tokens[i] is the original text behind marker i
}

// Unusual brackets, so they cannot collide with store content and models keep them intact.
export const marker = (i: number) => `⟦${i}⟧`;
export const MARKER_RE = /⟦(\d+)⟧/g;

const LIQUID = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;
const URL = /\bhttps?:\/\/[^\s"'<>)]+/g;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// "Never translate" matching is case-sensitive, same as T Lab.
function neverTranslatePattern(terms: string[]): RegExp | undefined {
  const cleaned = [...new Set(terms.map((t) => t.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!cleaned.length) return undefined;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${cleaned.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "gu");
}

export function mask(source: string, neverTranslate: string[] = []): Masked {
  const tokens: string[] = [];
  const replace = (match: string) => {
    tokens.push(match);
    return marker(tokens.length - 1);
  };

  // Order matters: Liquid first (it may contain URLs), then URLs (they may contain @), then emails, then terms.
  let text = source.replace(LIQUID, replace).replace(URL, replace).replace(EMAIL, replace);
  const terms = neverTranslatePattern(neverTranslate);
  if (terms) {
    // Only replace outside existing markers.
    text = text
      .split(/(⟦\d+⟧)/)
      .map((part) => (/^⟦\d+⟧$/.test(part) ? part : part.replace(terms, replace)))
      .join("");
  }
  return { text, tokens };
}

export function unmask(translated: string, tokens: string[]): string {
  return translated.replace(MARKER_RE, (whole, n: string) => tokens[Number(n)] ?? whole);
}

export function markersIn(text: string): number[] {
  return [...text.matchAll(MARKER_RE)].map((m) => Number(m[1]));
}
