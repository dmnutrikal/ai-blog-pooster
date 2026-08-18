# Auto-blog-publisher

AI-powered SEO blog automation for Shopify.

## Overview

This project generates, moderates, illustrates, links, and publishes SEO blog articles to a Shopify store on an unattended, recurring schedule. Each run selects a pending topic, generates full-quality article content, runs it through an independent compliance/moderation audit, links it to semantically related products already in the store catalog, generates a featured image, and publishes the result to the store's blog via the Shopify GraphQL Admin API. The pipeline is designed to run without human supervision, with per-article error isolation so a single failure never halts a scheduled run.

## Key Features

- **AI content generation** — full-length, SEO-structured articles generated per topic, not templated filler.
- **Independent compliance moderation** — a separate auditor model reviews finished copy against configurable content-safety rules; it never sees the writing prompt and cannot mark its own homework.
- **Semantic product linking** — vector embeddings and similarity search surface genuinely related products and prior articles for internal linking, with guardrails against weak or inappropriate matches.
- **Automated featured-image generation** — a topic-appropriate image is generated and uploaded to the store's media library for each article.
- **Primary-language canonical content with translation registration** — each article is authored as a complete, independent piece in the store's primary language, with a secondary market language registered as a native platform translation rather than a machine-translated afterthought.
- **Scheduled, unattended runs** — sequential processing with per-item error isolation, built to run reliably on a schedule (e.g. via GitHub Actions) without manual intervention.

## Architecture

The pipeline is a linear sequence of small, single-responsibility steps, each implemented as its own module and independently runnable/testable:

```
pick topic -> write article -> compliance audit -> link products -> generate image -> publish
```

Key design principles used throughout this codebase:

- **Provider isolation** — every call to the AI provider's SDK is routed through a single module. No other file imports the SDK directly, so switching providers or models touches one place.
- **Single source of truth for regulatory/approved-claim constants** — any content rule that must be reproduced verbatim (e.g. an approved regulatory claim) lives in exactly one shared module and is imported everywhere it's needed, eliminating drift between copies.
- **Fail-closed safety gate** — the publish step only proceeds past its safety gate on an explicit, unambiguous compliance pass. A missing, malformed, or negative compliance result is treated as unsafe by construction, not by convention.
- **Idempotent product sync with reconciliation and safety caps** — syncing the product catalog is safe to re-run at any time: it upserts current data and reconciles (removes) stale entries, with a safety cap that refuses to delete more than it just synced, to protect against partial-fetch failures being mistaken for real churn.
- **Per-store data scoping** — every table carries a store identifier column, so the schema already supports multiple stores sharing the same database, even though only one store is configured today.
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

Specific model identifiers are configured via environment variables rather than hardcoded, so they can be upgraded without code changes.

## Project Structure

```
src/
├── config.js              Loads and validates environment configuration; fails fast on
│                          startup if anything required is missing or invalid.
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
│   └── regulatory.js      Single source of truth for approved regulatory claim text.
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
| `SHOPIFY_STORE_DOMAIN` | The store's `*.myshopify.com` domain. |
| `SHOPIFY_CLIENT_ID` | Client ID of the Shopify custom app (client-credentials grant). |
| `SHOPIFY_CLIENT_SECRET` | Client secret of the Shopify custom app. |
| `SHOPIFY_API_VERSION` | Shopify Admin API version this codebase targets. |
| `BLOG_GID_COLLAGENLAB` | GID of the Shopify blog articles are published into. If unset, the pipeline discovers and logs the store's default blog GID on first run. |
| `COMPLIANCE_MODE` | `block` \| `log` \| `off` — whether a failed compliance audit blocks publishing, is only logged, or is skipped entirely. |
| `ARTICLES_PER_RUN` | Number of articles processed per pipeline invocation. |
| `PUBLISH_STATUS` | `draft` \| `published` — whether created articles require manual review or go live immediately. |
| `LINK_MIN_SIMILARITY` | Minimum cosine similarity for a product to qualify as a genuine internal-link match. |
| `ACCESSORY_KEYWORDS` | Comma-separated keywords used to exclude non-primary product types from internal linking. |
| `IMAGE_SIZE` | Dimensions of the generated featured image. |
| `IMAGE_QUALITY` | Quality tier of the generated featured image. |
| `IMAGE_FORCE_FLAVOR` | Test/trial-run only — forces a specific product flavor slug (from `assets/products/`) instead of picking one at random per article. |

## Compliance & Safety

Content moderation is layered in two independent stages:

1. **Generation-time guardrails** — the content-generation step is instructed with explicit content-safety rules at write time.
2. **Independent post-generation audit** — a separate model, which never sees the generation prompt or guardrails, reviews the finished article text and returns a structured verdict (pass/fail) plus a list of any flagged issues by severity.

Publishing is protected by a **fail-closed safety gate**: the publish step only proceeds if the compliance result is an explicit, unambiguous pass. Any other outcome — a failed audit, a missing result, or a malformed result — is treated as unsafe and blocks publishing by construction, not by convention. When publishing is blocked, the pipeline records the outcome and moves on to the next item rather than halting the run.

## Deployment

This pipeline is designed to run unattended on a recurring schedule via GitHub Actions (or any scheduler capable of invoking `npm run run` on a timer). All credentials are supplied via environment variables at runtime — never committed to source control. In CI, these are stored as encrypted repository secrets; locally, they live in a gitignored `.env` file created from `.env.example`.
# ai-blog-pooster
