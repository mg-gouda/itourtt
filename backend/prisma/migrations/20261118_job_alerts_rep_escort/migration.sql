-- Rep escort answer (drives the rep's COMPLETED geofence target)
ALTER TABLE "traffic_assignments" ADD COLUMN "rep_escort" BOOLEAN;
ALTER TABLE "traffic_assignments" ADD COLUMN "rep_escort_at" TIMESTAMP(3);

-- Job alarm acknowledgements (start reminders + drop-off geofence alarms)
CREATE TABLE "job_alert_acks" (
    "id" TEXT NOT NULL,
    "traffic_job_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "shown_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_alert_acks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "job_alert_acks_traffic_job_id_user_id_kind_key" ON "job_alert_acks"("traffic_job_id", "user_id", "kind");
CREATE INDEX "job_alert_acks_user_id_idx" ON "job_alert_acks"("user_id");
ALTER TABLE "job_alert_acks" ADD CONSTRAINT "job_alert_acks_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
