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

-- Seed
INSERT INTO "job_service_types" ("id", "name", "from_zone_id", "to_zone_id") VALUES
  (gen_random_uuid()::text, 'DEP-MAKADI',                    'cmmb5x655000f01ls35r65woj',            '960a56fb-5af7-4d33-afee-085f10d01a60'),
  (gen_random_uuid()::text, 'ARR-MAKADI',                    '960a56fb-5af7-4d33-afee-085f10d01a60', 'cmmb5x655000f01ls35r65woj'),
  (gen_random_uuid()::text, 'ARR-HRG',                       '960a56fb-5af7-4d33-afee-085f10d01a60', 'cmmb5x650000e01ls28e1ze30'),
  (gen_random_uuid()::text, 'DEP-HRG',                       'cmmb5x650000e01ls28e1ze30',            '960a56fb-5af7-4d33-afee-085f10d01a60'),
  (gen_random_uuid()::text, 'TRSF-LXR',                      NULL,                                    NULL),
  (gen_random_uuid()::text, 'ARR-SOUTH RMF',                 NULL,                                    'cmmb5x66q000p01lsjqlglq6q'),
  (gen_random_uuid()::text, 'DEP-SOUTH RMF',                 'cmmb5x66q000p01lsjqlglq6q',            NULL),
  (gen_random_uuid()::text, 'ARR-NORTH RMF',                 NULL,                                    'cmmb5x66f000n01ls74sxd394'),
  (gen_random_uuid()::text, 'DEP-NORTH RMF',                 'cmmb5x66f000n01ls74sxd394',            NULL),
  (gen_random_uuid()::text, 'ARR-SAFAGA',                    '960a56fb-5af7-4d33-afee-085f10d01a60', 'cmmb5x65b000g01lsyhup2xmh'),
  (gen_random_uuid()::text, 'DEP-SAFAGA',                    'cmmb5x65b000g01lsyhup2xmh',            '960a56fb-5af7-4d33-afee-085f10d01a60'),
  (gen_random_uuid()::text, 'O/D-CAIRO',                     NULL,                                    NULL),
  (gen_random_uuid()::text, 'O/D-LXR',                       NULL,                                    NULL),
  (gen_random_uuid()::text, 'O/D-CAIRO-(MAKADI-SAHL HASHESSH)', NULL,                                NULL),
  (gen_random_uuid()::text, 'ARR-SAHL HASHEESH',             '960a56fb-5af7-4d33-afee-085f10d01a60', 'cmmb5x65g000h01lsryezzasd'),
  (gen_random_uuid()::text, 'DEP-SAHL HASHEESH',             'cmmb5x65g000h01lsryezzasd',            '960a56fb-5af7-4d33-afee-085f10d01a60'),
  (gen_random_uuid()::text, 'O/D-DANDARAH ABYDOS',           NULL,                                    NULL)
ON CONFLICT (name) DO NOTHING;
