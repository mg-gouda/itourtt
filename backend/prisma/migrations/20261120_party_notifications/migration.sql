-- Rep / driver notifications can point at a complaint (tap opens it)
ALTER TABLE "rep_notifications" ADD COLUMN IF NOT EXISTS "complaint_id" TEXT;
ALTER TABLE "driver_notifications" ADD COLUMN IF NOT EXISTS "complaint_id" TEXT;
