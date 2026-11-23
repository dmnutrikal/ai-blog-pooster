// Client credentials grant for Dev Dashboard apps installed in our own organization.
// https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
// The token lives 24h and is kept in memory only — never persisted, never logged.

export interface ShopCredentials {
  shop: string; // xxx.myshopify.com
  clientId: string;
  clientSecret: string;
}

export interface AccessToken {
  accessToken: string;
  scopes: string[];
  expiresAt: number; // epoch ms
}

export class TokenError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "TokenError";
  }
}

// Refresh this long before Shopify says the token expires.
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

const MYSHOPIFY_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function normalizeShopDomain(input: string): string {
  const shop = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!MYSHOPIFY_DOMAIN.test(shop)) {
    throw new TokenError(
      `"${input}" is not a myshopify domain. Use the xxx.myshopify.com domain, not the public one.`,
      0,
      "invalid_shop_domain",
    );
  }
  return shop;
}

export async function requestAccessToken(
  creds: ShopCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<AccessToken> {
  const shop = normalizeShopDomain(creds.shop);
  const res = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    // Error bodies look like {"error":"shop_not_permitted","error_description":"..."}.
    // Only the error code is surfaced; the body never contains the secret, but we stay conservative.
    let code: string | undefined;
    try {
      code = (JSON.parse(text) as { error?: string }).error;
    } catch {
      // HTML error page, e.g. <title>400 - Oauth error app_not_installed</title>
      code = /Oauth error ([a-z_]+)/i.exec(text)?.[1];
    }
    throw new TokenError(`Token request for ${shop} failed with HTTP ${res.status}${code ? ` (${code})` : ""}`, res.status, code);
  }

  const body = JSON.parse(text) as { access_token: string; scope: string; expires_in: number };
  return {
    accessToken: body.access_token,
    scopes: body.scope.split(",").map((s) => s.trim()).filter(Boolean),
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}

// Caches one token per shop and refreshes it before expiry.
export class TokenProvider {
  private current?: AccessToken;
  private pending?: Promise<AccessToken>;

  constructor(
    private readonly creds: ShopCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get shop(): string {
    return normalizeShopDomain(this.creds.shop);
  }

  async get(): Promise<AccessToken> {
    if (this.current && this.current.expiresAt - REFRESH_MARGIN_MS > Date.now()) return this.current;
    return this.refresh();
  }

  async refresh(): Promise<AccessToken> {
    this.pending ??= requestAccessToken(this.creds, this.fetchImpl).finally(() => {
      this.pending = undefined;
    });
    this.current = await this.pending;
    return this.current;
  }

  invalidate(): void {
    this.current = undefined;
  }
}

// Scopes from the setup guide (section "Свързване на нов магазин", step 2).
export const REQUIRED_SCOPES = [
  "read_translations",
  "write_translations",
  "read_locales",
  "write_locales",
  "read_products",
  "read_content",
  "read_themes",
  "read_online_store_navigation",
  "read_markets",
  "read_metaobjects",
  "read_metaobject_definitions",
  "read_files",
  "write_files",
] as const;

// Shopify implies read_x when write_x is granted and may report only write_x.
export function missingScopes(granted: string[], required: readonly string[] = REQUIRED_SCOPES): string[] {
  const have = new Set(granted);
  return required.filter((scope) => {
    if (have.has(scope)) return false;
    if (scope.startsWith("read_") && have.has(`write_${scope.slice(5)}`)) return false;
    return true;
  });
}
