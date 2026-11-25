-- Offline actions that arrived more than 2 h late wait for office approval (6.9.0). Additive.
CREATE TABLE IF NOT EXISTS "offline_action_requests" (
  "id" TEXT NOT NULL,
  "traffic_job_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "image_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "payload" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "decided_by_id" TEXT,
  "decided_at" TIMESTAMP(3),
  "note" TEXT,
  CONSTRAINT "offline_action_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "offline_action_requests_status_received_at_idx" ON "offline_action_requests"("status", "received_at");
CREATE INDEX IF NOT EXISTS "offline_action_requests_traffic_job_id_idx" ON "offline_action_requests"("traffic_job_id");
