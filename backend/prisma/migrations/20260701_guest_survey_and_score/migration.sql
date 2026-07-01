-- Native Arrival Guest Survey + new "survey" scoring dimension.
-- Rep fee scoring re-weighted: Work 30->15 pts, Survey +15 pts (total stays 100).

-- 1) New "survey" score flag on rep_job_scores (defaults false for existing rows).
ALTER TABLE "rep_job_scores"
  ADD COLUMN "survey" BOOLEAN NOT NULL DEFAULT false;

-- 2) Native guest survey, one per ARR traffic job.
CREATE TABLE "guest_surveys" (
    "id" TEXT NOT NULL,
    "traffic_job_id" TEXT NOT NULL,
    "rep_id" TEXT NOT NULL,
    "submitted_by_id" TEXT NOT NULL,
    "age_range" TEXT NOT NULL,
    "no_of_adults" INTEGER NOT NULL,
    "flight_no" TEXT NOT NULL,
    "no_of_infants" INTEGER NOT NULL DEFAULT 0,
    "stay_length" TEXT,
    "job_reference" TEXT NOT NULL,
    "repeater_guest" TEXT NOT NULL,
    "guest_nationality" TEXT NOT NULL,
    "no_of_children" INTEGER NOT NULL DEFAULT 0,
    "local_travel_agent" TEXT,
    "hotel_name" TEXT NOT NULL,
    "email" TEXT,
    "general_comment" TEXT NOT NULL,
    "contact_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guest_surveys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_surveys_traffic_job_id_key" ON "guest_surveys"("traffic_job_id");
CREATE INDEX "guest_surveys_rep_id_idx" ON "guest_surveys"("rep_id");
CREATE INDEX "guest_surveys_created_at_idx" ON "guest_surveys"("created_at");

ALTER TABLE "guest_surveys"
  ADD CONSTRAINT "guest_surveys_traffic_job_id_fkey"
  FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "guest_surveys"
  ADD CONSTRAINT "guest_surveys_rep_id_fkey"
  FOREIGN KEY ("rep_id") REFERENCES "reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
