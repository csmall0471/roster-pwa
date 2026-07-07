-- Let a draft be earmarked for a specific kid without publishing it. The draft
-- stays in card_drafts (never written to player_photos), so it does NOT appear
-- on the kid's profile or the team's Cards tab until it's saved as a real card.
-- ON DELETE SET NULL: removing a player/team just clears the earmark, keeping
-- the draft around.

alter table card_drafts
  add column if not exists player_id uuid references players(id) on delete set null,
  add column if not exists team_id   uuid references teams(id)   on delete set null;

create index if not exists idx_card_drafts_player on card_drafts (player_id);
