-- Customer driver tips are removed (owner, 2026-11-19): their route x car-type amounts become the
-- driver tariffs (what a driver earns per trip), then the tip table goes. Issued DRIVER_TIP
-- invoices are kept as records.
INSERT INTO "driver_tariff_rates" ("id", "job_service_type_id", "vehicle_type_id", "amount", "currency", "created_at", "updated_at")
SELECT gen_random_uuid()::text, t."job_service_type_id", t."vehicle_type_id", t."amount", t."currency", now(), now()
FROM "driver_tip_rates" t
ON CONFLICT ("job_service_type_id", "vehicle_type_id") DO NOTHING;

DROP TABLE "driver_tip_rates";
