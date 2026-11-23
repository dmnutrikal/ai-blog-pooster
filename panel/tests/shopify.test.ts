// Response shapes follow the Admin API 2026-10 docs. Replace with recordings from the test store
// (`--record`, then trim and copy into tests/fixtures/) once Phase 0 runs against it.

import { describe, expect, it } from "vitest";
import { ShopifyClient, ShopifyGraphQLError } from "../src/lib/shopify/client";
import { missingScopes, normalizeShopDomain, requestAccessToken, TokenError, TokenProvider } from "../src/lib/shopify/token";

const SHOP = "test-store.myshopify.com";
const creds = { shop: SHOP, clientId: "id", clientSecret: "secret" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

const tokenResponse = (token = "tok") => json({ access_token: token, scope: "read_translations,write_translations", expires_in: 86399 });

const cost = (available: number) => ({
  cost: { requestedQueryCost: 10, actualQueryCost: 10, throttleStatus: { maximumAvailable: 2000, currentlyAvailable: available, restoreRate: 100 } },
});

// Routes token requests and GraphQL requests to separate queues of responses.
function fakeFetch(graphql: Response[], tokens: Response[] = [tokenResponse()]) {
  const calls: { url: string; headers: Headers; body: string }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers), body: String(init?.body ?? "") });
    const queue = url.includes("/oauth/access_token") ? tokens : graphql;
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected request to ${url}`);
    return next;
  }) as typeof fetch;
  return { impl, calls };
}

function setup(graphql: Response[], tokens?: Response[]) {
  const f = fakeFetch(graphql, tokens);
  const sleeps: number[] = [];
  const client = new ShopifyClient(new TokenProvider(creds, f.impl), {
    fetchImpl: f.impl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { client, sleeps, calls: f.calls };
}

describe("token", () => {
  it("normalizes myshopify domains and rejects public ones", () => {
    expect(normalizeShopDomain("https://Collagen-Lab.myshopify.com/admin")).toBe("collagen-lab.myshopify.com");
    expect(() => normalizeShopDomain("collagenlab.bg")).toThrow(TokenError);
  });

  it("sends the client credentials grant and parses scopes", async () => {
    const f = fakeFetch([], [tokenResponse("abc")]);
    const token = await requestAccessToken(creds, f.impl);
    expect(token.accessToken).toBe("abc");
    expect(token.scopes).toEqual(["read_translations", "write_translations"]);
    expect(f.calls[0]!.url).toBe(`https://${SHOP}/admin/oauth/access_token`);
    expect(new URLSearchParams(f.calls[0]!.body).get("grant_type")).toBe("client_credentials");
  });

  it("surfaces shop_not_permitted without leaking the body", async () => {
    const f = fakeFetch([], [json({ error: "shop_not_permitted", error_description: "..." }, 400)]);
    await expect(requestAccessToken(creds, f.impl)).rejects.toMatchObject({ code: "shop_not_permitted", status: 400 });
  });

  it("treats write_x as covering read_x", () => {
    expect(missingScopes(["write_translations"], ["read_translations", "write_translations", "read_files"])).toEqual(["read_files"]);
  });
});

describe("ShopifyClient", () => {
  it("uses API version 2026-10 and the access token header", async () => {
    const { client, calls } = setup([json({ data: { shop: { name: "x" } }, extensions: cost(1990) })]);
    await client.request("query Shop { shop { name } }");
    const gql = calls.find((c) => c.url.includes("graphql.json"))!;
    expect(gql.url).toBe(`https://${SHOP}/admin/api/2026-10/graphql.json`);
    expect(gql.headers.get("X-Shopify-Access-Token")).toBe("tok");
  });

  it("waits and retries when THROTTLED", async () => {
    const { client, sleeps } = setup([
      json({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }], extensions: cost(0) }),
      json({ data: { ok: true }, extensions: cost(1990) }),
    ]);
    await expect(client.request("query Q { ok }")).resolves.toEqual({ ok: true });
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThan(0);
  });

  it("slows down before sending when the bucket is nearly empty", async () => {
    const { client, sleeps } = setup([json({ data: { a: 1 }, extensions: cost(5) }), json({ data: { a: 2 }, extensions: cost(1990) })]);
    await client.request("query A { a }", {}, 10);
    await client.request("query A { a }", {}, 500);
    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBeGreaterThan(4000); // (500 - ~5) / 100 per second
  });

  it("retries 5xx and refreshes the token once on 401", async () => {
    const { client, calls } = setup(
      [new Response("", { status: 503 }), new Response("", { status: 401 }), json({ data: { ok: 1 } })],
      [tokenResponse("old"), tokenResponse("new")],
    );
    await client.request("query Q { ok }");
    const gql = calls.filter((c) => c.url.includes("graphql.json"));
    expect(gql.map((c) => c.headers.get("X-Shopify-Access-Token"))).toEqual(["old", "old", "new"]);
  });

  it("throws GraphQL errors that are not throttling", async () => {
    const { client } = setup([json({ errors: [{ message: "Field 'x' doesn't exist" }] })]);
    await expect(client.request("query Q { x }")).rejects.toBeInstanceOf(ShopifyGraphQLError);
  });
});
