-- 3-step job alarms: office alert types + once-only escalation log.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ON_THE_WAY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ALARM_MISSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ALARM_WARN_45';

CREATE TABLE "job_alert_escalations" (
  "id" TEXT NOT NULL,
  "traffic_job_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "job_alert_escalations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "job_alert_escalations_traffic_job_id_user_id_kind_key"
  ON "job_alert_escalations"("traffic_job_id", "user_id", "kind");
