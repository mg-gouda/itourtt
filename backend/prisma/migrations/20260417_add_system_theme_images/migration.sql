-- Add theme image and sidebar color fields to system_settings
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "sidebar_color" VARCHAR(7) NOT NULL DEFAULT '#41004c';
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "inner_bg_image_url" TEXT;
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "login_bg_image_url" TEXT;
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "login_logo_url" TEXT;
