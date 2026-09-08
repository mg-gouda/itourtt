-- Complaint tracking: complaints raised by clients against a traffic job, the 48h
-- reply SLA, the won/lost outcome with the agent, and where the loss lands
-- (a charge against the responsible party, and an adjustment on the agent side).

-- CreateTable
CREATE TABLE "complaint_categories" (
    "id" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "default_party" "ComplaintParty",
    "default_penalty_points" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "complaint_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "complaint_no" TEXT NOT NULL,
    "traffic_job_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "category_id" TEXT NOT NULL,
    "stage" "ComplaintStage" NOT NULL,
    "source" "ComplaintSource" NOT NULL DEFAULT 'AGENT',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "complaint_date" TIMESTAMP(3) NOT NULL,
    "sla_hours" INTEGER NOT NULL DEFAULT 48,
    "reply_due_at" TIMESTAMP(3) NOT NULL,
    "replied_at" TIMESTAMP(3),
    "sla_breached" BOOLEAN NOT NULL DEFAULT false,
    "sla_warned_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "claimed_amount" DECIMAL(15,2),
    "loss_amount" DECIMAL(15,2),
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "exchange_rate" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "responsible_party" "ComplaintParty",
    "responsible_driver_id" TEXT,
    "responsible_rep_id" TEXT,
    "responsible_supplier_id" TEXT,
    "score_penalty_applied" INTEGER NOT NULL DEFAULT 0,
    "score_penalty_note" TEXT,
    "assigned_to_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_attachments" (
    "id" TEXT NOT NULL,
    "complaint_id" TEXT NOT NULL,
    "kind" "ComplaintAttachmentKind" NOT NULL DEFAULT 'COMPLAINT_DOC',
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT,
    "submitted_by" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_charges" (
    "id" TEXT NOT NULL,
    "complaint_id" TEXT NOT NULL,
    "party" "ComplaintParty" NOT NULL,
    "driver_id" TEXT,
    "rep_id" TEXT,
    "supplier_id" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "status" "ComplaintChargeStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "posted_at" TIMESTAMP(3),
    "posted_fee_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaint_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_adjustments" (
    "id" TEXT NOT NULL,
    "adjustment_no" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "complaint_id" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "exchange_rate" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "status" "AgentAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
    "invoice_line_id" TEXT,
    "credit_note_invoice_id" TEXT,
    "waived_reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_adjustments_pkey" PRIMARY KEY ("id")
);

-- AlterTable: complaint penalty on the job score models (existing weights untouched)
ALTER TABLE "rep_job_scores" ADD COLUMN "complaint_penalty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "driver_job_scores" ADD COLUMN "complaint_penalty" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "complaint_categories_is_active_sort_order_idx" ON "complaint_categories"("is_active", "sort_order");
CREATE INDEX "complaint_categories_deleted_at_idx" ON "complaint_categories"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_complaint_no_key" ON "complaints"("complaint_no");
CREATE INDEX "complaints_traffic_job_id_idx" ON "complaints"("traffic_job_id");
CREATE INDEX "complaints_agent_id_idx" ON "complaints"("agent_id");
CREATE INDEX "complaints_category_id_idx" ON "complaints"("category_id");
CREATE INDEX "complaints_status_idx" ON "complaints"("status");
CREATE INDEX "complaints_complaint_date_idx" ON "complaints"("complaint_date");
CREATE INDEX "complaints_reply_due_at_replied_at_idx" ON "complaints"("reply_due_at", "replied_at");
CREATE INDEX "complaints_responsible_driver_id_idx" ON "complaints"("responsible_driver_id");
CREATE INDEX "complaints_responsible_rep_id_idx" ON "complaints"("responsible_rep_id");
CREATE INDEX "complaints_responsible_supplier_id_idx" ON "complaints"("responsible_supplier_id");
CREATE INDEX "complaints_assigned_to_id_idx" ON "complaints"("assigned_to_id");
CREATE INDEX "complaints_deleted_at_idx" ON "complaints"("deleted_at");

-- CreateIndex
CREATE INDEX "complaint_attachments_complaint_id_idx" ON "complaint_attachments"("complaint_id");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_charges_complaint_id_key" ON "complaint_charges"("complaint_id");
CREATE INDEX "complaint_charges_status_idx" ON "complaint_charges"("status");
CREATE INDEX "complaint_charges_driver_id_idx" ON "complaint_charges"("driver_id");
CREATE INDEX "complaint_charges_rep_id_idx" ON "complaint_charges"("rep_id");
CREATE INDEX "complaint_charges_supplier_id_idx" ON "complaint_charges"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_adjustments_adjustment_no_key" ON "agent_adjustments"("adjustment_no");
CREATE INDEX "agent_adjustments_agent_id_idx" ON "agent_adjustments"("agent_id");
CREATE INDEX "agent_adjustments_status_idx" ON "agent_adjustments"("status");
CREATE INDEX "agent_adjustments_complaint_id_idx" ON "agent_adjustments"("complaint_id");
CREATE INDEX "agent_adjustments_invoice_line_id_idx" ON "agent_adjustments"("invoice_line_id");

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "complaint_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_responsible_driver_id_fkey" FOREIGN KEY ("responsible_driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_responsible_rep_id_fkey" FOREIGN KEY ("responsible_rep_id") REFERENCES "reps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_responsible_supplier_id_fkey" FOREIGN KEY ("responsible_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_charges" ADD CONSTRAINT "complaint_charges_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "complaint_charges" ADD CONSTRAINT "complaint_charges_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "complaint_charges" ADD CONSTRAINT "complaint_charges_rep_id_fkey" FOREIGN KEY ("rep_id") REFERENCES "reps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "complaint_charges" ADD CONSTRAINT "complaint_charges_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "complaint_charges" ADD CONSTRAINT "complaint_charges_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_adjustments" ADD CONSTRAINT "agent_adjustments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_adjustments" ADD CONSTRAINT "agent_adjustments_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_adjustments" ADD CONSTRAINT "agent_adjustments_invoice_line_id_fkey" FOREIGN KEY ("invoice_line_id") REFERENCES "invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_adjustments" ADD CONSTRAINT "agent_adjustments_credit_note_invoice_id_fkey" FOREIGN KEY ("credit_note_invoice_id") REFERENCES "agent_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
