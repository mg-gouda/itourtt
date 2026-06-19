-- Store a snapshot of the record BEFORE an update/delete so the Activity Log
-- can render a readable old → new comparison. Nullable: existing rows and
-- create actions have no previous state.

ALTER TABLE "activity_logs" ADD COLUMN "previous_data" JSONB;
