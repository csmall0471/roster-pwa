-- Parents can read all parents linked to the same kids
CREATE POLICY "parents_read_linked" ON parents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM player_parents pp
      JOIN player_parents pp2 ON pp2.player_id = pp.player_id
      JOIN parent_auth pa ON pa.parent_id = pp2.parent_id
      WHERE pp.parent_id = parents.id
        AND pa.auth_user_id = auth.uid()
    )
  );

-- Parents can update any parent linked to the same kids
CREATE POLICY "parents_update_linked" ON parents
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM player_parents pp
      JOIN player_parents pp2 ON pp2.player_id = pp.player_id
      JOIN parent_auth pa ON pa.parent_id = pp2.parent_id
      WHERE pp.parent_id = parents.id
        AND pa.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM player_parents pp
      JOIN player_parents pp2 ON pp2.player_id = pp.player_id
      JOIN parent_auth pa ON pa.parent_id = pp2.parent_id
      WHERE pp.parent_id = parents.id
        AND pa.auth_user_id = auth.uid()
    )
  );

-- Add a new co-parent/guardian to a player.
-- Uses SECURITY DEFINER so it can insert with the existing owner's user_id,
-- keeping the record visible in the coach admin panel.
CREATE OR REPLACE FUNCTION add_coparent(
  p_player_id  uuid,
  p_first_name text,
  p_last_name  text,
  p_email      text,
  p_phone      text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id  uuid;
  v_owner_uid  uuid;
BEGIN
  -- Verify caller has a kid with this player_id
  IF NOT EXISTS (
    SELECT 1 FROM player_parents pp
    JOIN parent_auth pa ON pa.parent_id = pp.parent_id
    WHERE pp.player_id = p_player_id AND pa.auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Reuse the owner user_id from existing records so the coach can also see/edit this guardian
  SELECT user_id INTO v_owner_uid
  FROM player_parents
  WHERE player_id = p_player_id
  LIMIT 1;

  IF v_owner_uid IS NULL THEN
    v_owner_uid := auth.uid();
  END IF;

  INSERT INTO parents (user_id, first_name, last_name, email, phone)
  VALUES (
    v_owner_uid,
    trim(p_first_name),
    trim(p_last_name),
    trim(p_email),
    NULLIF(trim(p_phone), '')
  )
  RETURNING id INTO v_parent_id;

  INSERT INTO player_parents (player_id, parent_id, user_id, relationship)
  VALUES (p_player_id, v_parent_id, v_owner_uid, 'guardian');

  RETURN v_parent_id;
END;
$$;
