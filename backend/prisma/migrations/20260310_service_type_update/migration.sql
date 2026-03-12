-- Migration: Update ServiceType enum
-- Replaces 12 service types with 5: ARR, DEP, DAY_TOUR, ONE_WAY_TRANSFER, TWO_WAY_TRANSFER
--
-- NOTE: PostgreSQL cannot use newly added enum values in the same transaction.
-- So we convert columns to TEXT first, then swap the enum, then convert back.

-- Step 1: Convert all columns to TEXT (avoids enum dependency issues)
ALTER TABLE traffic_jobs ALTER COLUMN service_type TYPE text;
ALTER TABLE agent_price_items ALTER COLUMN service_type DROP DEFAULT;
ALTER TABLE agent_price_items ALTER COLUMN service_type TYPE text;
ALTER TABLE public_price_items ALTER COLUMN service_type DROP DEFAULT;
ALTER TABLE public_price_items ALTER COLUMN service_type TYPE text;
ALTER TABLE guest_bookings ALTER COLUMN service_type TYPE text;
ALTER TABLE supplier_trip_prices ALTER COLUMN service_type DROP DEFAULT;
ALTER TABLE supplier_trip_prices ALTER COLUMN service_type TYPE text;
ALTER TABLE customer_import_templates ALTER COLUMN service_type TYPE text;
ALTER TABLE customer_price_items ALTER COLUMN service_type DROP DEFAULT;
ALTER TABLE customer_price_items ALTER COLUMN service_type TYPE text;

-- Step 2: Migrate existing data to new values (now TEXT, no enum constraint)
-- EXCURSION, CITY_TOUR, OVER_DAY → DAY_TOUR
UPDATE traffic_jobs SET service_type = 'DAY_TOUR' WHERE service_type IN ('EXCURSION', 'CITY_TOUR', 'OVER_DAY');
UPDATE agent_price_items SET service_type = 'DAY_TOUR' WHERE service_type IN ('EXCURSION', 'CITY_TOUR', 'OVER_DAY');
UPDATE public_price_items SET service_type = 'DAY_TOUR' WHERE service_type IN ('EXCURSION', 'CITY_TOUR', 'OVER_DAY');
UPDATE guest_bookings SET service_type = 'DAY_TOUR' WHERE service_type IN ('EXCURSION', 'CITY_TOUR', 'OVER_DAY');
UPDATE supplier_trip_prices SET service_type = 'DAY_TOUR' WHERE service_type IN ('EXCURSION', 'CITY_TOUR', 'OVER_DAY');
UPDATE customer_import_templates SET service_type = 'DAY_TOUR' WHERE service_type IN ('EXCURSION', 'CITY_TOUR', 'OVER_DAY');
UPDATE customer_price_items SET service_type = 'DAY_TOUR' WHERE service_type IN ('EXCURSION', 'CITY_TOUR', 'OVER_DAY');

-- ONE_WAY_GOING, ONE_WAY_RETURN, TRANSFER, COLLECTING_ONE_WAY → ONE_WAY_TRANSFER
UPDATE traffic_jobs SET service_type = 'ONE_WAY_TRANSFER' WHERE service_type IN ('ONE_WAY_GOING', 'ONE_WAY_RETURN', 'TRANSFER', 'COLLECTING_ONE_WAY');
UPDATE agent_price_items SET service_type = 'ONE_WAY_TRANSFER' WHERE service_type IN ('ONE_WAY_GOING', 'ONE_WAY_RETURN', 'TRANSFER', 'COLLECTING_ONE_WAY');
UPDATE public_price_items SET service_type = 'ONE_WAY_TRANSFER' WHERE service_type IN ('ONE_WAY_GOING', 'ONE_WAY_RETURN', 'TRANSFER', 'COLLECTING_ONE_WAY');
UPDATE guest_bookings SET service_type = 'ONE_WAY_TRANSFER' WHERE service_type IN ('ONE_WAY_GOING', 'ONE_WAY_RETURN', 'TRANSFER', 'COLLECTING_ONE_WAY');
UPDATE supplier_trip_prices SET service_type = 'ONE_WAY_TRANSFER' WHERE service_type IN ('ONE_WAY_GOING', 'ONE_WAY_RETURN', 'TRANSFER', 'COLLECTING_ONE_WAY');
UPDATE customer_import_templates SET service_type = 'ONE_WAY_TRANSFER' WHERE service_type IN ('ONE_WAY_GOING', 'ONE_WAY_RETURN', 'TRANSFER', 'COLLECTING_ONE_WAY');
UPDATE customer_price_items SET service_type = 'ONE_WAY_TRANSFER' WHERE service_type IN ('ONE_WAY_GOING', 'ONE_WAY_RETURN', 'TRANSFER', 'COLLECTING_ONE_WAY');

-- ROUND_TRIP, COLLECTING_ROUND_TRIP, EXPRESS_SHOPPING → TWO_WAY_TRANSFER
UPDATE traffic_jobs SET service_type = 'TWO_WAY_TRANSFER' WHERE service_type IN ('ROUND_TRIP', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING');
UPDATE agent_price_items SET service_type = 'TWO_WAY_TRANSFER' WHERE service_type IN ('ROUND_TRIP', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING');
UPDATE public_price_items SET service_type = 'TWO_WAY_TRANSFER' WHERE service_type IN ('ROUND_TRIP', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING');
UPDATE guest_bookings SET service_type = 'TWO_WAY_TRANSFER' WHERE service_type IN ('ROUND_TRIP', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING');
UPDATE supplier_trip_prices SET service_type = 'TWO_WAY_TRANSFER' WHERE service_type IN ('ROUND_TRIP', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING');
UPDATE customer_import_templates SET service_type = 'TWO_WAY_TRANSFER' WHERE service_type IN ('ROUND_TRIP', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING');
UPDATE customer_price_items SET service_type = 'TWO_WAY_TRANSFER' WHERE service_type IN ('ROUND_TRIP', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING');

-- Step 3: Drop old enum and create new one (safe because no columns depend on it)
DROP TYPE "ServiceType";
CREATE TYPE "ServiceType" AS ENUM ('ARR', 'DEP', 'DAY_TOUR', 'ONE_WAY_TRANSFER', 'TWO_WAY_TRANSFER');

-- Step 4: Convert columns back to the new enum type
ALTER TABLE traffic_jobs ALTER COLUMN service_type TYPE "ServiceType" USING service_type::"ServiceType";
ALTER TABLE agent_price_items ALTER COLUMN service_type TYPE "ServiceType" USING service_type::"ServiceType";
ALTER TABLE public_price_items ALTER COLUMN service_type TYPE "ServiceType" USING service_type::"ServiceType";
ALTER TABLE guest_bookings ALTER COLUMN service_type TYPE "ServiceType" USING service_type::"ServiceType";
ALTER TABLE supplier_trip_prices ALTER COLUMN service_type TYPE "ServiceType" USING service_type::"ServiceType";
ALTER TABLE customer_import_templates ALTER COLUMN service_type TYPE "ServiceType" USING service_type::"ServiceType";
ALTER TABLE customer_price_items ALTER COLUMN service_type TYPE "ServiceType" USING service_type::"ServiceType";

-- Restore default
ALTER TABLE supplier_trip_prices ALTER COLUMN service_type SET DEFAULT 'ARR'::"ServiceType";
