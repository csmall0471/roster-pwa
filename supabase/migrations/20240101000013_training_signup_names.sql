-- Returns first/last names for all players signed up to a set of training sessions.
-- SECURITY DEFINER bypasses RLS so parents can see other families' kids' names.
CREATE OR REPLACE FUNCTION get_training_signup_names(p_session_ids uuid[])
RETURNS TABLE (session_id uuid, first_name text, last_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT ts.session_id, p.first_name, p.last_name
  FROM training_signups ts
  JOIN players p ON p.id = ts.player_id
  WHERE ts.session_id = ANY(p_session_ids)
  ORDER BY p.last_name, p.first_name;
$$;
