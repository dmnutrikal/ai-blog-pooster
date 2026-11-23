import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";
// The blog pipeline's decrypt (plain JS at the repo root) must read what the panel encrypts.
import { credentialsFromRow, decryptSecret } from "../../src/lib/storeRecord.js";
import { decrypt, encrypt } from "../src/lib/crypto";
import { testConnection } from "../src/lib/stores/connection";
import { DuplicateStoreError, fromRow, mapError, toRow, type StoreRow } from "../src/lib/stores/repository";
import { pipelineStoreSlugs } from "../src/lib/stores/pipeline";
import { toPublic } from "../src/lib/stores/types";
import { REQUIRED_SCOPES } from "../src/lib/shopify/token";

const key = randomBytes(32);
const ROOT = join(__dirname, "..", "..");

describe("crypto", () => {
  it("round-trips and does not leak the plaintext", () => {
    const payload = encrypt("shpss_secret", key);
    expect(payload).not.toContain("shpss_secret");
    expect(decrypt(payload, key)).toBe("shpss_secret");
    expect(encrypt("shpss_secret", key)).not.toBe(payload); // fresh IV each time
  });

  it("rejects a tampered payload or a wrong key", () => {
    const payload = encrypt("shpss_secret", key);
    const parts = payload.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."), key)).toThrow();
    expect(() => decrypt(payload, randomBytes(32))).toThrow();
  });

  it("is readable by the blog pipeline with the same CREDENTIALS_KEY", () => {
    const payload = encrypt("shpss_secret", key);
    expect(decryptSecret(payload, key.toString("base64"))).toBe("shpss_secret");
    const row = { shop_domain: "a.myshopify.com", client_id: "id", client_secret_encrypted: payload };
    expect(credentialsFromRow(row, key.toString("base64")).credentials).toEqual({ storeDomain: "a.myshopify.com", clientId: "id", clientSecret: "shpss_secret" });
    // Wrong key or no key: the pipeline falls back to its env vars instead of failing.
    expect(credentialsFromRow(row, randomBytes(32).toString("base64")).credentials).toBeNull();
    expect(credentialsFromRow(row, undefined).reason).toMatch(/CREDENTIALS_KEY/);
  });
});

describe("store rows", () => {
  const row: StoreRow = {
    id: "u1",
    slug: "collagenlab",
    name: "CollagenLab",
    shop_domain: "collagen-lab.myshopify.com",
    client_id: "id",
    client_secret_encrypted: "v1.a.b.c",
    public_domain: "collagenlab.bg",
    blog_gid: "gid://shopify/Blog/1",
    autoblog_enabled: true,
    writes_enabled: false,
    connection: null,
    created_at: "2026-11-20T00:00:00Z",
    updated_at: "2026-11-20T00:00:00Z",
  };

  it("maps between rows and records, and strips the secret for the browser", () => {
    const record = fromRow(row);
    expect(record).toMatchObject({ slug: "collagenlab", shopDomain: "collagen-lab.myshopify.com", blogGid: "gid://shopify/Blog/1" });
    expect(toRow({ autoblogEnabled: false, publicDomain: null })).toEqual({ autoblog_enabled: false, public_domain: null });
    expect(toPublic(record)).not.toHaveProperty("clientSecretEncrypted");
  });

  it("turns unique violations into DuplicateStoreError with the field", () => {
    expect(mapError({ code: "23505", message: 'duplicate key value violates unique constraint "stores_slug_key"' })).toMatchObject({ field: "slug" });
    expect(mapError({ code: "23505", message: 'duplicate key value violates unique constraint "stores_shop_domain_key"' })).toBeInstanceOf(DuplicateStoreError);
    expect(mapError({ code: "PGRST205", message: "Could not find the table" }).message).toMatch(/migrations/);
  });

  it("finds the pipeline's store folders", () => {
    expect(pipelineStoreSlugs(join(ROOT, "stores"))).toEqual(expect.arrayContaining(["collagenlab", "gutexpert", "madebynaturelabs", "nutrikal"]));
  });
});

