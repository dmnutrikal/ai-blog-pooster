import { describe, expect, it } from "vitest";
import type { TranslateRequest, TranslateResult, TranslationEngine } from "../src/lib/translate/engine";
import { chunkQueue, syncStore, type SaveTranslationPatch, type SyncDb, type SyncResourceNode, type SyncShopify } from "../src/lib/translate/sync";

// --- fakes -------------------------------------------------------------------

function fakeShopify(nodesByLocale: Record<string, SyncResourceNode[]>) {
  const registered: { resourceId: string; translations: { key: string; locale: string; value: string; translatableContentDigest: string }[] }[] = [];
  const shopify: SyncShopify = {
    async shopLocales() {
      return [{ locale: "en", primary: true, published: true }, ...Object.keys(nodesByLocale).map((l) => ({ locale: l, primary: false, published: true }))];
    },
    async listPage(_type, locale) {
      return { nodes: nodesByLocale[locale] ?? [], hasNextPage: false, endCursor: null };
    },
    async register(resourceId, translations) {
      registered.push({ resourceId, translations });
    },
  };
  return { shopify, registered };
}

interface SavedTranslation extends SaveTranslationPatch {
  contentId: number;
  locale: string;
}

function fakeDb(
  existing: Record<string, { id: number; status: "missing" | "current" | "outdated" | "locked" | "pending_review" | "failed"; value: string | null; sourceDigest?: string | null }> = {},
) {
  let nextId = 1000;
  const saved: SavedTranslation[] = [];
  const backups: { translationId: number; previousValue: string | null }[] = [];
  const jobItems: { status: string; reason: string | null }[] = [];
  const contentIds = new Map<string, number>(); // content key → id
  const contentKeyById = new Map<number, string>();
  const resourceIds = new Map<string, number>();
  let contentSeq = 0;

  const db: SyncDb = {
    async upsertResources(_storeId, resources) {
      const result = new Map<string, number>();
      for (const r of resources) {
        if (!resourceIds.has(r.shopifyId)) resourceIds.set(r.shopifyId, resourceIds.size + 1);
        result.set(r.shopifyId, resourceIds.get(r.shopifyId)!);
      }
      return result;
    },
    async upsertContents(rows) {
      const result = new Map<string, number>();
      for (const c of rows) {
        if (!contentIds.has(c.key)) {
          contentIds.set(c.key, ++contentSeq);
          contentKeyById.set(contentSeq, c.key);
        }
        result.set(`${c.resourceId}:${c.key}`, contentIds.get(c.key)!);
      }
      return result;
    },
    async getTranslations(ids, locale) {
      const result = new Map<number, TranslationRowShape>();
      for (const contentId of ids) {
        const key = contentKeyById.get(contentId);
        const hit = key ? existing[`${key}@${locale}`] : undefined;
        if (hit) {
          result.set(contentId, { sourceDigest: null, ...hit });
          continue;
        }
        const prior = [...saved].reverse().find((s) => s.contentId === contentId && s.locale === locale);
        if (prior) result.set(contentId, { id: nextId, status: prior.status, value: prior.value ?? null, sourceDigest: prior.sourceDigest ?? null });
      }
      return result;
    },
    async saveTranslations(locale, rows) {
      const result = new Map<number, number>();
      for (const { contentId, patch } of rows) {
        saved.push({ contentId, locale, ...patch });
        result.set(contentId, ++nextId);
      }
      return result;
    },
    async addBackups(rows) {
      for (const b of rows) backups.push({ translationId: b.translationId, previousValue: b.previousValue });
    },
    async addJobItems(_jobId, items) {
      for (const i of items) jobItems.push({ status: i.status, reason: i.reason });
    },
    async bumpJob() {},
    async glossary() {
      return { neverTranslate: ["CollagenLab"], translateAs: new Map([["de", [{ source: "collagen", target: "Kollagen" }]]]) };
    },
  };
  return { db, saved, backups, jobItems, contentIds };
}

type TranslationRowShape = { id: number; status: SavedTranslation["status"]; value: string | null; sourceDigest: string | null };

