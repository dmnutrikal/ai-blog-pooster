-- Shared schema for the Nutrikal panel: one `stores` table used by the blog pipeline and the
-- translation engine, the translation tables, and blog run history.
--
-- Additive only. It does not alter `topics`, `products`, `articles` or the match_* functions the
-- live blog pipeline uses, and it is safe to run more than once. The pipeline keeps working before,
-- during and after this migration: it falls back to its environment variables while `stores` has
-- no row (or no readable row) for the store it runs.
--
-- Access: RLS is on for every new table with no policies, so only the secret/service key
-- (pipeline, panel server) can read or write them.

create extension if not exists pgcrypto;

-- Stores ---------------------------------------------------------------------------------------

create table if not exists stores (
  id                       uuid primary key default gen_random_uuid(),
  -- Same value as topics.store / products.store / articles.store and the pipeline's stores/<slug>/ folder.
  slug                     text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name                     text not null,
  shop_domain              text not null unique check (shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  client_id                text not null,
  -- AES-256-GCM, format v1.<iv>.<tag>.<data>; key in CREDENTIALS_KEY (panel env + GitHub secret).
  client_secret_encrypted  text not null,
  -- Customer-facing host for article URLs, e.g. collagenlab.bg. Overrides the pipeline's env/config value.
  public_domain            text,
  -- gid://shopify/Blog/... articles are published into. Overrides the pipeline's env/config value.
  blog_gid                 text,
  -- false: scheduled blog runs for this store exit without doing anything.
  autoblog_enabled         boolean not null default true,
  -- Last connection test from the panel: ok, error, shop name, scopes, locales, blogs.
  connection               jsonb,

  -- Translation settings
  primary_locale           text,
  source_locale            text,
  store_context            text,
  tone                     text,
  translation_schedule     text, -- cron, UTC
  notify_email             text,
  product_status_filter    text[] not null default array['ACTIVE'],
  translate_handles        boolean not null default false,
  translate_shop_policies  boolean not null default false,
  review_before_publish    text[] not null default '{}',
  -- Translation writes to Shopify are refused unless this is on ("Разреши запис" in the panel).
  writes_enabled           boolean not null default false,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists store_locales (
  store_id      uuid not null references stores(id) on delete cascade,
  locale        text not null,
  name          text,
  is_primary    boolean not null default false,
  published     boolean not null default false,
  ai_enabled    boolean not null default false,
  domain        text,
  tone          text,
  instructions  text,
  model         text,
  updated_at    timestamptz not null default now(),
  primary key (store_id, locale)
);

-- Blog pipeline run history ---------------------------------------------------------------------
-- Written by src/index.js at the start and end of every run. A failed write is logged and ignored.

create table if not exists blog_runs (
  id               bigserial primary key,
  store            text not null, -- stores.slug
  status           text not null default 'running' check (status in ('running', 'completed', 'failed', 'skipped')),
  trigger          text,          -- schedule | workflow_dispatch | local
  github_run_url   text,
  articles_per_run integer,
  published        integer not null default 0,
  drafted          integer not null default 0,
  blocked          integer not null default 0,
  errored          integer not null default 0,
  -- [{ topic_id, keyword, status, shopify_gid, error }]
  items            jsonb not null default '[]',
  error            text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index if not exists blog_runs_store_started on blog_runs (store, started_at desc);

-- Translation -----------------------------------------------------------------------------------

do $$ begin
  create type translation_content_kind as enum ('text', 'html', 'url', 'unsupported');
exception when duplicate_object then null; end $$;

do $$ begin
  create type translation_status as enum ('missing', 'current', 'outdated', 'locked', 'pending_review', 'failed');
exception when duplicate_object then null; end $$;

-- imported = existed in Shopify when the store was connected (written by T Lab or by hand).
do $$ begin
  create type translation_origin as enum ('imported', 'ai', 'manual', 'memory', 'csv');
exception when duplicate_object then null; end $$;

do $$ begin
  create type glossary_rule as enum ('never_translate', 'translate_as', 'locked_phrase');
exception when duplicate_object then null; end $$;

do $$ begin
  create type translation_job_kind as enum ('scan', 'translate', 'scheduled', 'import', 'export', 'images');
exception when duplicate_object then null; end $$;

do $$ begin
  create type translation_job_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists translation_resources (
  id             bigserial primary key,
  store_id       uuid not null references stores(id) on delete cascade,
  shopify_id     text not null,
  resource_type  text not null, -- TranslatableResourceType
  label          text,
  last_seen_at   timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (store_id, shopify_id)
);
create index if not exists translation_resources_type on translation_resources (store_id, resource_type);

create table if not exists translation_contents (
  id            bigserial primary key,
  resource_id   bigint not null references translation_resources(id) on delete cascade,
  key           text not null,
  shopify_type  text not null, -- LocalizableContentType
  kind          translation_content_kind not null,
  source_locale text not null,
  value         text,
  digest        text,
  updated_at    timestamptz not null default now(),
  unique (resource_id, key)
);

create table if not exists translations (
  id               bigserial primary key,
  content_id       bigint not null references translation_contents(id) on delete cascade,
  locale           text not null,
  market_id        text,
  value            text,
  source_digest    text,
  status           translation_status not null default 'missing',
  origin           translation_origin,
  model            text,
  failure_reason   text,
  written_at       timestamptz,
  updated_at       timestamptz not null default now()
);
create unique index if not exists translations_unique on translations (content_id, locale, coalesce(market_id, ''));
create index if not exists translations_locale_status on translations (locale, status);

create table if not exists translation_memory (
  source_hash   text not null,
  source_locale text not null,
  locale        text not null,
  value         text not null,
  model         text,
  created_at    timestamptz not null default now(),
  primary key (source_hash, source_locale, locale)
);

create table if not exists glossary_terms (
  id          bigserial primary key,
  store_id    uuid references stores(id) on delete cascade, -- null = shared by all stores
  rule        glossary_rule not null,
  source      text not null,
  locale      text,
  target      text,
  note        text,
  created_at  timestamptz not null default now(),
  check ((rule = 'never_translate') or (locale is not null and target is not null))
);
create unique index if not exists glossary_unique on glossary_terms (coalesce(store_id::text, ''), rule, source, coalesce(locale, ''));

create table if not exists translation_jobs (
  id              bigserial primary key,
  store_id        uuid not null references stores(id) on delete cascade,
  kind            translation_job_kind not null,
  status          translation_job_status not null default 'queued',
  dry_run         boolean not null default true,
  params          jsonb not null default '{}',
  scanned         integer not null default 0,
  translated      integer not null default 0,
  failed          integer not null default 0,
  input_tokens    bigint not null default 0,
  output_tokens   bigint not null default 0,
  cost_usd        numeric(12, 6) not null default 0,
  error           text,
  triggered_by    text,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz
);
create index if not exists translation_jobs_store_created on translation_jobs (store_id, created_at desc);

create table if not exists translation_backups (
  id              bigserial primary key,
  translation_id  bigint not null references translations(id) on delete cascade,
  previous_value  text,
  job_id          bigint references translation_jobs(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists translation_job_items (
  id              bigserial primary key,
  job_id          bigint not null references translation_jobs(id) on delete cascade,
  translation_id  bigint references translations(id) on delete set null,
  status          text not null,
  reason          text,
  created_at      timestamptz not null default now()
);
create index if not exists translation_job_items_job on translation_job_items (job_id);

create table if not exists image_overrides (
  id                 bigserial primary key,
  store_id           uuid not null references stores(id) on delete cascade,
  original_file_id   text,
  original_url       text not null,
  locale             text not null,
  file_id            text not null,
  file_url           text not null,
  alt                text,
  created_at         timestamptz not null default now(),
  unique (store_id, original_url, locale)
);

-- Every write to a store or to store settings, from the panel or a worker.
create table if not exists audit_log (
  id          bigserial primary key,
  store_id    uuid references stores(id) on delete set null,
  actor       text not null,
  action      text not null,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

alter table stores                enable row level security;
alter table store_locales         enable row level security;
alter table blog_runs             enable row level security;
alter table translation_resources enable row level security;
alter table translation_contents  enable row level security;
alter table translations          enable row level security;
alter table translation_memory    enable row level security;
alter table glossary_terms        enable row level security;
alter table translation_jobs      enable row level security;
alter table translation_backups   enable row level security;
alter table translation_job_items enable row level security;
alter table image_overrides       enable row level security;
alter table audit_log             enable row level security;
