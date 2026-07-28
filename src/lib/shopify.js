import { config } from '../config.js';

// Client-credentials token cache. Shopify docs say the token is short-lived
// (~24h) — we trust whatever expires_in the server actually returns and
// refresh a bit early rather than hardcoding 24h.
let cachedToken = null;
let tokenExpiresAt = 0;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

async function fetchAccessToken() {
  const url = `https://${config.shopify.storeDomain}/admin/oauth/access_token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: config.shopify.clientId,
      client_secret: config.shopify.clientSecret,
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      `Shopify token exchange failed: ${body.error_description ?? body.error ?? `HTTP ${res.status}`}`
    );
  }
  return body;
}

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const { access_token, expires_in } = await fetchAccessToken();
  cachedToken = access_token;
  tokenExpiresAt = Date.now() + expires_in * 1000 - REFRESH_BUFFER_MS;
  return cachedToken;
}

// TODO: Shopify's GraphQL Admin API is cost-based and can throttle large
// catalogs/backfills. Add retry-with-backoff on THROTTLED errors if
// syncProducts.js starts hitting limits on the real product count.
export async function graphql(query, variables = {}) {
  const accessToken = await getAccessToken();
  const url = `https://${config.shopify.storeDomain}/admin/api/${config.shopify.apiVersion}/graphql.json`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await res.json();
  if (!res.ok || body.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(body.errors ?? `HTTP ${res.status}`)}`);
  }

  return body.data;
}
