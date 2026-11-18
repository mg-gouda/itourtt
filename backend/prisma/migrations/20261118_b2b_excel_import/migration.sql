-- B2B Excel import (2026-11-18)

-- Route defaults on job service types
ALTER TABLE "job_service_types" ADD COLUMN "default_service_type" "ServiceType";
ALTER TABLE "job_service_types" ADD COLUMN "from_airport_id" TEXT;
ALTER TABLE "job_service_types" ADD COLUMN "to_airport_id" TEXT;
ALTER TABLE "job_service_types" ADD CONSTRAINT "job_service_types_from_airport_id_fkey" FOREIGN KEY ("from_airport_id") REFERENCES "airports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_service_types" ADD CONSTRAINT "job_service_types_to_airport_id_fkey" FOREIGN KEY ("to_airport_id") REFERENCES "airports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- B2B order numbers (customer_job_id) may repeat
DROP INDEX IF EXISTS "traffic_jobs_customer_job_id_key";
CREATE INDEX IF NOT EXISTS "traffic_jobs_customer_job_id_idx" ON "traffic_jobs"("customer_job_id");

-- Remembered import name aliases
CREATE TABLE "import_name_aliases" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "raw_name" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "import_name_aliases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "import_name_aliases_kind_normalized_name_key" ON "import_name_aliases"("kind", "normalized_name");
