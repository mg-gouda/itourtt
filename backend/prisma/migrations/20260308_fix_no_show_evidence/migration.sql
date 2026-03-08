-- Fix no_show_evidence table to match Prisma schema
ALTER TABLE "no_show_evidence" DROP COLUMN IF EXISTS "image_url_1";
ALTER TABLE "no_show_evidence" DROP COLUMN IF EXISTS "image_url_2";
ALTER TABLE "no_show_evidence" ADD COLUMN IF NOT EXISTS "image_urls" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "no_show_evidence" ALTER COLUMN "gps_latitude" TYPE DECIMAL(10,7);
ALTER TABLE "no_show_evidence" ALTER COLUMN "gps_longitude" TYPE DECIMAL(10,7);
ALTER TABLE "no_show_evidence" ALTER COLUMN "gps_latitude" SET NOT NULL;
ALTER TABLE "no_show_evidence" ALTER COLUMN "gps_longitude" SET NOT NULL;
ALTER TABLE "no_show_evidence" ALTER COLUMN "gps_map_link" SET NOT NULL;
ALTER TABLE "no_show_evidence" ALTER COLUMN "submitted_by_id" SET NOT NULL;
