// Read-only. For every stores/<id>/ folder, loads the config the pipeline would run with and shows
// where the Shopify credentials come from (panel or env), the domains, the blog and the panel's
// blog switch. Then checks the token. Writes nothing; generates nothing.
//
//   npm run check-stores
//   npm run check-stores -- collagenlab nutrikal

import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const all = readdirSync(path.join(ROOT, 'stores'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path.join(ROOT, 'stores', d.name, 'store.config.js')))
  .map((d) => d.name);
const stores = process.argv.slice(2).length ? process.argv.slice(2) : all;

// config.js resolves one store per process (STORE is read at import), so each store gets its own.
const probe = `
const { config } = await import('./src/config.js');
const mask = (d) => d?.replace(/^(.{4}).*(\\.myshopify\\.com)$/, '$1…$2') ?? '—';
let token = 'not checked';
try {
  const res = await fetch('https://' + config.shopify.storeDomain + '/admin/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: config.shopify.clientId, client_secret: config.shopify.clientSecret }),
  });
  const text = await res.text();
  token = res.ok ? 'OK' : 'FAILED ' + res.status + ' ' + ((/Oauth error ([a-z_]+)/i.exec(text) ?? [])[1] ?? (() => { try { return JSON.parse(text).error; } catch { return ''; } })());
} catch (err) { token = 'FAILED ' + err.message; }
console.log('  credentials: ' + config.store.credentialsSource + ' | shop: ' + mask(config.shopify.storeDomain) + ' | public: ' + config.shopify.publicDomain + ' | blog: ' + (config.shopify.blogGid ?? '—') + ' | blog switch: ' + (config.store.autoblogEnabled ? 'on' : 'OFF') + ' | token: ' + token);
`;

let failed = 0;
for (const store of stores) {
  console.log(`\n${store}`);
  try {
    process.stdout.write(
      execFileSync(process.execPath, ['--input-type=module', '-e', probe], {
        cwd: ROOT,
        env: { ...process.env, STORE: store },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    );
  } catch (err) {
    failed++;
    console.log(`  ✗ ${(err.stderr || err.message).trim().split('\n').find((l) => l.includes('Error')) ?? err.message}`);
  }
}
process.exitCode = failed ? 1 : 0;
