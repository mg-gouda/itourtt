-- Add supplier type (COMPANY/INDIVIDUAL) and individual fields
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "supplier_type" TEXT DEFAULT 'COMPANY';
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "mobile_number" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "national_id_image" TEXT;
