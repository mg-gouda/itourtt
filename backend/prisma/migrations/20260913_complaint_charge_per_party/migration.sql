-- A complaint blames several people at once, so it must be able to deduct from
-- several people at once: one charge per party, not one charge per complaint.
--
-- Nothing about an individual charge changes — it is still raised, approved and
-- posted as three separate acts, and only posting writes a negative fee row.
-- What goes is the one-per-complaint constraint, and what arrives is the reason
-- the deduction was made, typed on the dispatch grid or on the complaint itself.

-- ── Several charges per complaint ──
ALTER TABLE "complaint_charges"
    DROP CONSTRAINT IF EXISTS "complaint_charges_complaint_id_key";
DROP INDEX IF EXISTS "complaint_charges_complaint_id_key";

CREATE INDEX IF NOT EXISTS "complaint_charges_complaint_id_idx"
    ON "complaint_charges" ("complaint_id");

-- ── Why the money is being taken ──
ALTER TABLE "complaint_charges"
    ADD COLUMN IF NOT EXISTS "reason" TEXT;
