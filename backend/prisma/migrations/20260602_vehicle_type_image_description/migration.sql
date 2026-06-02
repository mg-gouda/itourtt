-- Add public-site display fields to vehicle_types
-- (image shown to customers + short description) used by the B2C booking site.
ALTER TABLE "vehicle_types" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
ALTER TABLE "vehicle_types" ADD COLUMN IF NOT EXISTS "description" TEXT;
