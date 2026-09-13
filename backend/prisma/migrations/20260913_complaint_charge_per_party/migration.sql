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

-- ── A deduction belongs to the job, not to the complaint ──
--
-- The dispatch grid raises deductions before anyone has written the complaint
-- up, so the job is the anchor and the complaint is optional: a charge is
-- adopted by the complaint that is logged against the same job later on.
ALTER TABLE "complaint_charges"
    ADD COLUMN IF NOT EXISTS "traffic_job_id" TEXT;

-- Backfill: every existing charge already belongs to a complaint, and every
-- complaint names its job.
UPDATE "complaint_charges" c
   SET "traffic_job_id" = k."traffic_job_id"
  FROM "complaints" k
 WHERE c."complaint_id" = k."id"
   AND c."traffic_job_id" IS NULL;

ALTER TABLE "complaint_charges"
    ALTER COLUMN "traffic_job_id" SET NOT NULL;

ALTER TABLE "complaint_charges"
    ALTER COLUMN "complaint_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "complaint_charges_traffic_job_id_idx"
    ON "complaint_charges" ("traffic_job_id");

ALTER TABLE "complaint_charges"
    DROP CONSTRAINT IF EXISTS "complaint_charges_traffic_job_id_fkey";
ALTER TABLE "complaint_charges"
    ADD CONSTRAINT "complaint_charges_traffic_job_id_fkey"
    FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
