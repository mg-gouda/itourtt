-- CMS-managed static content pages for the B2C site (Terms, Privacy, About …).
-- The B2C site fetches a published page by slug via GET /public/pages/:slug.

CREATE TABLE IF NOT EXISTS "static_pages" (
    "id"               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "slug"             TEXT        NOT NULL,
    "title"            TEXT        NOT NULL,
    "content"          TEXT        NOT NULL DEFAULT '',
    "is_published"     BOOLEAN     NOT NULL DEFAULT false,
    "show_in_nav"      BOOLEAN     NOT NULL DEFAULT false,
    "show_in_footer"   BOOLEAN     NOT NULL DEFAULT false,
    "menu_order"       INTEGER     NOT NULL DEFAULT 0,
    "meta_title"       TEXT,
    "meta_description" TEXT,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ NOT NULL,

    CONSTRAINT "static_pages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "static_pages_slug_key" ON "static_pages" ("slug");

-- Seed the three initial pages as drafts (idempotent).
INSERT INTO "static_pages" ("id", "slug", "title", "content", "is_published", "updated_at")
VALUES
  (gen_random_uuid()::text, 'terms-and-conditions', 'Terms & Conditions', '', false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'privacy-policy',        'Privacy Policy',     '', false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'about-us',              'About Us',           '', false, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
