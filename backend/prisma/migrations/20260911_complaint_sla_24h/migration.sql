-- The standard reply window is now 24 hours, not 48.
--
-- Only the default moves. `sla_hours` is stored per complaint precisely so a
-- later policy change cannot rewrite history, so every existing complaint keeps
-- the window it was logged with and its reply_due_at stays where it was.
ALTER TABLE "complaints" ALTER COLUMN "sla_hours" SET DEFAULT 24;
