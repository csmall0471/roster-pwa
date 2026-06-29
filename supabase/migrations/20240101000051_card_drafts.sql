-- Card drafts: cards the owner builds with player/team info typed in, saved
-- WITHOUT attaching to a real players row (player_photos requires a player_id).
-- Lets the owner prep cards for players that aren't assigned yet, then reopen
-- and finish or assign them later. Owner-scoped, like the other coach data.

create table if not exists card_drafts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  label       text,        -- player name typed on the card
  team_name   text,
  season      text,
  front_url   text,        -- rendered front PNG (for the drafts list thumbnail)
  back_url    text,
  card_design jsonb       not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_card_drafts_user on card_drafts (user_id, updated_at desc);

alter table card_drafts enable row level security;

-- Each user reads/writes only their own drafts.
create policy "own_card_drafts" on card_drafts
  for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());
