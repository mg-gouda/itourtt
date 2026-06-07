-- Master on/off switches for B2C checkout payment methods. Default ON so the
-- existing cash-on-arrival flow keeps working; online becomes selectable once
-- the B2C site is updated.
ALTER TABLE "website_settings"
  ADD COLUMN IF NOT EXISTS "online_payment_enabled"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "cash_on_arrival_enabled" BOOLEAN NOT NULL DEFAULT true;
