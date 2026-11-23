// "Тест на връзката": gets a token, reads the shop, then — as far as the app's scopes allow — its
// locales and blogs. Writes nothing.
//
// A working token is enough to count as connected: the blog pipeline needs no more. Locales
// (translation) and blogs (blog picker) need extra scopes; when they're missing the test says so
// in `warnings` instead of failing.

import { ShopifyClient, ShopifyGraphQLError } from "../shopify/client";
import { SHOP_INFO, SHOP_LOCALES, SHOP_LOCALES_WITH_URLS, STORE_BLOGS } from "../shopify/operations";
import { missingScopes, TokenError, TokenProvider, type ShopCredentials } from "../shopify/token";
import type { ConnectionSnapshot, StoreBlog, StoreLocale } from "./types";

interface ShopLocaleNode {
  locale: string;
  name: string;
  primary: boolean;
  published: boolean;
  marketWebPresences?: { rootUrls: { locale: string; url: string }[] }[];
}

// Messages follow the troubleshooting table in the setup guide.
export function explainConnectionError(err: unknown): string {
  if (err instanceof TokenError) {
    if (err.code === "invalid_shop_domain") return "Въведете myshopify домейна (xxx.myshopify.com), не публичния домейн на магазина.";
    if (err.code === "shop_not_permitted") {
      return "App-ът и магазинът са в различни Shopify организации. Създайте app-а от админа на същия магазин (Settings → Apps → Develop apps).";
    }
    if (err.code === "app_not_installed") {
      return "App-ът с този Client ID не е инсталиран в магазина (или е бил деинсталиран). Инсталирайте го отново или въведете Client ID и secret на инсталирания app.";
    }
    if (err.code === "invalid_client" || err.status === 401) return "Грешен Client ID или Client secret. Копирайте ги отново от настройките на app-а.";
    if (err.status === 404) return "Магазинът не е намерен. Проверете myshopify домейна.";
    if (err.status === 400) {
      return `Shopify отказа токен${err.code ? ` (${err.code})` : ""}. Проверете дали app-ът е инсталиран в магазина.`;
    }
    return `Shopify върна грешка ${err.status}${err.code ? ` (${err.code})` : ""} при искане на токен.`;
  }
  if (err instanceof ShopifyGraphQLError) return `Токенът е получен, но заявката към Shopify не мина: ${err.message}`;
  if (err instanceof TypeError) return "Няма връзка с магазина. Проверете домейна и интернет връзката.";
  return err instanceof Error ? err.message : String(err);
}

function toLocales(nodes: ShopLocaleNode[]): StoreLocale[] {
  const locales = nodes.map((l) => ({
    locale: l.locale,
    name: l.name,
    primary: l.primary,
    published: l.published,
    urls: [...new Set((l.marketWebPresences ?? []).flatMap((p) => p.rootUrls.filter((r) => r.locale === l.locale).map((r) => r.url)))],
  }));
  return locales.sort((a, b) => Number(b.primary) - Number(a.primary) || a.locale.localeCompare(b.locale));
}

export async function testConnection(creds: ShopCredentials, fetchImpl: typeof fetch = fetch): Promise<ConnectionSnapshot> {
  const testedAt = new Date().toISOString();
  let grantedScopes: string[] = [];
  let client: ShopifyClient;
  let shopName: string;

  try {
    const tokens = new TokenProvider(creds, fetchImpl);
    grantedScopes = (await tokens.get()).scopes;
    client = new ShopifyClient(tokens, { fetchImpl, maxRetries: 2 });
    shopName = (await client.request<{ shop: { name: string } }>(SHOP_INFO)).shop.name;
  } catch (err) {
    return {
      testedAt,
      ok: false,
      error: explainConnectionError(err),
      grantedScopes,
      missingScopes: grantedScopes.length ? missingScopes(grantedScopes) : [],
      locales: [],
    };
  }

  const warnings: string[] = [];

  let locales: StoreLocale[] = [];
  try {
    locales = toLocales((await client.request<{ shopLocales: ShopLocaleNode[] }>(SHOP_LOCALES_WITH_URLS)).shopLocales);
  } catch {
    try {
      locales = toLocales((await client.request<{ shopLocales: ShopLocaleNode[] }>(SHOP_LOCALES)).shopLocales);
      warnings.push("Домейните по език не се виждат: app-ът няма право read_markets.");
    } catch {
      warnings.push("Езиците не се виждат: app-ът няма право read_locales. Нужно е за преводите, не и за блога.");
    }
  }

  let blogs: StoreBlog[] | undefined;
  try {
    blogs = (await client.request<{ blogs: { nodes: StoreBlog[] } }>(STORE_BLOGS)).blogs.nodes;
  } catch {
    warnings.push("Блоговете не се виждат: app-ът няма право read_content.");
  }

  return { testedAt, ok: true, shopName, grantedScopes, missingScopes: missingScopes(grantedScopes), locales, blogs, warnings };
}
