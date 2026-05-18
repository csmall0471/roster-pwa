-- Groups recurring or related training sessions under a shared series_id.
-- Null = standalone session. Auto-assigned on recurring creation.
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS series_id uuid;
CREATE INDEX IF NOT EXISTS idx_training_sessions_series_id ON training_sessions(series_id) WHERE series_id IS NOT NULL;
