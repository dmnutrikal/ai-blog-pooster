-- Structured content support: rich text fields and text lists are now translated
-- (panel/src/lib/translate/structured.ts). Additive only.

alter type translation_content_kind add value if not exists 'rich_text';
alter type translation_content_kind add value if not exists 'list_text';
