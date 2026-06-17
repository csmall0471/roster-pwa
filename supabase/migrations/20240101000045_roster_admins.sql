-- ── Roster Creator shared access ─────────────────────────────────────────────
-- Lets the owner grant extra people access to ONLY the Roster Creator tool, by
-- phone number (so they log in with phone OTP — no Gmail). They share the same
-- seasons (a collaborative workspace). They are NOT coaches and NOT parents.

CREATE TABLE IF NOT EXISTS roster_admins (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_key    text        NOT NULL UNIQUE,        -- normalized digits (10-digit US)
  label        text,                               -- person's name, for the owner's reference
  auth_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,  -- linked on first login
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Locked down: no client policies. Reads happen through the SECURITY DEFINER
-- helpers below; management happens through service-role server actions.
ALTER TABLE roster_admins ENABLE ROW LEVEL SECURITY;

-- Is the current user a linked roster admin? SECURITY DEFINER so it can read the
-- locked table and be used inside other tables' RLS without recursion.
CREATE OR REPLACE FUNCTION public.is_roster_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM roster_admins WHERE auth_user_id = auth.uid());
$$;

-- Link the current phone-authed user to a matching allow-list row (by normalized
-- phone from the JWT), then report whether they're an admin. Idempotent.
CREATE OR REPLACE FUNCTION public.link_roster_admin() RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ukey text;
BEGIN
  ukey := regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g');
  IF length(ukey) = 11 AND left(ukey, 1) = '1' THEN ukey := right(ukey, 10); END IF;
  IF ukey <> '' THEN
    UPDATE roster_admins SET auth_user_id = auth.uid()
      WHERE phone_key = ukey AND auth_user_id IS DISTINCT FROM auth.uid();
  END IF;
  RETURN EXISTS (SELECT 1 FROM roster_admins WHERE auth_user_id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_roster_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_roster_admin() TO authenticated;

-- ── Open every tb_ policy to roster admins (shared workspace) ─────────────────
-- The owner still gets access via user_id = auth.uid(); roster admins get access
-- to ALL seasons via is_roster_admin().

DROP POLICY IF EXISTS "owner_all_tb_seasons" ON tb_seasons;
CREATE POLICY "owner_all_tb_seasons" ON tb_seasons
  FOR ALL TO authenticated
  USING      ((user_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
              OR public.is_roster_admin())
  WITH CHECK ((user_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
              OR public.is_roster_admin());

DROP POLICY IF EXISTS "owner_all_tb_imports" ON tb_imports;
CREATE POLICY "owner_all_tb_imports" ON tb_imports
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin());

DROP POLICY IF EXISTS "owner_all_tb_divisions" ON tb_divisions;
CREATE POLICY "owner_all_tb_divisions" ON tb_divisions
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin());

DROP POLICY IF EXISTS "owner_all_tb_players" ON tb_players;
CREATE POLICY "owner_all_tb_players" ON tb_players
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin());

DROP POLICY IF EXISTS "owner_all_tb_coaches" ON tb_coaches;
CREATE POLICY "owner_all_tb_coaches" ON tb_coaches
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin());

DROP POLICY IF EXISTS "owner_all_tb_team_names" ON tb_team_names;
CREATE POLICY "owner_all_tb_team_names" ON tb_team_names
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin());

DROP POLICY IF EXISTS "owner_all_tb_buddy_links" ON tb_buddy_links;
CREATE POLICY "owner_all_tb_buddy_links" ON tb_buddy_links
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin());

DROP POLICY IF EXISTS "owner_all_tb_teams" ON tb_teams;
CREATE POLICY "owner_all_tb_teams" ON tb_teams
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin());

DROP POLICY IF EXISTS "owner_all_tb_team_coaches" ON tb_team_coaches;
CREATE POLICY "owner_all_tb_team_coaches" ON tb_team_coaches
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()) OR public.is_roster_admin());
