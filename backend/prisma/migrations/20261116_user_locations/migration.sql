-- Rep / Driver Tracking maps: last-known position per portal user.
-- One row per user, upserted by the portal heartbeat and by every GPS-stamped
-- status/evidence submission. No history is kept.
CREATE TABLE IF NOT EXISTS "user_locations" (
    "id"          TEXT             NOT NULL,
    "user_id"     TEXT             NOT NULL,
    "role"        "UserRole"       NOT NULL,
    "latitude"    DECIMAL(10,7)    NOT NULL,
    "longitude"   DECIMAL(10,7)    NOT NULL,
    "accuracy"    DOUBLE PRECISION,
    "source"      TEXT             NOT NULL,
    "recorded_at" TIMESTAMP(3)     NOT NULL,
    "created_at"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "user_locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_locations_user_id_key"
    ON "user_locations" ("user_id");

CREATE INDEX IF NOT EXISTS "user_locations_role_recorded_at_idx"
    ON "user_locations" ("role", "recorded_at");

ALTER TABLE "user_locations"
    DROP CONSTRAINT IF EXISTS "user_locations_user_id_fkey";
ALTER TABLE "user_locations"
    ADD CONSTRAINT "user_locations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
