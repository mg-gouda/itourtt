-- Add missing columns to traffic_jobs that exist in Prisma schema but not in DB
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "customer_job_id" TEXT;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "transfer_price" DECIMAL(15,2);
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "transfer_price_currency" "Currency" NOT NULL DEFAULT 'EGP';
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "requested_vehicle_type_id" UUID;

-- Add foreign key for requested_vehicle_type_id
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_requested_vehicle_type_id_fkey"
  FOREIGN KEY ("requested_vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
