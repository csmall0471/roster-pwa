-- ── Only known numbers can create a phone login ──────────────────────────────
-- Bots used the public phone sign-in to send paid texts to overseas numbers.
-- A new phone login must now belong to a parent on file or an invited tool
-- helper. Other sign-ups (Google, email) carry no phone and are unaffected.
--
-- After applying, turn it on: Supabase dashboard → Authentication → Hooks →
-- Before User Created → Postgres → public.hook_restrict_phone_signups

CREATE OR REPLACE FUNCTION public.hook_restrict_phone_signups(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  digits text := regexp_replace(COALESCE(event->'user'->>'phone', ''), '\D', '', 'g');
  key text;
BEGIN
  IF digits = '' THEN
    RETURN '{}'::jsonb;
  END IF;

  key := CASE
    WHEN length(digits) = 11 AND left(digits, 1) = '1' THEN right(digits, 10)
    WHEN length(digits) = 10 THEN digits
  END;

  IF key IS NOT NULL AND (
    EXISTS (SELECT 1 FROM tool_access WHERE phone_key = key)
    OR EXISTS (
      SELECT 1 FROM parents
      WHERE phone IS NOT NULL
        AND CASE
          WHEN regexp_replace(phone, '\D', '', 'g') ~ '^1[0-9]{10}$'
            THEN right(regexp_replace(phone, '\D', '', 'g'), 10)
          ELSE regexp_replace(phone, '\D', '', 'g')
        END = key
    )
  ) THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'This phone number is not on file. Contact your coach.'
  ));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hook_restrict_phone_signups(jsonb) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.hook_restrict_phone_signups(jsonb) TO supabase_auth_admin;
