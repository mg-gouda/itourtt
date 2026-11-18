-- Customer prices per route × car type (2026-11-18) replace the zone-based
-- customer_price_items (1 row in production when dropped). Global driver tips.

DROP TABLE IF EXISTS "customer_price_items";

CREATE TABLE "customer_route_prices" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "job_service_type_id" TEXT NOT NULL,
    "vehicle_type_id" TEXT NOT NULL,
    "price" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_route_prices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customer_route_prices_customer_id_job_service_type_id_vehicle_type_id_key"
    ON "customer_route_prices"("customer_id", "job_service_type_id", "vehicle_type_id");
CREATE INDEX "customer_route_prices_job_service_type_id_idx" ON "customer_route_prices"("job_service_type_id");
ALTER TABLE "customer_route_prices" ADD CONSTRAINT "customer_route_prices_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_route_prices" ADD CONSTRAINT "customer_route_prices_job_service_type_id_fkey"
    FOREIGN KEY ("job_service_type_id") REFERENCES "job_service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_route_prices" ADD CONSTRAINT "customer_route_prices_vehicle_type_id_fkey"
    FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "driver_tip_rates" (
    "id" TEXT NOT NULL,
    "job_service_type_id" TEXT NOT NULL,
    "vehicle_type_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "driver_tip_rates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "driver_tip_rates_job_service_type_id_vehicle_type_id_key"
    ON "driver_tip_rates"("job_service_type_id", "vehicle_type_id");
ALTER TABLE "driver_tip_rates" ADD CONSTRAINT "driver_tip_rates_job_service_type_id_fkey"
    FOREIGN KEY ("job_service_type_id") REFERENCES "job_service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "driver_tip_rates" ADD CONSTRAINT "driver_tip_rates_vehicle_type_id_fkey"
    FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A price typed by hand stops the automatic re-pricing. Existing prices were all
-- entered by hand (or by invoicing overrides), so they start as manual.
ALTER TABLE "traffic_jobs" ADD COLUMN "price_manual" BOOLEAN NOT NULL DEFAULT false;
UPDATE "traffic_jobs" SET "price_manual" = true WHERE "price_amount" IS NOT NULL;
