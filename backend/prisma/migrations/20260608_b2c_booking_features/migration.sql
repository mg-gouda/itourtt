-- B2C booking expansion: 2-way (return) transfers, Google Places pickup picker,
-- and city-to-city transfers. All additive; existing flows unaffected.

-- 1. New service type for city-to-city transfers (handled in the excursion bucket).
--    Safe in a transaction on PG12+ as long as the value isn't used in this file.
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'CITY_TO_CITY';

-- 2. Leg type for 2-way (return) bookings — two GuestBookings share a group_ref.
DO $$ BEGIN
  CREATE TYPE "BookingLeg" AS ENUM ('OUTBOUND', 'RETURN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. GuestBooking: precise pickup/dropoff coordinate (from a Places pick) + 2-way grouping.
ALTER TABLE "guest_bookings"
  ADD COLUMN IF NOT EXISTS "pickup_place_id"  TEXT,
  ADD COLUMN IF NOT EXISTS "pickup_lat"       DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "pickup_lng"       DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "pickup_address"   TEXT,
  ADD COLUMN IF NOT EXISTS "dropoff_place_id" TEXT,
  ADD COLUMN IF NOT EXISTS "dropoff_lat"      DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "dropoff_lng"      DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "dropoff_address"  TEXT,
  ADD COLUMN IF NOT EXISTS "group_ref"        TEXT,
  ADD COLUMN IF NOT EXISTS "leg_type"         "BookingLeg";
CREATE INDEX IF NOT EXISTS "guest_bookings_group_ref_idx" ON "guest_bookings"("group_ref");

-- 4. TrafficJob: same precise point + group link for ops visibility.
ALTER TABLE "traffic_jobs"
  ADD COLUMN IF NOT EXISTS "pickup_place_id"  TEXT,
  ADD COLUMN IF NOT EXISTS "pickup_lat"       DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "pickup_lng"       DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "pickup_address"   TEXT,
  ADD COLUMN IF NOT EXISTS "dropoff_place_id" TEXT,
  ADD COLUMN IF NOT EXISTS "dropoff_lat"      DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "dropoff_lng"      DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "dropoff_address"  TEXT,
  ADD COLUMN IF NOT EXISTS "group_ref"        TEXT;

-- 5. Hotels + Zones: flag locations auto-created from a B2C map pick for admin review.
ALTER TABLE "hotels"
  ADD COLUMN IF NOT EXISTS "is_auto_created" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reviewed_at"     TIMESTAMP(3);
ALTER TABLE "zones"
  ADD COLUMN IF NOT EXISTS "is_auto_created" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reviewed_at"     TIMESTAMP(3);

-- 6. WebsiteSettings: booking-widget master switches (default OFF — opt-in per site).
ALTER TABLE "website_settings"
  ADD COLUMN IF NOT EXISTS "enable_two_way_tab"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "enable_city_to_city_tab" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "enable_map_selector"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "booking_tabs_order"      TEXT NOT NULL DEFAULT 'ARR,DEP';
