# Nutrikal Commerce Automation — AI AutoBlog + Nutrikal Translate

Two apps in one repo, sharing one Supabase project and one admin panel, for Nutrikal's Shopify stores
(CollagenLab, Made By Nature Labs, Nutrikal, GutExpert):

1. **AI AutoBlog** (repo root — `src/`, `stores/`) — generates, moderates, illustrates, links and
   publishes SEO blog articles on a daily schedule.
2. **Nutrikal Translate** (`panel/`) — the in-house replacement for the T-Lab translation app:
   translates the store's entire content into every published locale with an LLM, through Shopify's
   native translation storage. Includes the admin panel where stores are connected and both apps are
   managed.

## Overview

**AutoBlog:** each run selects a pending topic, generates full-quality article content, runs it through an independent compliance/moderation audit, links it to semantically related products already in the store catalog, generates a featured image, and publishes the result to the store's blog via the Shopify GraphQL Admin API. The pipeline is designed to run without human supervision, with per-article error isolation so a single failure never halts a scheduled run.

**Translate:** a sync walks every translatable resource of the store (products, collections, pages, policies, blog, menus, theme texts, metaobjects, rich text fields, image alt texts, email templates, delivery/payment), finds fields whose source text is missing a translation or changed since the last one, translates them in batches with an LLM, validates the output, and registers it back with `translationsRegister` — so everything shows up in Shopify's own Translate & Adapt, exactly like a human translation. Runs manually from the panel/CLI and weekly on a schedule (opt-in per store, off by default).

## Key Features

### AutoBlog

- **AI content generation** — full-length, SEO-structured articles generated per topic, not templated filler.
- **Independent compliance moderation** — a separate auditor model reviews finished copy against configurable content-safety rules; it never sees the writing prompt and cannot mark its own homework.
- **Semantic product linking** — vector embeddings and similarity search surface genuinely related products and prior articles for internal linking, with guardrails against weak or inappropriate matches.
- **Automated featured-image generation** — a topic-appropriate image is generated and uploaded to the store's media library for each article.
- **Primary-language canonical content with translation registration** — each article is authored as a complete, independent piece in the store's primary language, with a secondary market language registered as a native platform translation rather than a machine-translated afterthought.
- **Scheduled, unattended runs** — sequential processing with per-item error isolation, built to run reliably on a schedule (e.g. via GitHub Actions) without manual intervention.
- **Manual article titles** — the panel's blog page queues user-entered titles as topics; exact-title mode carries the headline verbatim into the published article.

### Nutrikal Translate

- **Full-store coverage** — 23 translatable resource types, from product pages to theme strings, metaobject rich text and image alt texts; whatever cannot be translated safely is counted and reported, never guessed at.
- **Change-driven** — the store's existing translations were adopted as the accepted baseline; syncs only touch source text that changed or appeared after that point (tracked per Shopify content digest).
- **Protected terms and glossary** — brand names and configured terms are masked before the model sees the text and restored verbatim; per-locale "translate as" rules come from the shared glossary table.
- **Validation before every write** — markers, HTML tag structure, rich-text JSON structure and truncation are checked; a failed field is recorded with its reason and never written.
- **Reversible writes** — the previous value is backed up before every `translationsRegister` call; `locked` translations (manual edits) are never touched.
- **Dry-run first** — every sync can run as a proposal pass (`pending_review` in the shared database); live writes additionally require the store's "Разреши запис" switch.
- **Engine-agnostic** — OpenAI (`gpt-5.6-terra` for product pages, `gpt-5.6-luna` for bulk text) by default; Claude behind the same interface via `TRANSLATE_ENGINE`.
- **Weekly schedule, opt-in** — `.github/workflows/translate.yml` syncs every store that switched on "Автоматичен седмичен превод" in the panel (off by default).

## Architecture

The pipeline is a linear sequence of small, single-responsibility steps, each implemented as its own module and independently runnable/testable:

```
AutoBlog:   pick topic -> write article -> compliance audit -> link products -> generate image -> publish
Translate:  list resources -> diff against baseline -> mask -> translate in batches -> validate -> backup -> register
```

Key design principles used throughout this codebase:

