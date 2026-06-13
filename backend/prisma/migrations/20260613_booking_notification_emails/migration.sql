-- Admin-configurable recipients for internal B2C booking notifications.
-- ops_notification_emails: alerts on new / amended / cancelled bookings.
-- finance_notification_emails: alerts when a booking is paid.
-- Both are comma-separated lists; NULL = notifications disabled for that channel.
ALTER TABLE "website_settings"
  ADD COLUMN IF NOT EXISTS "ops_notification_emails"     TEXT,
  ADD COLUMN IF NOT EXISTS "finance_notification_emails" TEXT;
