-- ── Assistant coaches per team ──────────────────────────────────────────────
-- A team owner can designate assistant coaches for a team, chosen from the
-- parents who have a kid on that team (roster → players → player_parents →
-- parents). We store the selected parent ids as a uuid[] on the team itself,
-- so no new table or RLS is needed — access inherits the teams table policy
-- (auth.uid() = user_id). To resolve to names, join parents by these ids and
-- format `${first_name} ${last_name}`.
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS assistant_coach_parent_ids uuid[] NOT NULL DEFAULT '{}';
