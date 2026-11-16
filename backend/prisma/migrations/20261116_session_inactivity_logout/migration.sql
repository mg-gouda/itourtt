-- Rep/driver inactivity logout: track real user activity separately from
-- background polling, and record why a session ended.
ALTER TABLE "user_sessions" ADD COLUMN "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "user_sessions" ADD COLUMN "end_reason" TEXT;

-- Existing open sessions: the best evidence of activity we have is lastSeenAt.
UPDATE "user_sessions" SET "last_activity_at" = "last_seen_at";
