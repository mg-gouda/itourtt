-- One sound per job alarm (6.8.0), additive.
ALTER TABLE "job_alarm_settings" ADD COLUMN IF NOT EXISTS "alarm_sound_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "job_alarm_settings" ADD COLUMN IF NOT EXISTS "alarm_sound_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
