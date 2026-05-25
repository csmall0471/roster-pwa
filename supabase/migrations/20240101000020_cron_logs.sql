create table cron_logs (
  id           uuid        primary key default gen_random_uuid(),
  ran_at       timestamptz not null default now(),
  target_date  text        not null,
  dry_run      boolean     not null default false,
  snack_count  int         not null default 0,
  training_count int       not null default 0,
  summary_sent boolean     not null default false,
  error        text
);
