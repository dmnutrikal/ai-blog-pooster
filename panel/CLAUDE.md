# Nutrikal Translate

In-house replacement for the T Lab translation app on Nutrikal's Shopify stores (CollagenLab first, GutExpert next).
Lives in `panel/` of the blog generator repo and shares its Supabase project; the store records here also feed the
blog pipeline (see `../CLAUDE.md`).
Reads translatable content through the Admin GraphQL API, translates it with an LLM (OpenAI by default,
Claude as the alternative), and writes it back with `translationsRegister`. Shopify remains the only place
where published translations live.

## Layout

- `src/lib/shopify/` — token (client credentials grant), the GraphQL client, operations, resource types
- `src/lib/stores/` — connected stores: repository (shared Supabase `stores` table), connection test, pipeline store folders
- `src/lib/blog/` — read-only queries over the blog pipeline tables (`topics`, `articles`, `blog_runs`)
- `src/lib/supabase.ts`, `src/lib/audit.ts` — Supabase client, audit log
- `src/lib/crypto.ts` — AES-GCM for Client secrets at rest
- `src/lib/translate/` — engine interface, shared prompt, OpenAI and Claude engines (`factory.ts` picks one
  from `TRANSLATE_ENGINE`), masking of protected text, validation, batch pipeline; `sync.ts` (engine with
  Shopify/DB ports), `db.ts` (Supabase port + job/coverage reads), `run-sync.ts` (wires a real store)
- `src/app/` — Next.js panel: Магазини, Добави магазин, store page (connection test, blog and write toggles), blog page
- `scripts/` — worker entry points and Phase 0 checks; run with `tsx`
- `../supabase/migrations/` — the shared database schema (one Supabase project for blog and translation)
- `tests/` — vitest; Shopify is mocked with fixtures, never called

## Commands

- `npm run dev` — panel on http://127.0.0.1:3000; stores are added there
- `npm run gen-key` — a new `CREDENTIALS_KEY`
- `npm run import-stores -- [--apply] [--paused slug] [--store slug]` — one-time import of the blog pipeline stores from `../.env`; dry run without `--apply`
- `npm test`, `npm run typecheck`
- `npm run sync -- [--store slug] [--locale de,fr] [--max n] [--write|--adopt]` — product translation sync
  (dry run without `--write`; proposals land as `pending_review`). `--adopt` accepts the store's current
  state as the baseline: later runs only touch source text changed after that point (per source digest).
  Also on the store's Преводи page in the panel. CollagenLab's baseline was adopted on 2026-11-23.
- `npm run sync:scheduled` — syncs every store with "Автоматичен седмичен превод" on (off by default;
  toggled on the Преводи page, column `stores.translate_weekly_enabled`). Runs weekly from
  `../.github/workflows/translate.yml`; writes only where "Разреши запис" is also on, else leaves proposals.
- `npm run phase0:e2e -- [--store domain|name] --locale de [--product gid] [--write] [--record]`
- `npm run phase0:count -- [--store domain|name] [--type ARTICLE]`

## Rules

- Shopify Admin GraphQL API version **2026-10** only (`SHOPIFY_API_VERSION` in `src/lib/shopify/client.ts`). No REST.
- Every GraphQL call goes through `ShopifyClient.request` — it tracks the cost bucket, retries throttling and 5xx,
  and refreshes the token. Do not call `fetch` against Shopify anywhere else.
- Add new operations to `src/lib/shopify/operations.ts` and validate them against 2026-10 with the Shopify Dev
  tooling (shopify skill / Dev MCP) before use. Look things up in the docs, not from memory; the API changes every quarter.
- Store connection data (domain, Client ID, Client secret) is entered in the panel, never in `.env` or code.
  Only `credentialsFor()` in `src/lib/stores/repository.ts` decrypts a secret; `PublicStore` is what may reach the browser.
- No write to a live store without both an explicit flag and a dry run first. Writes are refused unless the store
  has `writesEnabled` ("Разреши запис" on its page in the panel, off by default). The test store is the first write target; CollagenLab joins in Phase 3, one locale first.
- Never overwrite a translation with status `locked` (manual edit). Back up the previous value before every write.
- A translation that fails validation (`src/lib/translate/validate.ts`) is never written; record the reason instead.
- App-level secrets (OpenAI/Claude API keys, `CREDENTIALS_KEY`) only in environment variables; store Client secrets only
  encrypted in the store repository. Never in code, fixtures, logs or error messages. The access token lives in memory only.
- Tests use recorded or hand-written Shopify responses; they must run without network access.
- The panel never updates or deletes rows in `topics`, `products` or `articles`; those belong to the blog
  pipeline (`../src`). One exception: the blog page INSERTS new pending `topics` rows (user-entered article
  titles, `addBlogTopics`). Migrations are additive and must leave those tables untouched (the PGlite test
  checks this).
- A store's `slug` equals `topics.store`/`articles.store` and its `../stores/<slug>/` folder; never rename one.
- The panel has no login yet, so `dev`/`start` bind to 127.0.0.1. Do not expose it until Supabase Auth is in place;
  then every server action must check the session.
- UI: no horizontal scroll at any width; long tables turn into cards on narrow screens. UI text in Bulgarian,
  Shopify field names in English.
- Models, per `TRANSLATE_ENGINE`: openai (default) — `gpt-5.6-luna` for bulk text, `gpt-5.6-terra` for product
  pages (the blog pipeline's models); claude — `claude-haiku-5-5` / `claude-sonnet-5-5`. The prompt and output
  checks in `src/lib/translate/prompt.ts` are engine-independent. Non-urgent jobs go through the Batch API.
- One phase per session and per pull request. Plan first, then code.
