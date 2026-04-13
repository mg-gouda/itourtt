-- CreateTable: job_service_types
CREATE TABLE "job_service_types" (
    "id"           TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "name"         TEXT        NOT NULL,
    "from_zone_id" TEXT,
    "to_zone_id"   TEXT,
    "is_active"    BOOLEAN     NOT NULL DEFAULT true,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "job_service_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_service_types_name_key" ON "job_service_types"("name");

ALTER TABLE "job_service_types"
    ADD CONSTRAINT "job_service_types_from_zone_id_fkey"
    FOREIGN KEY ("from_zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "job_service_types"
    ADD CONSTRAINT "job_service_types_to_zone_id_fkey"
    FOREIGN KEY ("to_zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add to driver_price_tariffs
ALTER TABLE "driver_price_tariffs"
    ADD COLUMN IF NOT EXISTS "job_service_type_id" TEXT;

ALTER TABLE "driver_price_tariffs"
    ADD CONSTRAINT "driver_price_tariffs_job_service_type_id_fkey"
    FOREIGN KEY ("job_service_type_id") REFERENCES "job_service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add to traffic_jobs
ALTER TABLE "traffic_jobs"
    ADD COLUMN IF NOT EXISTS "job_service_type_id" TEXT;

ALTER TABLE "traffic_jobs"
    ADD CONSTRAINT "traffic_jobs_job_service_type_id_fkey"
    FOREIGN KEY ("job_service_type_id") REFERENCES "job_service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed (zone references omitted — nullable, configure per-environment via UI)
INSERT INTO "job_service_types" ("id", "name") VALUES
  (gen_random_uuid()::text, 'DEP-MAKADI'),
  (gen_random_uuid()::text, 'ARR-MAKADI'),
  (gen_random_uuid()::text, 'ARR-HRG'),
  (gen_random_uuid()::text, 'DEP-HRG'),
  (gen_random_uuid()::text, 'TRSF-LXR'),
  (gen_random_uuid()::text, 'ARR-SOUTH RMF'),
  (gen_random_uuid()::text, 'DEP-SOUTH RMF'),
  (gen_random_uuid()::text, 'ARR-NORTH RMF'),
  (gen_random_uuid()::text, 'DEP-NORTH RMF'),
  (gen_random_uuid()::text, 'ARR-SAFAGA'),
  (gen_random_uuid()::text, 'DEP-SAFAGA'),
  (gen_random_uuid()::text, 'O/D-CAIRO'),
  (gen_random_uuid()::text, 'O/D-LXR'),
  (gen_random_uuid()::text, 'O/D-CAIRO-(MAKADI-SAHL HASHESSH)'),
  (gen_random_uuid()::text, 'ARR-SAHL HASHEESH'),
  (gen_random_uuid()::text, 'DEP-SAHL HASHEESH'),
  (gen_random_uuid()::text, 'O/D-DANDARAH ABYDOS')
ON CONFLICT (name) DO NOTHING;
