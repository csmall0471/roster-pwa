-- Store per-checkpoint split times for the skills course
-- [ { checkpoint: string, time_ms: number, order: number } ]
ALTER TABLE skills_attempts
  ADD COLUMN IF NOT EXISTS course_splits jsonb;

-- Store full shot-by-shot log for hot shots
-- [ { position: "8pt"|"7pt"|"5pt"|"3pt"|"2pt", made: boolean, time_ms: number, order: number } ]
ALTER TABLE skills_attempts
  ADD COLUMN IF NOT EXISTS hot_shots_log jsonb;
