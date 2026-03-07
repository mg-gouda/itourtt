-- =============================================
-- Add all missing tables and columns
-- =============================================

-- ─── MISSING TABLES ─────────────────────────

-- device_tokens
CREATE TABLE IF NOT EXISTS "device_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "device_tokens_user_id_token_key" ON "device_tokens"("user_id", "token");
CREATE INDEX IF NOT EXISTS "device_tokens_user_id_idx" ON "device_tokens"("user_id");
ALTER TABLE "device_tokens" DROP CONSTRAINT IF EXISTS "device_tokens_user_id_fkey";
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- customer_import_templates
CREATE TABLE IF NOT EXISTS "customer_import_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "service_type" "ServiceType" NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "field_mappings" JSONB,
    "sample_data" JSONB,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_import_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "customer_import_templates_customer_id_service_type_key" ON "customer_import_templates"("customer_id", "service_type");
CREATE INDEX IF NOT EXISTS "customer_import_templates_customer_id_idx" ON "customer_import_templates"("customer_id");
ALTER TABLE "customer_import_templates" DROP CONSTRAINT IF EXISTS "customer_import_templates_customer_id_fkey";
ALTER TABLE "customer_import_templates" ADD CONSTRAINT "customer_import_templates_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- job_import_logs
CREATE TABLE IF NOT EXISTS "job_import_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "jobs_extracted" INTEGER NOT NULL,
    "jobs_imported" INTEGER NOT NULL,
    "jobs_rejected" INTEGER NOT NULL,
    "raw_ai_response" JSONB,
    "imported_job_ids" TEXT[] NOT NULL DEFAULT '{}',
    "imported_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_import_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "job_import_logs_customer_id_idx" ON "job_import_logs"("customer_id");
CREATE INDEX IF NOT EXISTS "job_import_logs_imported_by_id_idx" ON "job_import_logs"("imported_by_id");

-- ─── MISSING COLUMNS ON traffic_jobs ────────

ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "customer_job_id" TEXT;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "transfer_price" DECIMAL(15,2);
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "transfer_price_currency" "Currency" NOT NULL DEFAULT 'EGP';
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "requested_vehicle_type_id" UUID;

-- FK for requested_vehicle_type_id
ALTER TABLE "traffic_jobs" DROP CONSTRAINT IF EXISTS "traffic_jobs_requested_vehicle_type_id_fkey";
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_requested_vehicle_type_id_fkey"
  FOREIGN KEY ("requested_vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
