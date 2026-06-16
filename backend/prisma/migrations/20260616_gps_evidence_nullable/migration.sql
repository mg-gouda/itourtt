-- Make GPS capture optional on status-change / evidence records.
-- Drivers and reps can submit a status change even when a location fix is
-- unavailable, denied, or times out, so coordinates are now nullable.

ALTER TABLE "status_change_logs"
  ALTER COLUMN "gps_latitude" DROP NOT NULL,
  ALTER COLUMN "gps_longitude" DROP NOT NULL,
  ALTER COLUMN "gps_map_link" DROP NOT NULL;

ALTER TABLE "no_show_evidence"
  ALTER COLUMN "gps_latitude" DROP NOT NULL,
  ALTER COLUMN "gps_longitude" DROP NOT NULL,
  ALTER COLUMN "gps_map_link" DROP NOT NULL;

ALTER TABLE "in_place_evidence"
  ALTER COLUMN "gps_latitude" DROP NOT NULL,
  ALTER COLUMN "gps_longitude" DROP NOT NULL,
  ALTER COLUMN "gps_map_link" DROP NOT NULL;

ALTER TABLE "completed_evidence"
  ALTER COLUMN "gps_latitude" DROP NOT NULL,
  ALTER COLUMN "gps_longitude" DROP NOT NULL,
  ALTER COLUMN "gps_map_link" DROP NOT NULL;

ALTER TABLE "in_progress_evidence"
  ALTER COLUMN "gps_latitude" DROP NOT NULL,
  ALTER COLUMN "gps_longitude" DROP NOT NULL,
  ALTER COLUMN "gps_map_link" DROP NOT NULL;
