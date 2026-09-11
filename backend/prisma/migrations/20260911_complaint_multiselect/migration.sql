-- A complaint is rarely one thing, and rarely one party's fault: it now carries
-- a set of categories and a set of responsible parties.
--
-- The single-valued columns stay and keep their meaning — `category_id` and
-- `responsible_party` are the *primary* entries, and everything downstream
-- (scoring, SLA notifications, charges, analytics, the exports) still reads
-- them, so no existing behaviour moves. The new set is written alongside and
-- backfilled from what each row already said.

-- ── The categories a complaint carries ──
CREATE TABLE IF NOT EXISTS "complaint_category_links" (
    "complaint_id" TEXT        NOT NULL,
    "category_id"  TEXT        NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_category_links_pkey" PRIMARY KEY ("complaint_id", "category_id")
);

CREATE INDEX IF NOT EXISTS "complaint_category_links_category_id_idx"
    ON "complaint_category_links" ("category_id");

ALTER TABLE "complaint_category_links"
    DROP CONSTRAINT IF EXISTS "complaint_category_links_complaint_id_fkey";
ALTER TABLE "complaint_category_links"
    ADD CONSTRAINT "complaint_category_links_complaint_id_fkey"
    FOREIGN KEY ("complaint_id") REFERENCES "complaints" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "complaint_category_links"
    DROP CONSTRAINT IF EXISTS "complaint_category_links_category_id_fkey";
ALTER TABLE "complaint_category_links"
    ADD CONSTRAINT "complaint_category_links_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "complaint_categories" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing complaint keeps the one category it was logged with,
-- so a filter on the link table never misses history.
INSERT INTO "complaint_category_links" ("complaint_id", "category_id", "created_at")
SELECT "id", "category_id", "created_at" FROM "complaints"
ON CONFLICT DO NOTHING;

-- ── The parties a complaint blames ──
ALTER TABLE "complaints"
    ADD COLUMN IF NOT EXISTS "responsible_parties" "ComplaintParty"[] NOT NULL DEFAULT '{}';

-- Backfill: whoever the row already blamed becomes the single-entry set.
UPDATE "complaints"
   SET "responsible_parties" = ARRAY["responsible_party"]
 WHERE "responsible_party" IS NOT NULL
   AND COALESCE(array_length("responsible_parties", 1), 0) = 0;

-- A complaint used to be allowed only one responsible person; it may now name a
-- driver, a rep and a supplier at once (each resolved from the job's
-- assignment), so nothing here constrains them against each other.
