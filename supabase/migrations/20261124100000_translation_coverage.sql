-- Aggregated per-locale translation counts for the panel's Преводи page. The raw
-- translations table holds tens of thousands of rows per store, which PostgREST's
-- 1000-row page cannot report on. Additive only.

create or replace function translation_coverage(p_store uuid)
returns table(locale text, status translation_status, cnt bigint)
language sql
stable
as $$
  select t.locale, t.status, count(*)
  from translations t
  join translation_contents c on c.id = t.content_id
  join translation_resources r on r.id = c.resource_id
  where r.store_id = p_store
  group by t.locale, t.status
$$;
