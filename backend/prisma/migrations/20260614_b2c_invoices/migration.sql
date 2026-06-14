-- B2C guest invoices: one per guest booking, created when the booking is paid.
-- Fields kept compatible with Odoo account.move / res.partner for a later export.

-- CreateEnum (guarded so a re-run / db push reconcile does not error)
DO $$ BEGIN
  CREATE TYPE "B2CInvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'REFUNDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "b2c_invoices" (
  "id"               TEXT NOT NULL,
  "invoice_number"   TEXT NOT NULL,
  "guest_booking_id" TEXT NOT NULL,
  "b2c_client_id"    TEXT,
  "issued_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currency"         "Currency" NOT NULL DEFAULT 'EGP',
  "subtotal"         DECIMAL(15,2) NOT NULL,
  "tax_amount"       DECIMAL(15,2) NOT NULL DEFAULT 0,
  "total"            DECIMAL(15,2) NOT NULL,
  "status"           "B2CInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  "deleted_at"       TIMESTAMP(3),
  CONSTRAINT "b2c_invoices_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "b2c_invoices_invoice_number_key"   ON "b2c_invoices"("invoice_number");
CREATE UNIQUE INDEX IF NOT EXISTS "b2c_invoices_guest_booking_id_key" ON "b2c_invoices"("guest_booking_id");
CREATE INDEX        IF NOT EXISTS "b2c_invoices_b2c_client_id_idx"    ON "b2c_invoices"("b2c_client_id");
CREATE INDEX        IF NOT EXISTS "b2c_invoices_invoice_number_idx"   ON "b2c_invoices"("invoice_number");

-- Foreign keys (guarded for idempotency under migrate deploy + db push)
DO $$ BEGIN
  ALTER TABLE "b2c_invoices"
    ADD CONSTRAINT "b2c_invoices_guest_booking_id_fkey"
    FOREIGN KEY ("guest_booking_id") REFERENCES "guest_bookings"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "b2c_invoices"
    ADD CONSTRAINT "b2c_invoices_b2c_client_id_fkey"
    FOREIGN KEY ("b2c_client_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
