// Structured translatable content: Shopify rich text fields (a JSON tree whose "text"
// nodes carry the copy) and list-of-text metafields (a JSON array of strings). The
// pipeline translates only the string leaves and rebuilds the exact same structure,
// so formatting, links and non-text values can never be damaged by the model.

interface RichTextNode {
  type?: string;
  value?: unknown;
  children?: RichTextNode[];
  [key: string]: unknown;
}

function walkTextNodes(node: RichTextNode, visit: (node: RichTextNode) => void): void {
  if (node.type === "text" && typeof node.value === "string") visit(node);
  if (Array.isArray(node.children)) for (const child of node.children) walkTextNodes(child, visit);
}

export interface ExplodedStructure {
  // The translatable string parts, in a stable order.
  parts: string[];
  // Rebuilds the serialized JSON with the translated parts in the same order.
  rebuild(translated: string[]): string;
}

// Throws on JSON that is not the expected shape; the caller records a `structure` issue.
export function explodeStructured(kind: "rich_text" | "list_text", raw: string): ExplodedStructure {
  if (kind === "list_text") {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list) || !list.every((v) => typeof v === "string")) throw new Error("not a JSON array of strings");
    return {
      parts: list,
      rebuild: (translated) => JSON.stringify(translated),
    };
  }

  const root = JSON.parse(raw) as RichTextNode;
  if (typeof root !== "object" || root === null) throw new Error("not a rich text object");
  const parts: string[] = [];
  walkTextNodes(root, (node) => parts.push(node.value as string));
  return {
    parts,
    rebuild: (translated) => {
      const clone = JSON.parse(raw) as RichTextNode;
      let i = 0;
      walkTextNodes(clone, (node) => {
        node.value = translated[i++];
      });
      if (i !== translated.length) throw new Error("part count changed during rebuild");
      return JSON.stringify(clone);
    },
  };
}
