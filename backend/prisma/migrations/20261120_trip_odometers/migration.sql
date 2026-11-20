-- Odometer readings at job completion (owned cars) + Odoo Fleet export
CREATE TABLE IF NOT EXISTS "trip_odometers" (
  "id" TEXT NOT NULL,
  "traffic_job_id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "reading_km" INTEGER,
  "ai_reading_km" INTEGER,
  "source" VARCHAR(10) NOT NULL DEFAULT 'AI',
  "ai_attempts" INTEGER NOT NULL DEFAULT 0,
  "photo_url" TEXT,
  "flagged" BOOLEAN NOT NULL DEFAULT false,
  "flag_note" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "exported_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "trip_odometers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "trip_odometers_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trip_odometers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "trip_odometers_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "trip_odometers_traffic_job_id_key" ON "trip_odometers"("traffic_job_id");
CREATE INDEX IF NOT EXISTS "trip_odometers_vehicle_id_confirmed_at_idx" ON "trip_odometers"("vehicle_id", "confirmed_at");
CREATE INDEX IF NOT EXISTS "trip_odometers_driver_id_confirmed_at_idx" ON "trip_odometers"("driver_id", "confirmed_at");
CREATE INDEX IF NOT EXISTS "trip_odometers_confirmed_at_idx" ON "trip_odometers"("confirmed_at");

-- Permissions (production skips the permission seed): Transportation Accountant gets the page,
-- export and morning reminder; Admin the page and export.
INSERT INTO "role_permissions_v2" ("id", "role_id", "permission_key")
SELECT md5(random()::text || r.id || k.key), r.id, k.key
FROM "roles" r
JOIN (VALUES ('transportation-accountant', 'trip-km'), ('transportation-accountant', 'trip-km.export'),
             ('transportation-accountant', 'trip-km.reminder'), ('admin', 'trip-km'), ('admin', 'trip-km.export')) AS k(slug, key)
  ON k.slug = r.slug
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
