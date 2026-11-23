-- NOT A MIGRATION. Never run this against the live project.
--
-- The blog pipeline's tables were created by hand in the Supabase dashboard; there is no migration
-- for them. This file reconstructs their columns from the live PostgREST schema (read on 2026-11-20)
-- so tests can apply supabase/migrations/ on top of a database shaped like production.
-- Defaults, indexes and the match_products / match_articles functions are not reproduced.
-- To capture the exact schema: `supabase db dump --schema public` with the project linked.

create extension if not exists vector;

create table if not exists topics (
  id              bigserial primary key,
  store           text not null,
  keyword         text not null,
  angle           text,
  status          text not null default 'pending',
  priority        integer not null default 0,
  attempts        integer not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  published_at    timestamptz,
  fixed_title_bg  text,
  fixed_title_en  text,
  intent          text,
  pillar          text,
  day             integer
);

create table if not exists products (
  id                   bigserial primary key,
  store                text not null,
  shopify_gid          text not null,
  handle               text not null,
  title                text not null,
  description          text,
  product_type         text,
  tags                 text[],
  url                  text,
  embedding            vector(1536),
  synced_at            timestamptz not null default now(),
  title_bg             text,
  meta_title_bg        text,
  meta_description_bg  text
);

create table if not exists articles (
  id                bigserial primary key,
  store             text not null,
  topic_id          bigint references topics(id),
  shopify_gid       text,
  handle            text,
  title_bg          text,
  title_en          text,
  summary_bg        text,
  image_url         text,
  linked_products   text[],
  compliance_flags  jsonb not null default '[]',
  cost_usd          numeric,
  status            text not null,
  embedding         vector(1536),
  created_at        timestamptz not null default now(),
  published_at      timestamptz,
  url               text
);