class EchoEngine implements TranslationEngine {
  readonly name = "echo";
  requests: TranslateRequest[] = [];
  constructor(private readonly fn: (text: string) => string = (t) => `[${t}]`) {}
  async translate(req: TranslateRequest): Promise<TranslateResult> {
    this.requests.push(req);
    return {
      translations: new Map(req.items.map((i) => [i.id, this.fn(i.text)])),
      usage: { model: "echo", inputTokens: 10, outputTokens: 5, costUsd: 0.001 },
    };
  }
}

function product(overrides: Partial<SyncResourceNode> = {}): SyncResourceNode {
  return {
    resourceId: "gid://shopify/Product/1",
    translatableContent: [
      { key: "title", value: "Collagen powder", digest: "d1", locale: "en", type: "SINGLE_LINE_TEXT_FIELD" },
      { key: "body_html", value: "<p>Good</p>", digest: "d2", locale: "en", type: "HTML" },
      { key: "handle", value: "collagen-powder", digest: "d3", locale: "en", type: "URL" },
    ],
    translations: [],
    ...overrides,
  };
}

const store = { id: "s1", name: "CollagenLab", writesEnabled: true };

// --- tests -------------------------------------------------------------------

describe("syncStore", () => {
  it("dry run: translates missing fields, stores pending_review proposals, registers nothing", async () => {
    const { shopify, registered } = fakeShopify({ de: [product()] });
    const { db, saved } = fakeDb();
    const engine = new EchoEngine();

    const summary = await syncStore({ shopify, engine, db, store }, { jobId: 1, write: false });

    expect(summary.queued).toBe(3);
    expect(summary.translated).toBe(3);
    expect(summary.written).toBe(0);
    expect(registered).toHaveLength(0);
    const statuses = saved.map((s) => s.status);
    expect(statuses).toContain("pending_review");
    expect(statuses).not.toContain("current");
    // Glossary flows into the request.
    expect(engine.requests[0]!.translateAs).toEqual([{ source: "collagen", target: "Kollagen" }]);
  });

  it("skips current translations and never touches locked ones", async () => {
    const node = product({
      translations: [{ key: "title", value: "Kollagenpulver", outdated: false }],
    });
    const { shopify } = fakeShopify({ de: [node] });
    const { db, saved, jobItems } = fakeDb({ "body_html@de": { id: 7, status: "locked", value: "manual" } });
    const engine = new EchoEngine();

    const summary = await syncStore({ shopify, engine, db, store }, { jobId: 1, write: false });

    // title is current (mirrored), body_html locked (skipped), handle is a URL needing translation state only
    expect(summary.skippedLocked).toBe(1);
    expect(jobItems).toContainEqual({ status: "skipped", reason: "locked" });
    expect(engine.requests.flatMap((r) => r.items.map((i) => i.field))).not.toContain("body_html");
    expect(saved.find((s) => s.status === "current" && s.value === "Kollagenpulver")).toBeTruthy();
  });

  it("write mode: backs up the previous value before registering and marks current after", async () => {
    const node = product({
      translations: [{ key: "title", value: "Altes Kollagen", outdated: true }],
    });
    const { shopify, registered } = fakeShopify({ de: [node] });
    const { db, saved, backups } = fakeDb();
    const engine = new EchoEngine((t) => t.replace("Collagen", "Kollagen").replace("Good", "Gut"));

    const summary = await syncStore({ shopify, engine, db, store }, { jobId: 1, write: true });

    expect(summary.written).toBe(3);
    expect(backups).toContainEqual({ translationId: expect.any(Number), previousValue: "Altes Kollagen" });
    expect(registered).toHaveLength(1);
    expect(registered[0]!.translations).toContainEqual({ key: "title", locale: "de", value: "Kollagen powder", translatableContentDigest: "d1" });
    const final = saved.filter((s) => s.status === "current");
    expect(final).toHaveLength(3);
    expect(final.every((s) => s.origin === "ai" && s.writtenAt)).toBe(true);
  });

  it("refuses write mode when the store has writes disabled", async () => {
    const { shopify } = fakeShopify({ de: [product()] });
    const { db } = fakeDb();
    await expect(
      syncStore({ shopify, engine: new EchoEngine(), db, store: { ...store, writesEnabled: false } }, { jobId: 1, write: true }),
    ).rejects.toThrow(/Разреши запис/);
  });

  it("records a failed validation and does not register that field", async () => {
    const { shopify, registered } = fakeShopify({ de: [product()] });
    const { db, saved, jobItems } = fakeDb();
    // Drops HTML tags → body_html fails validation; title and handle survive.
    const engine = new EchoEngine((t) => t.replace(/<[^>]+>/g, ""));

    const summary = await syncStore({ shopify, engine, db, store }, { jobId: 1, write: true });

    expect(summary.failed).toBe(1);
    expect(saved.find((s) => s.status === "failed")?.failureReason).toMatch(/html|tag/i);
    expect(jobItems.some((i) => i.status === "failed")).toBe(true);
    const written = registered.flatMap((r) => r.translations.map((t) => t.key));
    expect(written).toContain("title");
    expect(written).not.toContain("body_html");
  });

  it("honours the locale filter and rejects unknown locales", async () => {
    const { shopify } = fakeShopify({ de: [product()], fr: [product()] });
    const { db } = fakeDb();
    const engine = new EchoEngine();
    const summary = await syncStore({ shopify, engine, db, store }, { jobId: 1, locales: ["fr"] });
    expect(summary.locales).toEqual(["fr"]);

    await expect(syncStore({ shopify, engine, db, store }, { jobId: 1, locales: ["xx"] })).rejects.toThrow(/not enabled/);
  });
});

