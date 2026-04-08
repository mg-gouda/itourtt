-- AlterTable: add dispute notification fields to email_settings
ALTER TABLE "email_settings"
  ADD COLUMN IF NOT EXISTS "dispute_to"      TEXT,
  ADD COLUMN IF NOT EXISTS "dispute_cc1"     TEXT,
  ADD COLUMN IF NOT EXISTS "dispute_cc2"     TEXT,
  ADD COLUMN IF NOT EXISTS "dispute_cc3"     TEXT,
  ADD COLUMN IF NOT EXISTS "dispute_subject" TEXT,
  ADD COLUMN IF NOT EXISTS "dispute_body"    TEXT;
