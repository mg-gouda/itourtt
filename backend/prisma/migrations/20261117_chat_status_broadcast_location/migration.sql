-- In-app chat: delivered receipts, location messages, broadcasts (announcements).

ALTER TYPE "ChatMessageKind" ADD VALUE IF NOT EXISTS 'LOCATION';

DO $$ BEGIN
  CREATE TYPE "ChatBroadcastAudience" AS ENUM ('REPS', 'DRIVERS', 'REPS_AND_DRIVERS', 'STAFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "chat_conversations"
    ADD COLUMN IF NOT EXISTS "portal_last_delivered_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "staff_last_delivered_at"  TIMESTAMP(3);

-- Everything already read counts as delivered.
UPDATE "chat_conversations"
   SET "portal_last_delivered_at" = "portal_last_read_at",
       "staff_last_delivered_at"  = "staff_last_read_at"
 WHERE "portal_last_delivered_at" IS NULL AND "staff_last_delivered_at" IS NULL;

ALTER TABLE "chat_messages"
    ADD COLUMN IF NOT EXISTS "latitude"   DECIMAL(10,7),
    ADD COLUMN IF NOT EXISTS "longitude"  DECIMAL(10,7),
    ADD COLUMN IF NOT EXISTS "accuracy_m" INTEGER;

CREATE TABLE IF NOT EXISTS "chat_broadcasts" (
    "id"              TEXT                    NOT NULL,
    "sender_id"       TEXT                    NOT NULL,
    "audience"        "ChatBroadcastAudience" NOT NULL,
    "kind"            "ChatMessageKind"       NOT NULL DEFAULT 'TEXT',
    "body"            TEXT,
    "attachment_path" TEXT,
    "attachment_mime" TEXT,
    "attachment_size" INTEGER,
    "duration_sec"    INTEGER,
    "latitude"        DECIMAL(10,7),
    "longitude"       DECIMAL(10,7),
    "accuracy_m"      INTEGER,
    "recipient_count" INTEGER                 NOT NULL DEFAULT 0,
    "created_at"      TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3)            NOT NULL,
    CONSTRAINT "chat_broadcasts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "chat_broadcasts_created_at_idx" ON "chat_broadcasts" ("created_at");
ALTER TABLE "chat_broadcasts" DROP CONSTRAINT IF EXISTS "chat_broadcasts_sender_id_fkey";
ALTER TABLE "chat_broadcasts"
    ADD CONSTRAINT "chat_broadcasts_sender_id_fkey"
    FOREIGN KEY ("sender_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "chat_broadcast_recipients" (
    "id"           TEXT         NOT NULL,
    "broadcast_id" TEXT         NOT NULL,
    "user_id"      TEXT         NOT NULL,
    "delivered_at" TIMESTAMP(3),
    "read_at"      TIMESTAMP(3),
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_broadcast_recipients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "chat_broadcast_recipients_broadcast_id_user_id_key"
    ON "chat_broadcast_recipients" ("broadcast_id", "user_id");
CREATE INDEX IF NOT EXISTS "chat_broadcast_recipients_user_id_read_at_idx"
    ON "chat_broadcast_recipients" ("user_id", "read_at");
CREATE INDEX IF NOT EXISTS "chat_broadcast_recipients_user_id_delivered_at_idx"
    ON "chat_broadcast_recipients" ("user_id", "delivered_at");
ALTER TABLE "chat_broadcast_recipients" DROP CONSTRAINT IF EXISTS "chat_broadcast_recipients_broadcast_id_fkey";
ALTER TABLE "chat_broadcast_recipients"
    ADD CONSTRAINT "chat_broadcast_recipients_broadcast_id_fkey"
    FOREIGN KEY ("broadcast_id") REFERENCES "chat_broadcasts" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_broadcast_recipients" DROP CONSTRAINT IF EXISTS "chat_broadcast_recipients_user_id_fkey";
ALTER TABLE "chat_broadcast_recipients"
    ADD CONSTRAINT "chat_broadcast_recipients_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
