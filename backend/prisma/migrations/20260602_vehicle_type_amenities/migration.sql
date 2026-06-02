-- Vehicle-type amenities shown on the B2C public vehicle cards.
CREATE TYPE "Transmission" AS ENUM ('MANUAL', 'AUTOMATIC');

ALTER TABLE "vehicle_types" ADD COLUMN IF NOT EXISTS "wifi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vehicle_types" ADD COLUMN IF NOT EXISTS "air_conditioning" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vehicle_types" ADD COLUMN IF NOT EXISTS "transmission" "Transmission";
ALTER TABLE "vehicle_types" ADD COLUMN IF NOT EXISTS "luggage_capacity" INTEGER;
ALTER TABLE "vehicle_types" ADD COLUMN IF NOT EXISTS "gps_tracked" BOOLEAN NOT NULL DEFAULT false;
