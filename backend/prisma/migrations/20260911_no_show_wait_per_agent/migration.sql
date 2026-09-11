-- The NO SHOW wait is no longer one hard-coded number.
--
-- Operationally it varies two ways: departures are much shorter than arrivals
-- (a guest who misses a hotel pick-up is established far sooner than one who
-- never comes out of an airport), and the odd agent negotiates their own.
-- So the wait is a company default with a per-agent override, and only DEP is
-- split out — arrivals, day tours, going and return all keep the standard 80
-- minutes they have today, so nothing but departures changes behaviour.

-- ── Company defaults (the "for all agents" number) ──
ALTER TABLE "company_settings"
    ADD COLUMN IF NOT EXISTS "no_show_wait_standard_minutes" INTEGER NOT NULL DEFAULT 80,
    ADD COLUMN IF NOT EXISTS "no_show_wait_dep_minutes"      INTEGER NOT NULL DEFAULT 15;

-- ── Per-agent overrides. NULL means "use the company default" ──
-- Deliberately nullable rather than backfilled: the wait is the same for nearly
-- every agent, and copying the number onto all of them would turn the next
-- policy change into an edit of every row.
ALTER TABLE "agents"
    ADD COLUMN IF NOT EXISTS "no_show_wait_standard_minutes" INTEGER,
    ADD COLUMN IF NOT EXISTS "no_show_wait_dep_minutes"      INTEGER;
