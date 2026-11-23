// The only way the app talks to the Admin GraphQL API.
// Tracks the cost bucket, waits when it runs low, retries throttling / 5xx / network errors,
// and refreshes the token once on 401.

import { TokenProvider } from "./token";

export const SHOPIFY_API_VERSION = "2026-10";

export interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

interface GraphQLError {
  message: string;
  extensions?: { code?: string; [k: string]: unknown };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
  extensions?: { cost?: { requestedQueryCost: number; actualQueryCost: number | null; throttleStatus: ThrottleStatus } };
}

export class ShopifyGraphQLError extends Error {
  constructor(
    message: string,
    readonly errors: GraphQLError[] = [],
    readonly status?: number,
  ) {
    super(message);
    this.name = "ShopifyGraphQLError";
  }
}

export interface ClientOptions {
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  // Called with every successful raw response; used to record fixtures for tests.
  onResponse?: (operationName: string, variables: unknown, body: unknown) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function operationName(query: string): string {
  return /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "anonymous";
}

export class ShopifyClient {
  private throttle?: ThrottleStatus;
  private throttleAt = 0;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly tokens: TokenProvider,
    private readonly options: ClientOptions = {},
  ) {
    this.maxRetries = options.maxRetries ?? 5;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  get endpoint(): string {
    return `https://${this.tokens.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  }

  async request<T>(query: string, variables: Record<string, unknown> = {}, expectedCost = 50): Promise<T> {
    let refreshedToken = false;
    let budget = expectedCost;

    for (let attempt = 0; ; attempt++) {
      await this.waitForBudget(budget);
      const token = await this.tokens.get();

      let res: Response;
      try {
        res = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token.accessToken },
          body: JSON.stringify({ query, variables }),
        });
      } catch (err) {
        if (attempt >= this.maxRetries) throw err;
        await this.sleep(backoff(attempt));
        continue;
      }

      if (res.status === 401 && !refreshedToken) {
        refreshedToken = true;
        this.tokens.invalidate();
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= this.maxRetries) throw new ShopifyGraphQLError(`HTTP ${res.status} after ${attempt + 1} attempts`, [], res.status);
        const retryAfter = Number(res.headers.get("Retry-After"));
        await this.sleep(retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
        continue;
      }
      if (!res.ok) {
        throw new ShopifyGraphQLError(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, [], res.status);
      }

      const body = (await res.json()) as GraphQLResponse<T>;
      const cost = body.extensions?.cost;
      if (cost) {
        this.throttle = cost.throttleStatus;
        this.throttleAt = Date.now();
      }

      if (body.errors?.some((e) => e.extensions?.code === "THROTTLED")) {
        if (attempt >= this.maxRetries) throw new ShopifyGraphQLError("Throttled after retries", body.errors);
        // With cost info, waitForBudget at the top of the loop waits exactly long enough.
        if (cost) budget = cost.requestedQueryCost;
        else await this.sleep(backoff(attempt));
        continue;
      }
      if (body.errors?.length) {
        throw new ShopifyGraphQLError(body.errors.map((e) => e.message).join("; "), body.errors);
      }
      if (body.data === undefined) throw new ShopifyGraphQLError("Response has no data");

      this.options.onResponse?.(operationName(query), variables, body);
      return body.data;
    }
  }

  // Estimated points in the bucket now, based on the last reported status.
  private available(): number | undefined {
    if (!this.throttle) return undefined;
    const elapsed = (Date.now() - this.throttleAt) / 1000;
    return Math.min(this.throttle.maximumAvailable, this.throttle.currentlyAvailable + elapsed * this.throttle.restoreRate);
  }

  private msUntilAvailable(cost: number): number {
    const available = this.available();
    if (available === undefined || !this.throttle || available >= cost) return 0;
    return Math.ceil(((cost - available) / this.throttle.restoreRate) * 1000);
  }

  private async waitForBudget(cost: number): Promise<void> {
    const ms = this.msUntilAvailable(cost);
    if (ms > 0) await this.sleep(ms);
  }
}

function backoff(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
}
