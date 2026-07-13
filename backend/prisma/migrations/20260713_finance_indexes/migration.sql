-- Finance hot-path indexes (exports/reports/aging). On a large prod table,
-- consider running CREATE INDEX CONCURRENTLY manually to avoid write locks.
CREATE INDEX IF NOT EXISTS "journal_lines_journal_entry_id_idx" ON "journal_lines"("journal_entry_id");
CREATE INDEX IF NOT EXISTS "journal_lines_account_id_idx" ON "journal_lines"("account_id");
CREATE INDEX IF NOT EXISTS "payments_payment_date_idx" ON "payments"("payment_date");
CREATE INDEX IF NOT EXISTS "agent_invoices_status_due_date_idx" ON "agent_invoices"("status", "due_date");
