-- SECURITY DEFINER bypasses the RLS chain so the caller gets all parents
-- linked to a player, not just their own record.
-- Authorization is enforced explicitly: caller must be a parent of the player.
CREATE OR REPLACE FUNCTION get_player_guardians(p_player_id uuid)
RETURNS TABLE (
  id         uuid,
  first_name text,
  last_name  text,
  email      text,
  phone      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM player_parents pp
    JOIN parent_auth pa ON pa.parent_id = pp.parent_id
    WHERE pp.player_id = p_player_id AND pa.auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT p.id, p.first_name, p.last_name, p.email, p.phone
  FROM parents p
  JOIN player_parents pp ON pp.parent_id = p.id
  WHERE pp.player_id = p_player_id;
END;
$$;
