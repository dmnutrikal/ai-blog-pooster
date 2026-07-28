// Standalone credential check. Run with: npm run test-connections
//
// Talks to Shopify / OpenAI / Supabase directly (not through src/lib or
// src/providers, which don't exist yet) so it can verify a .env before the
// rest of the pipeline is built.

import { config } from '../src/config.js';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const status = ok ? 'OK' : 'FAIL';
  console.log(`[${status}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function testOpenAI() {
  try {
    const client = new OpenAI({ apiKey: config.openai.apiKey });
    // Cheapest possible call that proves the key is valid.
    await client.models.list();
    record('OpenAI', true, 'API key accepted');
  } catch (err) {
    record('OpenAI', false, err.message);
  }
}

async function testSupabase() {
  try {
    const client = createClient(config.supabase.url, config.supabase.secretKey);
    const { error } = await client.from('topics').select('id').limit(1);
    if (error) throw error;
    record('Supabase', true, 'queried "topics" table');
  } catch (err) {
    record('Supabase', false, err.message);
  }
}

async function getShopifyAccessToken() {
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
    throw new Error(body.error_description ?? body.error ?? `HTTP ${res.status}`);
  }
  return body.access_token;
}

async function testShopify() {
  try {
    const accessToken = await getShopifyAccessToken();

    const graphqlUrl = `https://${config.shopify.storeDomain}/admin/api/${config.shopify.apiVersion}/graphql.json`;
    const res = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query: '{ shop { name } }' }),
    });

    const body = await res.json();
    if (!res.ok || body.errors) {
      throw new Error(JSON.stringify(body.errors ?? `HTTP ${res.status}`));
    }

    record('Shopify', true, `token exchange + GraphQL OK, shop="${body.data.shop.name}"`);
  } catch (err) {
    record('Shopify', false, err.message);
  }
}

async function main() {
  console.log(`Testing connections for store: ${config.shopify.storeDomain}\n`);

  await Promise.all([testOpenAI(), testSupabase(), testShopify()]);

  console.log('');
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`${failed.length} of ${results.length} check(s) failed.`);
    process.exit(1);
  }

  console.log(`All ${results.length} checks passed.`);
}

main();