- **Provider isolation** — every call to the AI provider's SDK is routed through a single module. No other file imports the SDK directly, so switching providers or models touches one place.
- **Single source of truth for regulatory/approved-claim constants** — any content rule that must be reproduced verbatim (e.g. an approved regulatory claim) lives in exactly one module per store (`stores/<id>/regulatory.js`) and is imported everywhere it's needed, eliminating drift between copies.
- **Shared engine, per-store folders** — `src/` holds the pipeline and contains nothing store-specific; each store's config, regulatory wording, product cutouts and editorial calendar live in `stores/<id>/`. Adding a store is a new folder plus its secrets, with no engine code change.
- **Fail-closed safety gate** — the publish step only proceeds past its safety gate on an explicit, unambiguous compliance pass. A missing, malformed, or negative compliance result is treated as unsafe by construction, not by convention.
- **Idempotent product sync with reconciliation and safety caps** — syncing the product catalog is safe to re-run at any time: it upserts current data and reconciles (removes) stale entries, with a safety cap that refuses to delete more than it just synced, to protect against partial-fetch failures being mistaken for real churn.
- **Per-store data scoping** — every table carries a store identifier column, so the schema already supports multiple stores sharing the same database. Every query scopes on the active `STORE`; `collagenlab` and `gutexpert` are wired up today.
- **Sequential processing with per-item error isolation** — articles are processed one at a time (not in parallel, to respect API rate limits and keep logs readable), and each is wrapped in its own error boundary so one failure is logged and skipped rather than aborting the run.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24+ (ES modules) |
| Content generation | OpenAI API — a primary text-generation model for article writing |
| Content moderation | OpenAI API — a lighter, independent model used solely for compliance auditing |
| Image generation | OpenAI API — an image-generation model for featured images |
| Embeddings | OpenAI API — an embedding model for semantic search |
| Database | Supabase (PostgreSQL + pgvector) — relational tables plus vector-search RPC functions |
| Commerce platform | Shopify GraphQL Admin API — client-credentials authentication with short-lived, auto-refreshing access tokens |
| Scheduling | GitHub Actions (or any scheduler capable of invoking the pipeline on a timer) |
| Translation engine | OpenAI API (default) or Anthropic Claude, behind one `TranslationEngine` interface |
| Admin panel | Next.js (App Router, server actions), Bulgarian UI, binds to 127.0.0.1 until auth lands |

Specific model identifiers are configured via environment variables rather than hardcoded, so they can be upgraded without code changes.

## Project Structure

The repo is split into a **shared engine** (`src/`) and **per-store folders**
(`stores/<id>/`). The engine contains nothing store-specific; a store folder
contains nothing but its own settings, content and assets. `STORE` selects
which store a run operates on (default `collagenlab`).

```
stores/
├── collagenlab/           English-primary store (EN main article + BG translation).
│   ├── store.config.js    Store id, primaryLocale/secondaryLocale, the env-var NAMES
│   │                      holding this store's secrets, fallback product handle and
│   │                      product-link anchor pools. No secret values.
│   ├── regulatory.js      Compliance profile: approved claim text, writer guardrails,
│   │                      auditor brief, image restrictions, mandatory disclaimer.
│   ├── content.js         Editorial voice: how prompts describe the store, link
│   │                      examples, topic-generator brief, image styling.
│   ├── products/          Product cutout PNGs used to render featured images.
│   ├── data/
│   │   └── calendar.json  The fixed editorial calendar loaded into `topics`.
│   └── recipes/           Recipe images. Reserved — nothing reads this yet.
│
├── gutexpert/             Bulgarian-primary store (BG main article + EN translation).
│                          Same files as collagenlab minus data/ — its topics come from
│                          the topic generator, not a fixed calendar. Paused in the workflow.
├── madebynaturelabs/      English-only B2B store, live.
└── nutrikal/              English-only B2B store, live.

src/
├── config.js              Loads shared defaults, merges the active store's
│                          stores/<STORE>/store.config.js over them, and validates the
│                          environment; fails fast on startup if anything required is
│                          missing or invalid. Also exports the active `STORE` id and
│                          the resolved per-store paths (`config.store.paths`).
├── index.js               Orchestrates the full pipeline across N articles per run, with
│                          per-article error isolation and a run-level summary.
│
├── providers/
│   └── openai.js          The only module that imports the AI provider SDK. Exposes
│                          generate(), embed(), and image() to the rest of the codebase.
│
├── lib/
│   ├── shopify.js         Client-credentials token exchange (with auto-refresh) and a
│   │                      shared graphql() request helper.
│   ├── supabase.js        Shared server-side Supabase client.
│   ├── generateJson.js    Shared helper for requesting strict-JSON model output and
│   │                      retrying once on a malformed response.
│   ├── storeRegulatory.js Loads the ACTIVE store's stores/<STORE>/regulatory.js and
│   │                      re-exports it, so the engine holds no store's claim text.
│   └── storeContent.js    Same for stores/<STORE>/content.js (the store's voice).
│
└── steps/
    ├── syncProducts.js    Fetches active products from the store, embeds them, and
    │                      reconciles them into the product catalog table.
    ├── pickTopic.js       Selects the next pending topic by priority and age.
    ├── writeArticle.js    Generates the primary-language and secondary-language articles
    │                      independently, under shared content-safety guardrails.
    ├── compliance.js      Runs an independent moderation audit over the generated content
    │                      and returns a pass/fail verdict with flagged issues.
    ├── linkProducts.js    Finds semantically related products and prior articles via
    │                      vector similarity and injects internal links.
    ├── generateImage.js   Generates a featured image and uploads it to the store's media
    │                      library.
    └── publish.js         The compliance safety gate, article creation, and secondary-
                           language translation registration.

panel/                     Nutrikal Translate + the admin panel (Next.js, its own package.json).
├── src/lib/shopify/       Client-credentials token, GraphQL client (cost tracking, retries),
│                          operations validated against the pinned Admin API version.
├── src/lib/translate/     Engine interface, shared prompt, OpenAI/Claude engines, masking,
│                          validation, structured (rich text/list) handling, the sync engine
│                          (sync.ts) with its Shopify/DB ports, Supabase port (db.ts).
├── src/lib/stores/        The shared `stores` repository (AES-GCM encrypted Client secrets).
├── src/app/               Магазини, store page, Преводи (sync, coverage, jobs), Блог page.
├── scripts/               sync-products.ts (manual sync/adopt), sync-scheduled.ts (weekly),
│                          import-pipeline-stores.ts, Phase 0 checks.
└── tests/                 Vitest; Shopify and the database are faked, no network.

supabase/migrations/       The shared schema both apps use (stores, blog_runs, translation_*).
.github/workflows/         autoblog.yml (daily articles), translate.yml (weekly translation sync).
```

