-- CreateTable
CREATE TABLE "rep_job_scores" (
    "id" TEXT NOT NULL,
    "traffic_job_id" TEXT NOT NULL,
    "rep_id" TEXT NOT NULL,
    "attendance" BOOLEAN NOT NULL DEFAULT false,
    "appearance" BOOLEAN NOT NULL DEFAULT false,
    "work" BOOLEAN NOT NULL DEFAULT false,
    "review" BOOLEAN NOT NULL DEFAULT false,
    "scored_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rep_job_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rep_job_scores_traffic_job_id_key" ON "rep_job_scores"("traffic_job_id");

-- AddForeignKey
ALTER TABLE "rep_job_scores" ADD CONSTRAINT "rep_job_scores_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rep_job_scores" ADD CONSTRAINT "rep_job_scores_rep_id_fkey" FOREIGN KEY ("rep_id") REFERENCES "reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rep_job_scores" ADD CONSTRAINT "rep_job_scores_scored_by_id_fkey" FOREIGN KEY ("scored_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
