-- Per-locale translations for CMS static pages. English remains the base
-- content on the parent static_pages row; a missing translation row (or null
-- field) falls back to English at read time.

CREATE TABLE IF NOT EXISTS "static_page_translations" (
    "id"               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "static_page_id"   TEXT        NOT NULL,
    "locale"           "Locale"    NOT NULL,
    "title"            TEXT,
    "content"          TEXT,
    "meta_title"       TEXT,
    "meta_description" TEXT,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ NOT NULL,

    CONSTRAINT "static_page_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "static_page_translations_static_page_id_locale_key"
    ON "static_page_translations" ("static_page_id", "locale");

CREATE INDEX IF NOT EXISTS "static_page_translations_static_page_id_locale_idx"
    ON "static_page_translations" ("static_page_id", "locale");

DO $$ BEGIN
  ALTER TABLE "static_page_translations"
    ADD CONSTRAINT "static_page_translations_static_page_id_fkey"
    FOREIGN KEY ("static_page_id") REFERENCES "static_pages"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
