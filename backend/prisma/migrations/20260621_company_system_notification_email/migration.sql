-- Single mailbox that receives all automated system notifications (e.g. job updates).
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "system_notification_email" TEXT;