describe("adopt mode and the adopted baseline", () => {
  it("adopt: accepts missing/outdated fields as-is, calls no engine, registers nothing", async () => {
    const node = product({ translations: [{ key: "title", value: "Altes Kollagen", outdated: true }] });
    const { shopify, registered } = fakeShopify({ de: [node] });
    const { db, saved, jobItems } = fakeDb();
    const engine = new EchoEngine();

    const summary = await syncStore({ shopify, engine, db, store }, { jobId: 1, adopt: true });

    expect(summary.adopted).toBe(3);
    expect(summary.queued).toBe(0);
    expect(engine.requests).toHaveLength(0);
    expect(registered).toHaveLength(0);
    // The outdated title keeps its store value; its current source digest becomes the baseline.
    const title = saved.find((s) => s.value === "Altes Kollagen")!;
    expect(title.status).toBe("current");
    expect(title.sourceDigest).toBe("d1");
    expect(jobItems.filter((i) => i.status === "adopted")).toHaveLength(3);
  });

  it("after adoption a sync queues nothing until the source digest changes", async () => {
    const node = product({ translations: [{ key: "title", value: "Altes Kollagen", outdated: true }] });
    const { shopify } = fakeShopify({ de: [node] });
    const adoptedRows = {
      "title@de": { id: 1, status: "current" as const, value: "Altes Kollagen", sourceDigest: "d1" },
      "body_html@de": { id: 2, status: "current" as const, value: null, sourceDigest: "d2" },
      "handle@de": { id: 3, status: "current" as const, value: null, sourceDigest: "d3" },
    };
    const engine = new EchoEngine();

    const unchanged = await syncStore({ shopify, engine, db: fakeDb(adoptedRows).db, store }, { jobId: 1 });
    expect(unchanged.queued).toBe(0);
    expect(engine.requests).toHaveLength(0);

    // The source title changed → new digest → it is translated again; the rest stays adopted.
    const edited = product({
      translations: [{ key: "title", value: "Altes Kollagen", outdated: true }],
    });
    edited.translatableContent[0] = { ...edited.translatableContent[0]!, value: "New collagen powder", digest: "d1-v2" };
    const second = await syncStore({ shopify: fakeShopify({ de: [edited] }).shopify, engine, db: fakeDb(adoptedRows).db, store }, { jobId: 2 });
    expect(second.queued).toBe(1);
    expect(engine.requests[0]!.items.map((i) => i.field)).toEqual(["title"]);
  });
});

describe("chunkQueue", () => {
  it("splits by item count and by character budget", () => {
    const items = [{ text: "a".repeat(50) }, { text: "b".repeat(50) }, { text: "c".repeat(120) }, { text: "d" }];
    expect(chunkQueue(items, 2, 1000).map((c) => c.length)).toEqual([2, 2]);
    expect(chunkQueue(items, 10, 100).map((c) => c.length)).toEqual([2, 1, 1]);
    expect(chunkQueue([], 5, 100)).toEqual([]);
  });
});
