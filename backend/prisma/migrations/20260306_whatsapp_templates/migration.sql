-- Create enum
CREATE TYPE "WaTriggerType" AS ENUM ('JOB_CREATED', 'DRIVER_ASSIGNED', 'SCHEDULED');

-- Create whatsapp_templates table
CREATE TABLE "whatsapp_templates" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "trigger_type" "WaTriggerType" NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT false,
  "template_body" TEXT NOT NULL,
  "days_before" INTEGER,
  "send_hour" INTEGER,
  "send_minute" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

-- Seed 3 default templates
INSERT INTO "whatsapp_templates" ("name", "trigger_type", "template_body", "is_enabled", "days_before", "send_hour", "send_minute")
VALUES
  ('Booking Confirmation', 'JOB_CREATED', 'Hello {{clientName}}, your transfer has been confirmed!
Date: {{serviceDate}}
From: {{origin}} to {{destination}}
Pax: {{paxCount}}
Ref: {{internalRef}}
Thank you for choosing iTourTT.', false, NULL, NULL, NULL),
  ('Day-Before Reminder', 'SCHEDULED', 'Hello {{clientName}}, reminder for your transfer tomorrow!
Date: {{serviceDate}} at {{pickupTime}}
From: {{origin}} to {{destination}}
Driver: {{driverName}} ({{driverNumber}})
Rep: {{repName}} ({{repNumber}})
Ref: {{internalRef}}
See you tomorrow!', false, 1, 9, 0),
  ('Driver Assigned', 'DRIVER_ASSIGNED', 'Hello {{clientName}}, your driver has been assigned!
Driver: {{driverName}}
Contact: {{driverNumber}}
Date: {{serviceDate}} at {{pickupTime}}
Ref: {{internalRef}}', false, NULL, NULL, NULL);

-- Add templateId and templateName to logs
ALTER TABLE "whatsapp_notification_logs"
  ADD COLUMN IF NOT EXISTS "template_id" TEXT,
  ADD COLUMN IF NOT EXISTS "template_name" TEXT;

-- Drop old unique constraint
ALTER TABLE "whatsapp_notification_logs" DROP CONSTRAINT IF EXISTS "whatsapp_notification_logs_traffic_job_id_recipient_phone_key";

-- Add new 3-field unique (NULLS NOT DISTINCT treats NULLs as equal for uniqueness)
ALTER TABLE "whatsapp_notification_logs" ADD CONSTRAINT "whatsapp_notification_logs_job_phone_template_key"
  UNIQUE NULLS NOT DISTINCT ("traffic_job_id", "recipient_phone", "template_id");

-- Add foreign key
ALTER TABLE "whatsapp_notification_logs" ADD CONSTRAINT "whatsapp_notification_logs_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "whatsapp_templates"("id") ON DELETE SET NULL;
