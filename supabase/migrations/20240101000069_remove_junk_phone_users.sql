-- ── Remove login rows the bots created ───────────────────────────────────────
-- Run AFTER 068. Each bot number left a login row behind, and the hook only
-- covers NEW logins, so these rows could still be texted.
--
-- This permanently deletes rows. Removes only phone logins that never verified
-- a code or signed in, have no email, aren't linked to anyone, and don't match a
-- parent or helper. Run the SELECT by itself first and check the list.

WITH junk AS (
  SELECT u.id, u.phone, u.created_at
  FROM auth.users u
  WHERE u.phone IS NOT NULL AND u.phone <> ''
    AND u.phone_confirmed_at IS NULL
    AND u.last_sign_in_at IS NULL
    AND COALESCE(u.email, '') = ''
    AND NOT EXISTS (SELECT 1 FROM parent_auth pa WHERE pa.auth_user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM tool_access ta WHERE ta.auth_user_id = u.id)
    AND public.hook_restrict_phone_signups(
      jsonb_build_object('user', jsonb_build_object('phone', u.phone))
    ) ? 'error'
)
SELECT * FROM junk ORDER BY created_at;

-- Then remove the leading "--" from the statement below and run this whole file:
--
-- DELETE FROM auth.users WHERE id IN (
--   SELECT u.id FROM auth.users u
--   WHERE u.phone IS NOT NULL AND u.phone <> ''
--     AND u.phone_confirmed_at IS NULL
--     AND u.last_sign_in_at IS NULL
--     AND COALESCE(u.email, '') = ''
--     AND NOT EXISTS (SELECT 1 FROM parent_auth pa WHERE pa.auth_user_id = u.id)
--     AND NOT EXISTS (SELECT 1 FROM tool_access ta WHERE ta.auth_user_id = u.id)
--     AND public.hook_restrict_phone_signups(
--       jsonb_build_object('user', jsonb_build_object('phone', u.phone))
--     ) ? 'error'
-- );
