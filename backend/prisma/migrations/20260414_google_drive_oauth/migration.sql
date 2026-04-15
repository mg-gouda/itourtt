-- Replace service_account_json with OAuth 2.0 credentials
ALTER TABLE "google_drive_settings" DROP COLUMN IF EXISTS "service_account_json";
ALTER TABLE "google_drive_settings" ADD COLUMN IF NOT EXISTS "oauth_client_id"     TEXT;
ALTER TABLE "google_drive_settings" ADD COLUMN IF NOT EXISTS "oauth_client_secret"  TEXT;
ALTER TABLE "google_drive_settings" ADD COLUMN IF NOT EXISTS "oauth_refresh_token"  TEXT;
