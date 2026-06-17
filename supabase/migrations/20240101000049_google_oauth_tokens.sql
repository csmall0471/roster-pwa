-- Persist the Google OAuth refresh token so Gmail access survives past the ~1h
-- access-token expiry. Supabase only hands the provider tokens to us once (at the
-- auth callback) and never refreshes the Google access token itself, so we store
-- the durable refresh token and exchange it for a fresh access token on demand.
-- Only the coach signs in with Google, so this holds a single row.
create table if not exists google_oauth_tokens (
  user_id       uuid        primary key references auth.users(id) on delete cascade,
  refresh_token text        not null,
  updated_at    timestamptz not null default now()
);

alter table google_oauth_tokens enable row level security;

-- Each user reads/writes only their own token (the callback upserts it as them,
-- the Gmail action reads it as them).
create policy "own_google_token" on google_oauth_tokens
  for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());
