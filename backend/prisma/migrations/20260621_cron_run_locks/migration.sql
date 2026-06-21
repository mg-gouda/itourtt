-- Claimed once per (job, day) so only one backend replica runs a nightly cron.
CREATE TABLE IF NOT EXISTS "cron_run_locks" (
    "id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "run_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cron_run_locks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cron_run_locks_job_name_run_date_key" ON "cron_run_locks"("job_name", "run_date");
