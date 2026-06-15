-- Conversational "AI Mode" booking tab master switch. Default OFF so the tab
-- stays hidden until an admin enables it.
ALTER TABLE "website_settings"
  ADD COLUMN IF NOT EXISTS "enable_ai_mode" BOOLEAN NOT NULL DEFAULT false;
