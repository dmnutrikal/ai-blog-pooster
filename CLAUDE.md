# Nutrikal AI AutoBlog + panel

Two apps in one repo, one Supabase project:

- **Blog pipeline** (root: `src/`, `stores/`, `scripts/`) — Node ESM, OpenAI. Runs daily from GitHub Actions
  (`.github/workflows/autoblog.yml`, one job per store, `STORE=<slug>`) and publishes SEO articles to the Shopify blog.
  Live on CollagenLab, MadeByNatureLab and Nutrikal; GutExpert is paused (`if: false` in the workflow).
- **Panel** (`panel/`) — Next.js, Bulgarian UI. Stores are connected there; it shows the blog's state and hosts the
  translation module (Nutrikal Translate). Its own rules are in `panel/CLAUDE.md`.

## Shared data

- `supabase/migrations/` — the schema both apps share. `topics`, `products`, `articles` predate the migrations and
  live only in production; `supabase/reference/autoblog_tables_reconstructed.sql` is a copy for tests, never run it.
- `stores` — one row per store, `slug` = `topics.store` = `articles.store` = `stores/<slug>/`. Client secrets are
  AES-GCM encrypted with `CREDENTIALS_KEY`; the panel encrypts (`panel/src/lib/crypto.ts`), the pipeline decrypts
  (`src/lib/storeRecord.js`). Both must use the same format and key.
- `blog_runs` — one row per pipeline run, written by `src/lib/runLog.js`.

## Commands

- Root: `npm run run` (one pipeline run for `STORE`), `npm run check-stores` (read-only: credential source + token)
- Panel: see `panel/CLAUDE.md`

## Rules

- The pipeline is live. Every change to it must keep the env-var path working: when `stores` has no row, the table
  is missing, or `CREDENTIALS_KEY` is absent, `src/config.js` falls back to the `SHOPIFY_*` / `BLOG_GID_*` vars.
- Run logging and panel reads are best effort; a Supabase error there must never stop or fail a run.
- Migrations are additive and idempotent. Never alter or drop `topics`, `products`, `articles` from a migration.
- Applying a migration to the production Supabase, changing GitHub secrets, enabling a paused job or writing to a
  live store needs the user's explicit go-ahead.
- Secrets only in `.env` / GitHub secrets or encrypted in `stores`. Never in code, logs, fixtures or error messages.
