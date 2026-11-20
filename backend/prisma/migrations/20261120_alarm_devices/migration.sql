-- Job alarms that keep working after the rep / driver signs out (per-phone alarm key)
CREATE TABLE IF NOT EXISTS "alarm_devices" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" VARCHAR(10) NOT NULL,
  "key_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "alarm_devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alarm_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "alarm_devices_key_hash_key" ON "alarm_devices"("key_hash");
CREATE INDEX IF NOT EXISTS "alarm_devices_user_id_idx" ON "alarm_devices"("user_id");
