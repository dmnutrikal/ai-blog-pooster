-- Weekly scheduled translation sync, off by default. The panel's Преводи page toggles it;
-- .github/workflows/translate.yml syncs every store that has it on.
-- Additive only, like every migration here.

alter table stores add column if not exists translate_weekly_enabled boolean not null default false;
