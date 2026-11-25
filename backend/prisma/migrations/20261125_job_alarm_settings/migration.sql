-- Company > Alerts (6.5.0): configurable job start alarms (additive).
CREATE TABLE IF NOT EXISTS "job_alarm_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "alarm_minutes" INTEGER[] NOT NULL DEFAULT ARRAY[90, 60, 30]::INTEGER[],
  "missed_after_minutes" INTEGER NOT NULL DEFAULT 5,
  "warn_before_minutes" INTEGER NOT NULL DEFAULT 45,
  "recipient_role_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "recipient_user_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sound_url" TEXT,
  "sound_name" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id" TEXT,
  CONSTRAINT "job_alarm_settings_pkey" PRIMARY KEY ("id")
);
INSERT INTO "job_alarm_settings" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;
