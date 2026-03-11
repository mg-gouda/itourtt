-- Migration: Update ServiceType enum
-- Replaces 12 service types with 5: ARR, DEP, DAY_TOUR, ONE_WAY_TRANSFER, TWO_WAY_TRANSFER

-- Step 1: Add new enum values
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'DAY_TOUR';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'ONE_WAY_TRANSFER';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'TWO_WAY_TRANSFER';

-- Step 2: Migrate existing data to new values
-- EXCURSION, CITY_TOUR, OVER_DAY → DAY_TOUR
UPDATE traffic_jobs SET service_type = 'DAY_TOUR' WHERE service_type IN ('EXCURSION', 'CITY_TOUR', 'OVER_DAY');
UPDATE agent_price_items SET service_type = 'DAY_TOUR' WHERE service_type IN ('EXCURSION', 'CITY_TOUR', 'OVER_DAY');
UPDATE public_price_items SET service_type = 'DAY_TOUR' WHERE service_type IN ('EXCURSION', 'CITY_TOUR', 'OVER_DAY');
UPDATE guest_bookings SET service_type = 'DAY_TOUR' WHERE service_type IN ('EXCURSION', 'CITY_TOUR', 'OVER_DAY');
UPDATE supplier_trip_prices SET service_type = 'DAY_TOUR' WHERE service_type IN ('EXCURSION', 'CITY_TOUR', 'OVER_DAY');
UPDATE customer_import_templates SET service_type = 'DAY_TOUR' WHERE service_type IN ('EXCURSION', 'CITY_TOUR', 'OVER_DAY');

-- ONE_WAY_GOING, ONE_WAY_RETURN, TRANSFER, COLLECTING_ONE_WAY → ONE_WAY_TRANSFER
UPDATE traffic_jobs SET service_type = 'ONE_WAY_TRANSFER' WHERE service_type IN ('ONE_WAY_GOING', 'ONE_WAY_RETURN', 'TRANSFER', 'COLLECTING_ONE_WAY');
UPDATE agent_price_items SET service_type = 'ONE_WAY_TRANSFER' WHERE service_type IN ('ONE_WAY_GOING', 'ONE_WAY_RETURN', 'TRANSFER', 'COLLECTING_ONE_WAY');
UPDATE public_price_items SET service_type = 'ONE_WAY_TRANSFER' WHERE service_type IN ('ONE_WAY_GOING', 'ONE_WAY_RETURN', 'TRANSFER', 'COLLECTING_ONE_WAY');
UPDATE guest_bookings SET service_type = 'ONE_WAY_TRANSFER' WHERE service_type IN ('ONE_WAY_GOING', 'ONE_WAY_RETURN', 'TRANSFER', 'COLLECTING_ONE_WAY');
UPDATE supplier_trip_prices SET service_type = 'ONE_WAY_TRANSFER' WHERE service_type IN ('ONE_WAY_GOING', 'ONE_WAY_RETURN', 'TRANSFER', 'COLLECTING_ONE_WAY');
UPDATE customer_import_templates SET service_type = 'ONE_WAY_TRANSFER' WHERE service_type IN ('ONE_WAY_GOING', 'ONE_WAY_RETURN', 'TRANSFER', 'COLLECTING_ONE_WAY');

-- ROUND_TRIP, COLLECTING_ROUND_TRIP, EXPRESS_SHOPPING → TWO_WAY_TRANSFER
UPDATE traffic_jobs SET service_type = 'TWO_WAY_TRANSFER' WHERE service_type IN ('ROUND_TRIP', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING');
UPDATE agent_price_items SET service_type = 'TWO_WAY_TRANSFER' WHERE service_type IN ('ROUND_TRIP', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING');
UPDATE public_price_items SET service_type = 'TWO_WAY_TRANSFER' WHERE service_type IN ('ROUND_TRIP', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING');
UPDATE guest_bookings SET service_type = 'TWO_WAY_TRANSFER' WHERE service_type IN ('ROUND_TRIP', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING');
UPDATE supplier_trip_prices SET service_type = 'TWO_WAY_TRANSFER' WHERE service_type IN ('ROUND_TRIP', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING');
UPDATE customer_import_templates SET service_type = 'TWO_WAY_TRANSFER' WHERE service_type IN ('ROUND_TRIP', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING');

-- Step 3: Rename the enum by recreating it (PostgreSQL doesn't support removing enum values directly)
-- Create new enum type
CREATE TYPE "ServiceType_new" AS ENUM ('ARR', 'DEP', 'DAY_TOUR', 'ONE_WAY_TRANSFER', 'TWO_WAY_TRANSFER');

-- Alter all columns to use text temporarily, then switch to new enum
ALTER TABLE traffic_jobs ALTER COLUMN service_type TYPE text;
ALTER TABLE agent_price_items ALTER COLUMN service_type TYPE text;
ALTER TABLE public_price_items ALTER COLUMN service_type TYPE text;
ALTER TABLE guest_bookings ALTER COLUMN service_type TYPE text;
ALTER TABLE supplier_trip_prices ALTER COLUMN service_type TYPE text;
ALTER TABLE customer_import_templates ALTER COLUMN service_type TYPE text;

-- Drop old enum and rename new one
DROP TYPE "ServiceType";
ALTER TYPE "ServiceType_new" RENAME TO "ServiceType";

-- Convert columns back to enum type
ALTER TABLE traffic_jobs ALTER COLUMN service_type TYPE "ServiceType" USING service_type::"ServiceType";
ALTER TABLE agent_price_items ALTER COLUMN service_type TYPE "ServiceType" USING service_type::"ServiceType";
ALTER TABLE public_price_items ALTER COLUMN service_type TYPE "ServiceType" USING service_type::"ServiceType";
ALTER TABLE guest_bookings ALTER COLUMN service_type TYPE "ServiceType" USING service_type::"ServiceType";
ALTER TABLE supplier_trip_prices ALTER COLUMN service_type TYPE "ServiceType" USING service_type::"ServiceType";
ALTER TABLE customer_import_templates ALTER COLUMN service_type TYPE "ServiceType" USING service_type::"ServiceType";

-- Update default value on supplier_trip_prices if it was 'ARR'
ALTER TABLE supplier_trip_prices ALTER COLUMN service_type SET DEFAULT 'ARR'::"ServiceType";