describe("shared migration", () => {
  // PGlite has no pgvector; the embedding columns are irrelevant to this migration.
  const baseline = readFileSync(join(ROOT, "supabase", "reference", "autoblog_tables_reconstructed.sql"), "utf8")
    .replace(/create extension if not exists vector;/, "")
    .replace(/vector\(1536\)/g, "real[]");
  const migrations = readdirSync(join(ROOT, "supabase", "migrations"))
    .sort()
    .map((f) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8"));

  async function db() {
    const pg = new PGlite({ extensions: { pgcrypto } });
    await pg.exec(baseline);
    await pg.exec("insert into topics (store, keyword) values ('collagenlab', 'kolagen'); insert into articles (store, status) values ('collagenlab', 'published');");
    return pg;
  }

  const columns = async (pg: PGlite, table: string) =>
    (await pg.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = $1 order by 1", [table])).rows.map((r) => r.column_name);

  it("applies on top of the blog tables, twice, without touching them", async () => {
    const pg = await db();
    const before = { topics: await columns(pg, "topics"), products: await columns(pg, "products"), articles: await columns(pg, "articles") };
    for (const sql of migrations) await pg.exec(sql);
    for (const sql of migrations) await pg.exec(sql); // idempotent
    expect({ topics: await columns(pg, "topics"), products: await columns(pg, "products"), articles: await columns(pg, "articles") }).toEqual(before);
    expect((await pg.query("select count(*)::int as n from articles")).rows).toEqual([{ n: 1 }]);
  });

  it("enforces slug and shop domain rules and keeps RLS on", async () => {
    const pg = await db();
    for (const sql of migrations) await pg.exec(sql);
    const insert = (slug: string, domain: string) =>
      pg.query("insert into stores (slug, name, shop_domain, client_id, client_secret_encrypted) values ($1, 'x', $2, 'id', 'v1.a.b.c')", [slug, domain]);
    await insert("collagenlab", "collagen-lab.myshopify.com");
    await expect(insert("collagenlab", "other.myshopify.com")).rejects.toThrow(/stores_slug_key/);
    await expect(insert("other", "collagen-lab.myshopify.com")).rejects.toThrow(/stores_shop_domain_key/);
    await expect(insert("Bad Slug", "x.myshopify.com")).rejects.toThrow(/check/);
    await expect(insert("x", "collagenlab.bg")).rejects.toThrow(/check/);

    const row = (await pg.query<{ autoblog_enabled: boolean; writes_enabled: boolean }>("select autoblog_enabled, writes_enabled from stores")).rows[0];
    expect(row).toEqual({ autoblog_enabled: true, writes_enabled: false });

    const noRls = await pg.query<{ relname: string }>(
      "select relname from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace and not relrowsecurity and relname not in ('topics','products','articles')",
    );
    expect(noRls.rows).toEqual([]);
  });

  it("accepts the rows the pipeline writes to blog_runs", async () => {
    const pg = await db();
    for (const sql of migrations) await pg.exec(sql);
    await pg.query("insert into blog_runs (store, trigger, articles_per_run) values ('collagenlab', 'schedule', 1)");
    await pg.query(
      `update blog_runs set status = 'completed', published = 1, items = '[{"topic_id":1,"keyword":"k","status":"published"}]', finished_at = now()`,
    );
    await expect(pg.query("update blog_runs set status = 'weird'")).rejects.toThrow(/check/);
  });
});

describe("testConnection", () => {
  const creds = { shop: "test.myshopify.com", clientId: "id", clientSecret: "secret" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  // Routes GraphQL requests by operation name.
  function fetchWith(token: Response, operations: Record<string, () => Response> = {}) {
    return (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("/oauth/access_token")) return token;
      const name = /(?:query|mutation)\s+(\w+)/.exec(JSON.parse(String(init?.body)).query)?.[1] ?? "";
      const respond = operations[name];
      if (!respond) throw new Error(`unexpected operation ${name}`);
      return respond();
    }) as typeof fetch;
  }

  const shopInfo = () => json({ data: { shop: { name: "Test Shop", myshopifyDomain: "test.myshopify.com" } } });
  const locales = () =>
    json({
      data: {
        shopLocales: [
          { locale: "de", name: "German", primary: false, published: true, marketWebPresences: [{ rootUrls: [{ locale: "de", url: "https://test.de/" }, { locale: "en", url: "https://test.de/en" }] }] },
          { locale: "en", name: "English", primary: true, published: true, marketWebPresences: [] },
        ],
      },
    });
  const denied = (field: string) => () => json({ errors: [{ message: `Access denied for ${field} field.` }] });
  const token = (scope: string) => json({ access_token: "t", scope, expires_in: 86399 });

  it("reports scopes, locales, their URLs and blogs", async () => {
    const result = await testConnection(
      creds,
      fetchWith(token(REQUIRED_SCOPES.filter((s) => s !== "write_files").join(",")), {
        ShopInfo: shopInfo,
        ShopLocalesWithUrls: locales,
        StoreBlogs: () => json({ data: { blogs: { nodes: [{ id: "gid://shopify/Blog/1", title: "News", handle: "news" }] } } }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.shopName).toBe("Test Shop");
    expect(result.missingScopes).toEqual(["write_files"]);
    expect(result.locales.map((l) => l.locale)).toEqual(["en", "de"]);
    expect(result.locales[1]!.urls).toEqual(["https://test.de/"]);
    expect(result.blogs).toEqual([{ id: "gid://shopify/Blog/1", title: "News", handle: "news" }]);
    expect(result.warnings).toEqual([]);
  });

  // The blog pipeline's existing apps have content scopes but no translation scopes.
  it("counts a blog-only app as connected and explains what is missing", async () => {
    const result = await testConnection(
      creds,
      fetchWith(token("write_content,read_products"), {
        ShopInfo: shopInfo,
        ShopLocalesWithUrls: denied("shopLocales"),
        ShopLocales: denied("shopLocales"),
        StoreBlogs: () => json({ data: { blogs: { nodes: [] } } }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.locales).toEqual([]);
    expect(result.warnings).toEqual([expect.stringMatching(/read_locales/)]);
    expect(result.missingScopes).toContain("read_translations");
  });

  it("falls back to locales without URLs when read_markets is missing", async () => {
    const result = await testConnection(
      creds,
      fetchWith(token("read_locales"), {
        ShopInfo: shopInfo,
        ShopLocalesWithUrls: denied("marketWebPresences"),
        ShopLocales: () => json({ data: { shopLocales: [{ locale: "bg", name: "Bulgarian", primary: true, published: true }] } }),
        StoreBlogs: denied("blogs"),
      }),
    );
    expect(result.locales).toEqual([{ locale: "bg", name: "Bulgarian", primary: true, published: true, urls: [] }]);
    expect(result.warnings).toEqual([expect.stringMatching(/read_markets/), expect.stringMatching(/read_content/)]);
    expect(result.blogs).toBeUndefined();
  });

  it("explains app_not_installed from the HTML error page Shopify returns", async () => {
    const html = new Response("<!DOCTYPE html><html><head><title>400 - Oauth error app_not_installed</title></head></html>", {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
    const result = await testConnection(creds, fetchWith(html));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/не е инсталиран/);
  });

  it("explains shop_not_permitted in Bulgarian", async () => {
    const result = await testConnection(creds, fetchWith(json({ error: "shop_not_permitted" }, 400)));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/различни Shopify организации/);
  });

  it("explains a public domain instead of myshopify", async () => {
    const result = await testConnection({ ...creds, shop: "collagenlab.bg" }, fetchWith(json({})));
    expect(result.error).toMatch(/myshopify/);
  });
});
