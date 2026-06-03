-- Backfill existing jobs' legacy seat extras into traffic_job_extras, then drop the
-- legacy columns. Historical jobs never stored a per-job extra price, so unit_amount
-- is 0 (count/name preserved); currency follows the job's transfer price currency.

INSERT INTO "traffic_job_extras"
  ("traffic_job_id", "name", "qty", "unit_amount", "currency", "source", "updated_at")
SELECT
  "id", 'Booster Seat', "booster_seat_qty", 0,
  "transfer_price_currency",
  (CASE WHEN "booking_channel" = 'B2C' THEN 'B2C' ELSE 'MANUAL' END)::"JobExtraSource",
  CURRENT_TIMESTAMP
FROM "traffic_jobs"
WHERE "booster_seat_qty" > 0;

INSERT INTO "traffic_job_extras"
  ("traffic_job_id", "name", "qty", "unit_amount", "currency", "source", "updated_at")
SELECT
  "id", 'Baby Seat', "baby_seat_qty", 0,
  "transfer_price_currency",
  (CASE WHEN "booking_channel" = 'B2C' THEN 'B2C' ELSE 'MANUAL' END)::"JobExtraSource",
  CURRENT_TIMESTAMP
FROM "traffic_jobs"
WHERE "baby_seat_qty" > 0;

INSERT INTO "traffic_job_extras"
  ("traffic_job_id", "name", "qty", "unit_amount", "currency", "source", "updated_at")
SELECT
  "id", 'Wheelchair', "wheel_chair_qty", 0,
  "transfer_price_currency",
  (CASE WHEN "booking_channel" = 'B2C' THEN 'B2C' ELSE 'MANUAL' END)::"JobExtraSource",
  CURRENT_TIMESTAMP
FROM "traffic_jobs"
WHERE "wheel_chair_qty" > 0;

ALTER TABLE "traffic_jobs"
  DROP COLUMN IF EXISTS "booster_seat",
  DROP COLUMN IF EXISTS "booster_seat_qty",
  DROP COLUMN IF EXISTS "baby_seat",
  DROP COLUMN IF EXISTS "baby_seat_qty",
  DROP COLUMN IF EXISTS "wheel_chair",
  DROP COLUMN IF EXISTS "wheel_chair_qty";
