-- Track who last touched a season's roster (any of its child rows), so the UI
-- can show a "created by / last edited by" tag. created_by is the existing
-- tb_seasons.user_id; this adds updated_at / updated_by.

ALTER TABLE tb_seasons
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Stamp updated_at/updated_by on any direct season edit (rename, status,
-- grouping config…) and whenever the cascade below touches it.
CREATE OR REPLACE FUNCTION public.tb_stamp_season() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tb_seasons_stamp ON tb_seasons;
CREATE TRIGGER tb_seasons_stamp BEFORE UPDATE ON tb_seasons
  FOR EACH ROW EXECUTE FUNCTION public.tb_stamp_season();

-- Any change to a season's child rows bumps the season (firing the stamp above).
-- STATEMENT-level + transition table = one update per statement (cheap even for
-- bulk imports/generates). SECURITY DEFINER so the cascade isn't blocked by RLS.
-- The transition table is aliased `changed` for INSERT/UPDATE (NEW) and DELETE
-- (OLD), so one function serves all three.
CREATE OR REPLACE FUNCTION public.tb_touch_season() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE tb_seasons SET updated_at = now()
    WHERE id IN (SELECT DISTINCT season_id FROM changed WHERE season_id IS NOT NULL);
  RETURN NULL;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tb_imports', 'tb_divisions', 'tb_players', 'tb_coaches',
    'tb_team_names', 'tb_buddy_links', 'tb_teams', 'tb_team_coaches'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tb_touch_ins ON %I', t);
    EXECUTE format('DROP TRIGGER IF EXISTS tb_touch_upd ON %I', t);
    EXECUTE format('DROP TRIGGER IF EXISTS tb_touch_del ON %I', t);
    EXECUTE format('CREATE TRIGGER tb_touch_ins AFTER INSERT ON %I REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.tb_touch_season()', t);
    EXECUTE format('CREATE TRIGGER tb_touch_upd AFTER UPDATE ON %I REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.tb_touch_season()', t);
    EXECUTE format('CREATE TRIGGER tb_touch_del AFTER DELETE ON %I REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.tb_touch_season()', t);
  END LOOP;
END;
$$;

-- Resolve actor ids → display label for the roster UI. Owner shows as "Owner";
-- granted admins show their label. SECURITY DEFINER so any roster user can read
-- the (otherwise locked) roster_admins labels.
CREATE OR REPLACE FUNCTION public.roster_admin_labels()
  RETURNS TABLE (auth_user_id uuid, label text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth_user_id, label FROM roster_admins WHERE auth_user_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.roster_admin_labels() TO authenticated;
