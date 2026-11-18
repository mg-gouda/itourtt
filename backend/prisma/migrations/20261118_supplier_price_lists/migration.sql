-- Supplier price lists (2026-11-18): named lists priced per route × car type
-- replace the zone-based supplier_trip_prices (0 rows in production when dropped).

DROP TABLE IF EXISTS "supplier_trip_prices";

CREATE TABLE "supplier_price_lists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default_for_new" BOOLEAN NOT NULL DEFAULT false,
    "is_own_car_list" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supplier_price_lists_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "supplier_price_lists_name_key" ON "supplier_price_lists"("name");

CREATE TABLE "supplier_price_list_items" (
    "id" TEXT NOT NULL,
    "price_list_id" TEXT NOT NULL,
    "job_service_type_id" TEXT NOT NULL,
    "vehicle_type_id" TEXT NOT NULL,
    "price" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supplier_price_list_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "supplier_price_list_items_price_list_id_job_service_type_id_vehicle_type_id_key"
    ON "supplier_price_list_items"("price_list_id", "job_service_type_id", "vehicle_type_id");
CREATE INDEX "supplier_price_list_items_job_service_type_id_idx" ON "supplier_price_list_items"("job_service_type_id");
ALTER TABLE "supplier_price_list_items" ADD CONSTRAINT "supplier_price_list_items_price_list_id_fkey"
    FOREIGN KEY ("price_list_id") REFERENCES "supplier_price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_price_list_items" ADD CONSTRAINT "supplier_price_list_items_job_service_type_id_fkey"
    FOREIGN KEY ("job_service_type_id") REFERENCES "job_service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_price_list_items" ADD CONSTRAINT "supplier_price_list_items_vehicle_type_id_fkey"
    FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "suppliers" ADD COLUMN "price_list_id" TEXT;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_price_list_id_fkey"
    FOREIGN KEY ("price_list_id") REFERENCES "supplier_price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_costs" ADD COLUMN "source" TEXT;
