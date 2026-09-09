-- The won/lost outcome, recorded on the complaint itself so the amounts section
-- of the complaint form is only reached once a loss is actually conceded.
-- Existing rows are backfilled from their terminal status, so history keeps the
-- outcome it was already settled with.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ComplaintOutcome" AS ENUM ('WON', 'LOST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "outcome" "ComplaintOutcome";

-- Backfill: a settled complaint already knows how it went.
UPDATE "complaints"
   SET "outcome" = CASE
                     WHEN "status" = 'WON' THEN 'WON'::"ComplaintOutcome"
                     ELSE 'LOST'::"ComplaintOutcome"
                   END
 WHERE "outcome" IS NULL
   AND "status" IN ('WON', 'LOST', 'PARTIALLY_LOST');
