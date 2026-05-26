-- Set roster status to 'inactive' for all players on teams whose season has ended.
-- Safe to run multiple times (idempotent).
UPDATE roster r
SET status = 'inactive'
FROM teams t
WHERE r.team_id = t.id
  AND t.season_end IS NOT NULL
  AND t.season_end < CURRENT_DATE
  AND r.status <> 'inactive';

-- Preview what will be affected (run this SELECT first to verify):
-- SELECT r.id, p.first_name, p.last_name, t.name AS team, t.season_end, r.status
-- FROM roster r
-- JOIN teams t ON t.id = r.team_id
-- JOIN players p ON p.id = r.player_id
-- WHERE t.season_end IS NOT NULL
--   AND t.season_end < CURRENT_DATE
--   AND r.status <> 'inactive'
-- ORDER BY t.season_end DESC, t.name, p.last_name;
