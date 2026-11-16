-- In-app chat between rep/driver portal users and staff.

ALTER TABLE "company_settings"
  ADD COLUMN "chat_driver_contact_roles" TEXT[] NOT NULL DEFAULT ARRAY['dispatcher', 'dispatch-operator', 'dispatch-manager']::TEXT[],
  ADD COLUMN "chat_rep_contact_roles"    TEXT[] NOT NULL DEFAULT ARRAY['online-manager', 'online-operator']::TEXT[];

CREATE TYPE "ChatMessageKind" AS ENUM ('TEXT', 'IMAGE', 'VOICE');

CREATE TABLE "chat_conversations" (
  "id"                  TEXT NOT NULL,
  "portal_user_id"      TEXT NOT NULL,
  "staff_user_id"       TEXT NOT NULL,
  "portal_role"         "UserRole" NOT NULL,
  "last_message_at"     TIMESTAMP(3),
  "portal_last_read_at" TIMESTAMP(3),
  "staff_last_read_at"  TIMESTAMP(3),
  "created_by_id"       TEXT NOT NULL,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chat_conversations_portal_user_id_staff_user_id_key" ON "chat_conversations"("portal_user_id", "staff_user_id");
CREATE INDEX "chat_conversations_staff_user_id_last_message_at_idx" ON "chat_conversations"("staff_user_id", "last_message_at");
CREATE INDEX "chat_conversations_portal_user_id_last_message_at_idx" ON "chat_conversations"("portal_user_id", "last_message_at");
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "chat_messages" (
  "id"              TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "sender_id"       TEXT NOT NULL,
  "kind"            "ChatMessageKind" NOT NULL DEFAULT 'TEXT',
  "body"            TEXT,
  "attachment_path" TEXT,
  "attachment_mime" TEXT,
  "attachment_size" INTEGER,
  "duration_sec"    INTEGER,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Browser (Web Push) subscriptions for the rep/driver web portals.
CREATE TABLE "web_push_subscriptions" (
  "id"           TEXT NOT NULL,
  "user_id"      TEXT NOT NULL,
  "endpoint"     TEXT NOT NULL,
  "p256dh"       TEXT NOT NULL,
  "auth"         TEXT NOT NULL,
  "user_agent"   TEXT,
  "last_used_at" TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "web_push_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "web_push_subscriptions_endpoint_key" ON "web_push_subscriptions"("endpoint");
CREATE INDEX "web_push_subscriptions_user_id_idx" ON "web_push_subscriptions"("user_id");
ALTER TABLE "web_push_subscriptions" ADD CONSTRAINT "web_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
