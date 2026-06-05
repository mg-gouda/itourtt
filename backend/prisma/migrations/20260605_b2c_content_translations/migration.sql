-- B2C content i18n: per-locale translations for destination pages, blog posts
-- and per-page SEO. English remains the base content on the parent rows;
-- a missing translation row (or null field) falls back to English at read time.

-- Supported non-English locales (English is never stored as a translation).
DO $$ BEGIN
  CREATE TYPE "Locale" AS ENUM ('ar', 'de', 'fr', 'it', 'nl', 'ru');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── City page (destination) translations ──
CREATE TABLE IF NOT EXISTS "city_page_translations" (
    "id"               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "city_page_id"     TEXT        NOT NULL,
    "locale"           "Locale"    NOT NULL,
    "hero_headline"    TEXT,
    "intro_text"       TEXT,
    "content_html"     TEXT,
    "faq_json"         JSONB,
    "meta_title"       TEXT,
    "meta_description" TEXT,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ NOT NULL,

    CONSTRAINT "city_page_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "city_page_translations_city_page_id_locale_key"
    ON "city_page_translations" ("city_page_id", "locale");
CREATE INDEX IF NOT EXISTS "city_page_translations_city_page_id_locale_idx"
    ON "city_page_translations" ("city_page_id", "locale");

ALTER TABLE "city_page_translations"
    DROP CONSTRAINT IF EXISTS "city_page_translations_city_page_id_fkey";
ALTER TABLE "city_page_translations"
    ADD CONSTRAINT "city_page_translations_city_page_id_fkey"
    FOREIGN KEY ("city_page_id") REFERENCES "city_pages" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Blog post translations ──
CREATE TABLE IF NOT EXISTS "blog_post_translations" (
    "id"               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "blog_post_id"     TEXT        NOT NULL,
    "locale"           "Locale"    NOT NULL,
    "title"            TEXT,
    "excerpt"          TEXT,
    "content_html"     TEXT,
    "meta_title"       TEXT,
    "meta_description" TEXT,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ NOT NULL,

    CONSTRAINT "blog_post_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "blog_post_translations_blog_post_id_locale_key"
    ON "blog_post_translations" ("blog_post_id", "locale");
CREATE INDEX IF NOT EXISTS "blog_post_translations_blog_post_id_locale_idx"
    ON "blog_post_translations" ("blog_post_id", "locale");

ALTER TABLE "blog_post_translations"
    DROP CONSTRAINT IF EXISTS "blog_post_translations_blog_post_id_fkey";
ALTER TABLE "blog_post_translations"
    ADD CONSTRAINT "blog_post_translations_blog_post_id_fkey"
    FOREIGN KEY ("blog_post_id") REFERENCES "blog_posts" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Page SEO translations ──
CREATE TABLE IF NOT EXISTS "page_seo_translations" (
    "id"               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "page_seo_id"      TEXT        NOT NULL,
    "locale"           "Locale"    NOT NULL,
    "meta_title"       TEXT,
    "meta_description" TEXT,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ NOT NULL,

    CONSTRAINT "page_seo_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "page_seo_translations_page_seo_id_locale_key"
    ON "page_seo_translations" ("page_seo_id", "locale");
CREATE INDEX IF NOT EXISTS "page_seo_translations_page_seo_id_locale_idx"
    ON "page_seo_translations" ("page_seo_id", "locale");

ALTER TABLE "page_seo_translations"
    DROP CONSTRAINT IF EXISTS "page_seo_translations_page_seo_id_fkey";
ALTER TABLE "page_seo_translations"
    ADD CONSTRAINT "page_seo_translations_page_seo_id_fkey"
    FOREIGN KEY ("page_seo_id") REFERENCES "page_seo" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
