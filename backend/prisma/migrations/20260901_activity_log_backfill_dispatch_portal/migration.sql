-- Activity Log: recover the traffic job for dispatch edits and portal actions.
--
-- WHY THESE ROWS ARE ORPHANED
-- The audit interceptor recorded `entity_id` from URL segment 1 only. The two
-- highest-volume job actions address their record deeper:
--     PATCH /dispatch/assignments/:id        (assignment id at segment 2)
--     POST  /driver-portal/jobs/:id/completed (job id at segment 2)
-- so both stored a NULL id, and neither the request body nor the row itself
-- kept any pointer to the job. 20260831_activity_log_job_ref's step 4 tried to
-- link dispatch edits via `entity_id = ta.id` — always NULL — and matched zero
-- rows; no step covered the portals at all. Result: 3,025 dispatch edits and
-- 4,152 portal actions invisible when tracing a job, which reads as "dispatch
-- did nothing" on any job whose driver was added after the initial assign.
--
-- The interceptor now stores the first UUID in the path, so new rows link
-- themselves. These rows predate that and are recovered by correlation.
--
-- METHOD
-- The audit queue flushes on a 5s timer, so a row lands 0-5s after the request
-- that produced it (measured p99 = 5.07s). Each write left a second, precisely
-- timestamped trace elsewhere in the schema:
--     driver/rep assignment -> driver_notifications / rep_notifications
--     portal status change  -> status_change_logs
-- Matching those within a 6s look-back recovers the job. Every step demands
-- exactly ONE candidate job (HAVING count(DISTINCT ...) = 1); a dispatcher
-- bulk-assigning inside a single flush window is left NULL rather than guessed,
-- because a misattributed audit row is worse than an absent one.

-- ── 1. Dispatch: driver assignment ──────────────────────────────────────────
-- A notification is written only when the driver actually CHANGES, so no-op
-- re-saves of the same driver have no trace and stay unlinked.
WITH m AS (
  SELECT al."id" AS log_id,
         min(dn."traffic_job_id") AS job_id
  FROM "activity_logs" al
  JOIN "driver_notifications" dn
    ON dn."driver_id" = al."details" ->> 'driverId'
   AND dn."type" = 'JOB_ASSIGNED'
   AND dn."created_at" <= al."created_at"
   AND dn."created_at" >  al."created_at" - interval '6 seconds'
  WHERE al."job_id" IS NULL
    AND al."entity" = 'Dispatch'
    AND al."details" ? 'driverId'
  GROUP BY al."id"
  HAVING count(DISTINCT dn."traffic_job_id") = 1
)
UPDATE "activity_logs" al
SET "job_id" = tj."id", "job_ref" = tj."internal_ref"
FROM m JOIN "traffic_jobs" tj ON tj."id" = m.job_id
WHERE al."id" = m.log_id;

-- ── 2. Dispatch: rep assignment ─────────────────────────────────────────────
WITH m AS (
  SELECT al."id" AS log_id,
         min(rn."traffic_job_id") AS job_id
  FROM "activity_logs" al
  JOIN "rep_notifications" rn
    ON rn."rep_id" = al."details" ->> 'repId'
   AND rn."type" = 'JOB_ASSIGNED'
   AND rn."created_at" <= al."created_at"
   AND rn."created_at" >  al."created_at" - interval '6 seconds'
  WHERE al."job_id" IS NULL
    AND al."entity" = 'Dispatch'
    AND al."details" ? 'repId'
  GROUP BY al."id"
  HAVING count(DISTINCT rn."traffic_job_id") = 1
)
UPDATE "activity_logs" al
SET "job_id" = tj."id", "job_ref" = tj."internal_ref"
FROM m JOIN "traffic_jobs" tj ON tj."id" = m.job_id
WHERE al."id" = m.log_id;

