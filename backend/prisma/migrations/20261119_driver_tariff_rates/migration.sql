-- Driver tariffs become a route x car-type table (like driver_tip_rates).
-- driver_price_tariffs never had a row; no fee references it.
ALTER TABLE "driver_trip_fees" DROP CONSTRAINT IF EXISTS "driver_trip_fees_tariff_id_fkey";
ALTER TABLE "driver_trip_fees" DROP COLUMN IF EXISTS "tariff_id";
DROP TABLE IF EXISTS "driver_price_tariffs";

CREATE TABLE "driver_tariff_rates" (
    "id" TEXT NOT NULL,
    "job_service_type_id" TEXT NOT NULL,
    "vehicle_type_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "driver_tariff_rates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "driver_tariff_rates_job_service_type_id_vehicle_type_id_key" ON "driver_tariff_rates"("job_service_type_id", "vehicle_type_id");
ALTER TABLE "driver_tariff_rates" ADD CONSTRAINT "driver_tariff_rates_job_service_type_id_fkey" FOREIGN KEY ("job_service_type_id") REFERENCES "job_service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "driver_tariff_rates" ADD CONSTRAINT "driver_tariff_rates_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
