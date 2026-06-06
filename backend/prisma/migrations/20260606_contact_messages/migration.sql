-- Inbound contact-form submissions from the B2C site. Stored for the team to
-- review in admin; also emailed to the configured contact address on receipt.

CREATE TABLE IF NOT EXISTS "contact_messages" (
    "id"         TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "name"       TEXT        NOT NULL,
    "email"      TEXT        NOT NULL,
    "phone"      TEXT,
    "subject"    TEXT,
    "message"    TEXT        NOT NULL,
    "ip_address" TEXT,
    "is_read"    BOOLEAN     NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contact_messages_is_read_created_at_idx"
    ON "contact_messages" ("is_read", "created_at");
