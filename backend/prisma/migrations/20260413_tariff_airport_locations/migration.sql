-- Make zone FKs nullable so a tariff can start/end at an airport
ALTER TABLE "driver_price_tariffs" ALTER COLUMN "from_zone_id" DROP NOT NULL;
ALTER TABLE "driver_price_tariffs" ALTER COLUMN "to_zone_id"   DROP NOT NULL;

-- Add airport endpoint columns
ALTER TABLE "driver_price_tariffs"
  ADD COLUMN IF NOT EXISTS "from_airport_id" TEXT,
  ADD COLUMN IF NOT EXISTS "to_airport_id"   TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_price_tariffs_from_airport_id_fkey') THEN
    ALTER TABLE "driver_price_tariffs"
      ADD CONSTRAINT "driver_price_tariffs_from_airport_id_fkey"
      FOREIGN KEY ("from_airport_id") REFERENCES "airports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_price_tariffs_to_airport_id_fkey') THEN
    ALTER TABLE "driver_price_tariffs"
      ADD CONSTRAINT "driver_price_tariffs_to_airport_id_fkey"
      FOREIGN KEY ("to_airport_id") REFERENCES "airports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Drop old zone-only unique index
DROP INDEX IF EXISTS "driver_price_tariffs_from_to_vt_key";

-- Partial unique indexes covering all four location-type combinations
CREATE UNIQUE INDEX IF NOT EXISTS "tariff_zone_zone_vt_key"
  ON "driver_price_tariffs"("from_zone_id", "to_zone_id", "vehicle_type_id")
  WHERE "from_airport_id" IS NULL AND "to_airport_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "tariff_airport_zone_vt_key"
  ON "driver_price_tariffs"("from_airport_id", "to_zone_id", "vehicle_type_id")
  WHERE "from_zone_id" IS NULL AND "to_airport_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "tariff_zone_airport_vt_key"
  ON "driver_price_tariffs"("from_zone_id", "to_airport_id", "vehicle_type_id")
  WHERE "from_airport_id" IS NULL AND "to_zone_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "tariff_airport_airport_vt_key"
  ON "driver_price_tariffs"("from_airport_id", "to_airport_id", "vehicle_type_id")
  WHERE "from_zone_id" IS NULL AND "to_zone_id" IS NULL;
