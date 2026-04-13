-- CreateTable: driver_price_tariffs
CREATE TABLE "driver_price_tariffs" (
    "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
    "from_zone_id"   TEXT         NOT NULL,
    "to_zone_id"     TEXT         NOT NULL,
    "vehicle_type_id" TEXT        NOT NULL,
    "amount"         DECIMAL(15,2) NOT NULL,
    "currency"       TEXT         NOT NULL DEFAULT 'EGP',
    "notes"          TEXT,
    "is_active"      BOOLEAN      NOT NULL DEFAULT true,
    "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "driver_price_tariffs_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one tariff per fromZone + toZone + vehicleType
CREATE UNIQUE INDEX "driver_price_tariffs_from_to_vt_key"
    ON "driver_price_tariffs"("from_zone_id", "to_zone_id", "vehicle_type_id");

CREATE INDEX "driver_price_tariffs_from_to_idx"
    ON "driver_price_tariffs"("from_zone_id", "to_zone_id");

-- FK constraints
ALTER TABLE "driver_price_tariffs"
    ADD CONSTRAINT "driver_price_tariffs_from_zone_id_fkey"
    FOREIGN KEY ("from_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driver_price_tariffs"
    ADD CONSTRAINT "driver_price_tariffs_to_zone_id_fkey"
    FOREIGN KEY ("to_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driver_price_tariffs"
    ADD CONSTRAINT "driver_price_tariffs_vehicle_type_id_fkey"
    FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: add vehicle_type_id and tariff_id to driver_trip_fees
ALTER TABLE "driver_trip_fees"
    ADD COLUMN IF NOT EXISTS "vehicle_type_id" TEXT,
    ADD COLUMN IF NOT EXISTS "tariff_id"       TEXT;

ALTER TABLE "driver_trip_fees"
    DROP CONSTRAINT IF EXISTS "driver_trip_fees_vehicle_type_id_fkey";
ALTER TABLE "driver_trip_fees"
    ADD CONSTRAINT "driver_trip_fees_vehicle_type_id_fkey"
    FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "driver_trip_fees"
    DROP CONSTRAINT IF EXISTS "driver_trip_fees_tariff_id_fkey";
ALTER TABLE "driver_trip_fees"
    ADD CONSTRAINT "driver_trip_fees_tariff_id_fkey"
    FOREIGN KEY ("tariff_id") REFERENCES "driver_price_tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
