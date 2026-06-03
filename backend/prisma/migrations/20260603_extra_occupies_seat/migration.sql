-- Whether a catalog extra occupies a physical seat (counts against vehicle capacity).
ALTER TABLE "b2c_extras"
  ADD COLUMN IF NOT EXISTS "occupies_seat" BOOLEAN NOT NULL DEFAULT false;

-- The former hard-coded seat extras occupy a seat by definition.
UPDATE "b2c_extras"
SET "occupies_seat" = true
WHERE "name" IN ('Booster Seat', 'Baby Seat', 'Wheelchair');
