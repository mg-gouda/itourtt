-- Per-device session log for the admin Active-Sessions view + REP/DRIVER single-device lock.
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "session_id" text NOT NULL UNIQUE,
  "device_name" text,
  "ip_address" text,
  "user_agent" text,
  "started_at" timestamp(3) NOT NULL DEFAULT now(),
  "last_seen_at" timestamp(3) NOT NULL DEFAULT now(),
  "ended_at" timestamp(3)
);
CREATE INDEX IF NOT EXISTS "user_sessions_user_id_idx" ON "user_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "user_sessions_user_id_ended_at_idx" ON "user_sessions"("user_id", "ended_at");
