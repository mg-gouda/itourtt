-- Make fromZoneId / toZoneId nullable on driver_trip_fees
-- Add fromAirportId / toAirportId for airport-based routes

ALTER TABLE "driver_trip_fees"
  ALTER COLUMN "from_zone_id" DROP NOT NULL,
  ALTER COLUMN "to_zone_id"   DROP NOT NULL;

ALTER TABLE "driver_trip_fees"
  ADD COLUMN IF NOT EXISTS "from_airport_id" TEXT REFERENCES "airports"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "to_airport_id"   TEXT REFERENCES "airports"("id") ON DELETE SET NULL;
