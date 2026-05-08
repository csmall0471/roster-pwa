CREATE TABLE interest_lists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport      text NOT NULL,
  first_name text NOT NULL,
  last_name  text NOT NULL DEFAULT '',
  email      text,
  phone      text,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE interest_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interest_lists: owner full access"
  ON interest_lists FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_interest_lists_user_sport ON interest_lists(user_id, sport);