-- ── 3. Portal actions (driver / rep / supplier) ─────────────────────────────
-- status_change_logs.changed_by_id holds the Driver/Rep id; activity_logs.user_id
-- holds their linked User id, so the two are joined through drivers.user_id /
-- reps.user_id. A portal user can only be on one job at a time, so this is
-- unambiguous in practice (0 ambiguous rows across the whole table).
WITH m AS (
  SELECT al."id" AS log_id,
         min(ta."traffic_job_id") AS job_id
  FROM "activity_logs" al
  JOIN "status_change_logs" scl
    ON scl."created_at" <= al."created_at"
   AND scl."created_at" >  al."created_at" - interval '6 seconds'
  JOIN "traffic_assignments" ta ON ta."id" = scl."assignment_id"
  LEFT JOIN "drivers" d ON d."id" = scl."changed_by_id"
  LEFT JOIN "reps"    r ON r."id" = scl."changed_by_id"
  WHERE al."job_id" IS NULL
    AND split_part(al."entity", '.', 1)
        IN ('driver-portal', 'rep-portal', 'supplier-portal',
            'DriverPortal', 'RepPortal', 'SupplierPortal')
    AND COALESCE(d."user_id", r."user_id") = al."user_id"
  GROUP BY al."id"
  HAVING count(DISTINCT ta."traffic_job_id") = 1
)
UPDATE "activity_logs" al
SET "job_id" = tj."id", "job_ref" = tj."internal_ref"
FROM m JOIN "traffic_jobs" tj ON tj."id" = m.job_id
WHERE al."id" = m.log_id;

-- ── 4. Dispatch: vehicle-only edits ─────────────────────────────────────────
-- Attaching a vehicle writes no notification, so there is no direct trace. The
-- console enforces Vehicle -> Driver -> Rep, so a vehicle edit sits seconds away
-- from a sibling action on the same job by the same user. Runs AFTER steps 1-3
-- so those siblings are already linked, and only accepts a candidate job whose
-- assignment actually carries that vehicle — which is what keeps the heuristic
-- honest.
WITH m AS (
  SELECT v."id" AS log_id,
         min(sib."job_id") AS job_id
  FROM "activity_logs" v
  JOIN "activity_logs" sib
    ON sib."job_id" IS NOT NULL
   AND sib."user_id" = v."user_id"
   AND sib."created_at" BETWEEN v."created_at" - interval '120 seconds'
                            AND v."created_at" + interval '120 seconds'
  JOIN "traffic_assignments" ta
    ON ta."traffic_job_id" = sib."job_id"
   AND ta."vehicle_id" = v."details" ->> 'vehicleId'
  WHERE v."job_id" IS NULL
    AND v."entity" = 'Dispatch'
    AND v."details" ? 'vehicleId'
    AND NOT v."details" ? 'driverId'
    AND NOT v."details" ? 'repId'
  GROUP BY v."id"
  HAVING count(DISTINCT sib."job_id") = 1
)
UPDATE "activity_logs" al
SET "job_id" = tj."id", "job_ref" = tj."internal_ref"
FROM m JOIN "traffic_jobs" tj ON tj."id" = m.job_id
WHERE al."id" = m.log_id;

-- ── 5. Normalise portal entity names ────────────────────────────────────────
-- Historic rows stored the raw URL slug because ENTITY_MAP had no portal entry.
-- New rows read "DriverPortal.Completed"; align the old top-level names so the
-- entity filter shows one option per portal instead of two. The historic action
-- suffix is unrecoverable (it lived in the URL), so old rows stay coarse.
-- COALESCE matters: substring() returns NULL when there is no sub-resource, and
-- 'DriverPortal' || NULL would blank a NOT NULL column.
UPDATE "activity_logs"
SET "entity" = 'DriverPortal' || COALESCE(substring("entity" from '\..*$'), '')
WHERE "entity" LIKE 'driver-portal%';

UPDATE "activity_logs"
SET "entity" = 'RepPortal' || COALESCE(substring("entity" from '\..*$'), '')
WHERE "entity" LIKE 'rep-portal%';

UPDATE "activity_logs"
SET "entity" = 'SupplierPortal' || COALESCE(substring("entity" from '\..*$'), '')
WHERE "entity" LIKE 'supplier-portal%';

-- ── 6. Rebuild summaries ────────────────────────────────────────────────────
-- Mirrors AuditInterceptor.buildSummary: prefer the job ref, fall back to a
-- short record id, else no suffix. Steps 1-5 changed both inputs, so every row
-- is re-derived rather than left describing the old entity name.
UPDATE "activity_logs"
SET "summary" = "action" || ' ' || "entity" ||
  CASE
    WHEN "job_ref" IS NOT NULL THEN ' (' || "job_ref" || ')'
    WHEN "entity_id" IS NOT NULL THEN ' (' || substring("entity_id" from 1 for 8) || U&'\2026' || ')'
    ELSE ''
  END
WHERE "summary" IS DISTINCT FROM "action" || ' ' || "entity" ||
  CASE
    WHEN "job_ref" IS NOT NULL THEN ' (' || "job_ref" || ')'
    WHEN "entity_id" IS NOT NULL THEN ' (' || substring("entity_id" from 1 for 8) || U&'\2026' || ')'
    ELSE ''
  END;
