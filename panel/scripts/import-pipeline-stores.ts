// One-time move of the blog pipeline's store credentials from its .env into the shared `stores` table.
//
//   npm run import-stores                         dry run: shows what would be written, writes nothing
//   npm run import-stores -- --apply              inserts stores that are not in the table yet
//   npm run import-stores -- --apply --paused gutexpert
//                                                 ...with the blog switched off for gutexpert
//   --env ../.env       the pipeline's env file (default: the repo root .env)
//   --store collagenlab only this store (repeatable)
//
// Existing rows are never overwritten; edit them in the panel instead. Each store's credentials are
// tested against Shopify (read-only) before anything is written.
// Needs SUPABASE_URL, SUPABASE_SECRET_KEY and CREDENTIALS_KEY (panel/.env).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { encrypt } from "../src/lib/crypto";
import { testConnection } from "../src/lib/stores/connection";
import { pipelineStoresDir, pipelineStoreSlugs } from "../src/lib/stores/pipeline";
import { storeRepository } from "../src/lib/stores/repository";
import { normalizeShopDomain } from "../src/lib/shopify/token";

const { values: args } = parseArgs({
  options: {
    apply: { type: "boolean", default: false },
    env: { type: "string", default: join("..", ".env") },
    store: { type: "string", multiple: true },
    paused: { type: "string", multiple: true, default: [] },
  },
});

interface PipelineStoreConfig {
  id: string;
  brand?: { name?: string };
  env?: Record<string, string | undefined>;
  shopify?: { publicDomain?: string | null; blogGid?: string | null };
}

async function main() {
  const pipelineEnv = parseEnv(readFileSync(args.env!, "utf8")) as Record<string, string | undefined>;
  const value = (name?: string) => (name ? pipelineEnv[name]?.trim() || undefined : undefined);

  const repo = storeRepository();
  const slugs = args.store?.length ? args.store : pipelineStoreSlugs();
  let toWrite = 0;

  for (const slug of slugs) {
    const configPath = join(pipelineStoresDir(), slug, "store.config.js");
    const config = (await import(pathToFileURL(configPath).href)).default as PipelineStoreConfig;
    const env = config.env ?? {};
    const name = config.brand?.name ?? slug;
    const prefix = `${slug.padEnd(18)}`;

    let exists = false;
    try {
      exists = Boolean(await repo.findBySlug(slug));
    } catch (err) {
      // Before the migration the table is missing; a dry run can still check the credentials.
      if (args.apply) throw err;
      if (slug === slugs[0]) console.log(`(stores table not readable yet: ${err instanceof Error ? err.message : err})\n`);
    }
    if (exists) {
      console.log(`${prefix} already in the panel — skipped`);
      continue;
    }

    const domain = value(env.shopifyStoreDomain);
    const clientId = value(env.shopifyClientId);
    const clientSecret = value(env.shopifyClientSecret);
    if (!domain || !clientId || !clientSecret) {
      console.log(`${prefix} ✗ ${[env.shopifyStoreDomain, env.shopifyClientId, env.shopifyClientSecret].join(" / ")} not all set in ${args.env}`);
      continue;
    }
    const shopDomain = normalizeShopDomain(domain);
    const publicDomain = value(env.storePublicDomain) ?? config.shopify?.publicDomain ?? null;
    const blogGid = value(env.blogGid) ?? config.shopify?.blogGid ?? null;
    const autoblogEnabled = !args.paused!.includes(slug);

    const connection = await testConnection({ shop: shopDomain, clientId, clientSecret });
    if (!connection.ok) {
      console.log(`${prefix} ✗ connection failed: ${connection.error}`);
      continue;
    }
    if (blogGid && connection.blogs && !connection.blogs.some((b) => b.id === blogGid)) {
      console.log(`${prefix} ✗ blog ${blogGid} not found in the store`);
      continue;
    }

    const summary = `${name} · ${shopDomain} · public ${publicDomain ?? "—"} · blog ${blogGid ?? "—"} · blog ${autoblogEnabled ? "on" : "OFF"}`;
    if (connection.missingScopes.length) console.log(`${prefix}   note: missing scopes for translation: ${connection.missingScopes.join(", ")}`);
    toWrite++;

    if (!args.apply) {
      console.log(`${prefix} ✓ would add: ${summary}`);
      continue;
    }
    await repo.create({
      slug,
      name,
      shopDomain,
      clientId,
      clientSecretEncrypted: encrypt(clientSecret),
      publicDomain,
      blogGid,
      autoblogEnabled,
      connection,
    });
    console.log(`${prefix} ✓ added: ${summary}`);
  }

  if (!args.apply && toWrite) console.log(`\nDry run: nothing written. Re-run with --apply to add ${toWrite} store(s).`);
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
