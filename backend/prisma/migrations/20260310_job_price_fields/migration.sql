-- Add job price fields to traffic_jobs
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "price_amount" DECIMAL(15,2);
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "price_currency" TEXT DEFAULT 'EGP';