## Prerequisites

- Node.js 24 or later.
- A Shopify custom app configured with the Admin API scopes required by this pipeline (see [Configuration](#configuration)).
- An OpenAI API key.
- A Supabase project with the `pgvector` extension enabled, and the required tables/RPC functions applied.

## Setup

1. Clone the repository.
2. Install dependencies:
   ```
   npm install
   ```
3. Copy the environment template and fill in real credentials:
   ```
   cp .env.example .env
   ```
4. Apply the database schema (tables and vector-search RPC functions) to your Supabase project.
5. Verify all three integrations are reachable:
   ```
   npm run test-connections
   ```
6. Populate the product catalog (fetches products, generates embeddings, upserts into the database):
   ```
   npm run sync-products
   ```
7. Run the pipeline:
   ```
   npm run run
   ```

## Configuration

All configuration is read from environment variables via `src/config.js`, which validates required values and fails loudly on startup if anything is missing. See `.env.example` for the full template. Values are never hardcoded; only variable **names** are documented here.

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | API key for the AI provider. |
| `OPENAI_MODEL_TERRA` | Identifier of the primary text-generation model used for article writing. |
| `OPENAI_MODEL_LUNA` | Identifier of the model used for independent compliance auditing. |
| `OPENAI_MODEL_IMAGE` | Identifier of the image-generation model used for featured images. |
| `OPENAI_MODEL_EMBEDDING` | Identifier of the embedding model used for semantic search. |
| `SUPABASE_URL` | URL of the Supabase project. |
| `SUPABASE_SECRET_KEY` | Server-side secret key for Supabase (never the anon/public key). |
| `CREDENTIALS_KEY` | Decrypts the store's Client secret saved in the panel (same key as `panel/.env`). Optional — without it the `SHOPIFY_*` vars are used. |
| `STORE` | Which `stores/<id>/` folder the run operates on. Defaults to `collagenlab`. |
| `SHOPIFY_STORE_DOMAIN` | The store's `*.myshopify.com` domain. |
| `SHOPIFY_CLIENT_ID` | Client ID of the Shopify custom app (client-credentials grant). |
| `SHOPIFY_CLIENT_SECRET` | Client secret of the Shopify custom app. |
| `SHOPIFY_API_VERSION` | Shopify Admin API version this codebase targets. |
| `BLOG_GID_COLLAGENLAB` | GID of the Shopify blog articles are published into. If unset, the pipeline discovers and logs the store's default blog GID on first run. |
| `COMPLIANCE_MODE` | `block` \| `log` \| `off` — whether a failed compliance audit blocks publishing, is only logged, or is skipped entirely. |
| `ARTICLES_PER_RUN` | Number of articles processed per pipeline invocation. |
| `PUBLISH_STATUS` | Optional override of the store's `publishStatus` (set per store in `stores/<id>/store.config.js`): `draft` (created Hidden, for manual review) \| `published` (live immediately). |
| `LINK_MIN_SIMILARITY` | Minimum cosine similarity for a product to qualify as a genuine internal-link match. |
| `ACCESSORY_KEYWORDS` | Comma-separated keywords used to exclude non-primary product types from internal linking. |
| `IMAGE_SIZE` | Dimensions of the generated featured image. |
| `IMAGE_QUALITY` | Quality tier of the generated featured image. |
| `IMAGE_FORCE_FLAVOR` | Test/trial-run only — forces a specific product flavor slug (from `stores/<STORE>/products/`) instead of picking one at random per article. |

## Panel & Nutrikal Translate

`panel/` is a Next.js admin panel (Bulgarian UI) that shares this Supabase project. Stores are
connected there once — myshopify domain, Client ID, Client secret (stored AES-GCM encrypted),
public domain and blog — and both the blog pipeline and the translation module use that record.
The store's `slug` is the same value as `topics.store` / `articles.store` and the `stores/<slug>/`
folder, so existing data is reused as is. Its own rules live in `panel/CLAUDE.md`.

**Blog integration**

- **Credentials:** `src/config.js` reads the `stores` row for `STORE`. If there is no row, no
  `CREDENTIALS_KEY`, or the table is missing, it falls back to the env vars and logs why.
- **On/off:** "Блог генератор" on the store page sets `autoblog_enabled`; a disabled store's run
  is recorded as `skipped` and generates nothing. The GitHub job itself must also be enabled.
- **Run history:** each run writes a row to `blog_runs` (best effort — a Supabase error never
  stops a run). The panel's blog page shows runs, next topics, blocked topics and recent articles,
  and queues user-entered article titles as new topics.
- `npm run check-stores` — read-only: where each store's credentials come from, and whether the
  token works.

**Translation (the Преводи page per store, or the CLI from `panel/`)**

- `npm run sync -- --store <slug> [--types products,theme,…] [--locale de,fr] [--max n]` — dry run:
  translates what is missing/changed and stores proposals as `pending_review`; nothing written.
- `… --write` — the same, but registers to Shopify, with a backup of every previous value. Requires
  the store's "Разреши запис" switch in the panel.
- `… --adopt` — accepts the store's current state (including untranslated fields) as the baseline;
  from then on only content changed after that point is translated. $0, writes nothing to Shopify.
- `npm run sync:scheduled` — what the weekly workflow runs: every store with "Автоматичен седмичен
  превод" switched on; writes only where writes are enabled, otherwise leaves proposals.
- The page shows per-locale coverage, job history with token cost, and rejected fields with reasons.

Setup, in order:

1. Apply `supabase/migrations/` (additive; they do not touch `topics`, `products`, `articles`).
2. `cd panel && npm install && npm run gen-key` → put the key in `panel/.env` as `CREDENTIALS_KEY`
   and in the GitHub secret `CREDENTIALS_KEY`. Fill `SUPABASE_URL` / `SUPABASE_SECRET_KEY` and
   `OPENAI_API_KEY` (+ `TRANSLATE_ENGINE=openai`) there too.
3. `npm run import-stores` (dry run), then `npm run import-stores -- --apply --paused gutexpert` —
   copies the stores from the pipeline `.env` into the panel after a connection test.
4. `npm run sync -- --store <slug> --adopt` — accept the store's existing translations as the baseline.
5. `npm run dev` → http://127.0.0.1:3000. The panel has no login yet; it binds to localhost only.

The Shopify custom app needs, beyond the blog scopes: `read/write_translations`, `read/write_locales`,
`read_products`, `read_themes`, `read_online_store_navigation`, `read_markets`, `read_metaobjects`,
`read_metaobject_definitions`, `write_files`. After releasing a new app version with scopes, approve
them on the app's page in the store admin — the token only carries what the store granted.

## Compliance & Safety

Content moderation is layered in two independent stages:

1. **Generation-time guardrails** — the content-generation step is instructed with explicit content-safety rules at write time.
2. **Independent post-generation audit** — a separate model, which never sees the generation prompt or guardrails, reviews the finished article text and returns a structured verdict (pass/fail) plus a list of any flagged issues by severity.

Publishing is protected by a **fail-closed safety gate**: the publish step only proceeds if the compliance result is an explicit, unambiguous pass. Any other outcome — a failed audit, a missing result, or a malformed result — is treated as unsafe and blocks publishing by construction, not by convention. When publishing is blocked, the pipeline records the outcome and moves on to the next item rather than halting the run.

## Deployment

Both apps run unattended via GitHub Actions: `autoblog.yml` publishes articles daily (one job per
store; a store without its secrets is skipped with a notice), and `translate.yml` runs the weekly
translation sync on Mondays for opted-in stores (it skips cleanly while its secrets are absent).
All credentials are supplied via environment variables at runtime — never committed to source
control. In CI, these are stored as encrypted repository secrets; locally, they live in gitignored
`.env` files created from `.env.example` / `panel/.env.example`.

Only ONE repository may have the schedules active with secrets at a time — two active copies would
publish articles and write translations twice.
