-- CreateTable
CREATE TABLE "completed_evidence" (
    "id" TEXT NOT NULL,
    "traffic_job_id" TEXT NOT NULL,
    "image_urls" TEXT[],
    "gps_latitude" DECIMAL(10,7) NOT NULL,
    "gps_longitude" DECIMAL(10,7) NOT NULL,
    "gps_map_link" TEXT NOT NULL,
    "submitted_by" TEXT NOT NULL,
    "submitted_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "completed_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "completed_evidence_traffic_job_id_submitted_by_key" ON "completed_evidence"("traffic_job_id", "submitted_by");

-- AddForeignKey
ALTER TABLE "completed_evidence" ADD CONSTRAINT "completed_evidence_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
