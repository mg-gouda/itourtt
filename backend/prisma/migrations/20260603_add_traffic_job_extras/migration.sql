-- Source of a traffic-job extra: public B2C booking or manual operator entry.
CREATE TYPE "JobExtraSource" AS ENUM ('B2C', 'MANUAL');

-- Stable marker for the single seeded website agent.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "is_b2c_website" BOOLEAN NOT NULL DEFAULT false;

-- Extras attached to a traffic job, snapshotting the catalog name/price.
CREATE TABLE IF NOT EXISTS "traffic_job_extras" (
    "id"             UUID            NOT NULL DEFAULT gen_random_uuid(),
    "traffic_job_id" UUID            NOT NULL,
    "extra_id"       UUID,
    "name"           TEXT            NOT NULL,
    "qty"            INTEGER         NOT NULL DEFAULT 1,
    "unit_amount"    DECIMAL(15,2)   NOT NULL DEFAULT 0,
    "currency"       "Currency"      NOT NULL DEFAULT 'EGP',
    "source"         "JobExtraSource" NOT NULL DEFAULT 'MANUAL',
    "created_at"     TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMPTZ     NOT NULL,

    CONSTRAINT "traffic_job_extras_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "traffic_job_extras_traffic_job_id_idx"
    ON "traffic_job_extras" ("traffic_job_id");

ALTER TABLE "traffic_job_extras"
    ADD CONSTRAINT "traffic_job_extras_traffic_job_id_fkey"
    FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "traffic_job_extras"
    ADD CONSTRAINT "traffic_job_extras_extra_id_fkey"
    FOREIGN KEY ("extra_id") REFERENCES "b2c_extras" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
