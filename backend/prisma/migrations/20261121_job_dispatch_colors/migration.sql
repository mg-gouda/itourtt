-- Car Dispatch: row / cell highlight colours on a job (shared by all users)
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "dispatch_colors" JSONB;
