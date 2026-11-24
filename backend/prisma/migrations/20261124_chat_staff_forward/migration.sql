-- Office-to-office chat + forwarding (6.2.0). Additive only.
ALTER TABLE "chat_conversations" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PORTAL';
ALTER TABLE "chat_messages" ADD COLUMN "forwarded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "company_settings" ADD COLUMN "chat_staff_contact_roles" TEXT[] DEFAULT ARRAY['admin', 'dispatch-manager', 'dispatch-operator', 'dispatcher', 'online-manager', 'online-operator']::TEXT[];
