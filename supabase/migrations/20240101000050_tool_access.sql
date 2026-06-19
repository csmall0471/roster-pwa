-- ── Generalized tool access ──────────────────────────────────────────────────
-- Supersedes the single-tool `roster_admins` allow-list (migration 045) with a
-- per-tool grant model. One row per invited person (by phone and/or email); a
-- `tools[]` array names which tools they may use. The owner manages this from
-- the permission manager (/access). Existing rows were roster admins, so they
-- are backfilled to ARRAY['roster-creator'] and every dependent function keeps
-- working unchanged.

-- Rename the table — Postgres re-points dependent functions/policies by OID, so
-- the tb_* RLS policies that call is_roster_admin() are unaffected by the rename.
ALTER TABLE roster_admins RENAME TO tool_access;

-- New columns: optional email (for Google/email logins), and the grant set.
ALTER TABLE tool_access ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE tool_access ADD COLUMN IF NOT EXISTS tools text[] NOT NULL DEFAULT '{}';

-- Existing rows were roster admins.
UPDATE tool_access SET tools = ARRAY['roster-creator'] WHERE tools = '{}';

-- phone_key was NOT NULL UNIQUE; now a row may be keyed by email instead, so
-- allow either identifier while keeping each unique.
ALTER TABLE tool_access ALTER COLUMN phone_key DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tool_access_email_key ON tool_access (lower(email));
ALTER TABLE tool_access DROP CONSTRAINT IF EXISTS tool_access_has_identifier;
ALTER TABLE tool_access ADD CONSTRAINT tool_access_has_identifier
  CHECK (phone_key IS NOT NULL OR email IS NOT NULL);

-- ── Helper functions (all SECURITY DEFINER to read the locked table) ─────────

-- Keep the 045 name/shape so the tb_* RLS policies need no change: a roster
-- admin is anyone whose grant set includes 'roster-creator'.
CREATE OR REPLACE FUNCTION public.is_roster_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tool_access
    WHERE auth_user_id = auth.uid() AND 'roster-creator' = ANY(tools)
  );
$$;

-- Does the current user have access to a specific tool?
CREATE OR REPLACE FUNCTION public.has_tool_access(tool text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tool_access
    WHERE auth_user_id = auth.uid() AND tool = ANY(tools)
  );
$$;

-- The current user's full grant set (drives the navs). Empty array if none.
CREATE OR REPLACE FUNCTION public.my_tools() RETURNS text[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT tools FROM tool_access WHERE auth_user_id = auth.uid() LIMIT 1),
    '{}'::text[]
  );
$$;

-- Link the current user to a matching allow-list row by normalized phone (from
-- the JWT) OR email, then return their grant set. Idempotent.
CREATE OR REPLACE FUNCTION public.link_tool_access() RETURNS text[]
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ukey   text;
  uemail text;
BEGIN
  ukey := regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g');
  IF length(ukey) = 11 AND left(ukey, 1) = '1' THEN ukey := right(ukey, 10); END IF;
  uemail := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF ukey <> '' THEN
    UPDATE tool_access SET auth_user_id = auth.uid()
      WHERE phone_key = ukey AND auth_user_id IS DISTINCT FROM auth.uid();
  END IF;
  IF uemail <> '' THEN
    UPDATE tool_access SET auth_user_id = auth.uid()
      WHERE lower(email) = uemail AND auth_user_id IS DISTINCT FROM auth.uid();
  END IF;

  RETURN public.my_tools();
END;
$$;

-- Back-compat wrapper: the protected layout still calls link_roster_admin().
CREATE OR REPLACE FUNCTION public.link_roster_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'roster-creator' = ANY(public.link_tool_access());
$$;

-- Repoint the label lookup at the renamed table.
CREATE OR REPLACE FUNCTION public.roster_admin_labels()
  RETURNS TABLE (auth_user_id uuid, label text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth_user_id, label FROM tool_access WHERE auth_user_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.is_roster_admin()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_tool_access(text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_tools()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_tool_access()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_roster_admin()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.roster_admin_labels()    TO authenticated;
