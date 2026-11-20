-- Rep / driver answers to complaints that blame them (one thread per party) + evidence link
CREATE TABLE IF NOT EXISTS "complaint_messages" (
  "id" TEXT NOT NULL,
  "complaint_id" TEXT NOT NULL,
  "party" VARCHAR(10) NOT NULL,
  "author_type" VARCHAR(10) NOT NULL,
  "rep_id" TEXT,
  "driver_id" TEXT,
  "user_id" TEXT NOT NULL,
  "message" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "complaint_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "complaint_messages_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "complaint_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "complaint_messages_complaint_id_created_at_idx" ON "complaint_messages"("complaint_id", "created_at");
CREATE INDEX IF NOT EXISTS "complaint_messages_rep_id_idx" ON "complaint_messages"("rep_id");
CREATE INDEX IF NOT EXISTS "complaint_messages_driver_id_idx" ON "complaint_messages"("driver_id");

ALTER TABLE "complaint_attachments" ADD COLUMN IF NOT EXISTS "message_id" TEXT;
CREATE INDEX IF NOT EXISTS "complaint_attachments_message_id_idx" ON "complaint_attachments"("message_id");
DO $$ BEGIN
  ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "complaint_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
