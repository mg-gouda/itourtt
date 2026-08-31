-- Activity Log: record the traffic job an action touched, plus its internal
-- reference, so the log can display and be searched by Job ID.
ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "job_id" TEXT;
ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "job_ref" TEXT;

CREATE INDEX IF NOT EXISTS "activity_logs_job_ref_idx" ON "activity_logs"("job_ref");

-- ── Backfill ────────────────────────────────────────────────────────────────
-- 1. Logs whose record id is already the traffic job (/traffic-jobs/:id/...)
UPDATE "activity_logs" al
SET "job_id" = tj."id", "job_ref" = tj."internal_ref"
FROM "traffic_jobs" tj
WHERE al."job_id" IS NULL
  AND al."entity" LIKE 'TrafficJob%'
  AND al."entity_id" = tj."id";

-- 2. Logs carrying the job id in the request body (dispatch assign, etc.)
UPDATE "activity_logs" al
SET "job_id" = tj."id", "job_ref" = tj."internal_ref"
FROM "traffic_jobs" tj
WHERE al."job_id" IS NULL
  AND tj."id" = COALESCE(
    NULLIF(al."details" ->> 'trafficJobId', ''),
    NULLIF(al."details" ->> 'jobId', '')
  );

-- 3. Logs whose before-snapshot is the traffic job row itself
UPDATE "activity_logs" al
SET "job_id" = tj."id", "job_ref" = tj."internal_ref"
FROM "traffic_jobs" tj
WHERE al."job_id" IS NULL
  AND al."entity" LIKE 'TrafficJob%'
  AND tj."id" = NULLIF(al."previous_data" ->> 'id', '');

-- 4. Dispatch assignment edits/deletes — resolve through the assignment
UPDATE "activity_logs" al
SET "job_id" = tj."id", "job_ref" = tj."internal_ref"
FROM "traffic_assignments" ta
JOIN "traffic_jobs" tj ON tj."id" = ta."traffic_job_id"
WHERE al."job_id" IS NULL
  AND al."entity" = 'Dispatch'
  AND al."entity_id" = ta."id";

-- 5. Historic "create traffic job" logs pre-date capturing the new job's id, so
--    match them back to their job on the natural key of the submitted body.
--    Only unambiguous matches are linked.
UPDATE "activity_logs" al
SET "job_id" = m."job_id", "job_ref" = m."job_ref"
FROM (
  SELECT al2."id" AS "log_id",
         MIN(tj."id") AS "job_id",
         MIN(tj."internal_ref") AS "job_ref"
  FROM "activity_logs" al2
  JOIN "traffic_jobs" tj
    ON tj."agent_id" = al2."details" ->> 'agentId'
   AND tj."agent_ref" = al2."details" ->> 'agentRef'
   AND tj."job_date" = (al2."details" ->> 'jobDate')::date
   AND tj."client_name" = al2."details" ->> 'clientName'
  WHERE al2."job_id" IS NULL
    AND al2."entity" = 'TrafficJob'
    AND al2."action" = 'CREATE'
  GROUP BY al2."id"
  HAVING COUNT(tj."id") = 1
) m
WHERE al."id" = m."log_id";

-- Refresh the summary of every backfilled row so the Job ID reads there too.
UPDATE "activity_logs"
SET "summary" = "action" || ' ' || "entity" || ' (' || "job_ref" || ')'
WHERE "job_ref" IS NOT NULL;
