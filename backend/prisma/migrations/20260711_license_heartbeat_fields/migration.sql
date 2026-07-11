-- License heartbeat fields on company_settings (MG license-server integration).
-- install_id: stable per-deployment id used for online license heartbeat.
-- license_last_check: timestamp of the last successful online license verification.
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "install_id" TEXT;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "license_last_check" TIMESTAMP(3);
