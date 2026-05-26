create table if not exists user_activity (
  id         uuid        primary key default gen_random_uuid(),
  parent_id  uuid        references parents(id) on delete cascade,
  event      text        not null,
  metadata   jsonb,
  created_at timestamptz not null default now()
);

create index user_activity_parent_id_idx  on user_activity(parent_id);
create index user_activity_created_at_idx on user_activity(created_at desc);

-- Coach can read all activity
alter table user_activity enable row level security;

create policy "coach_read_activity" on user_activity
  for select using (
    exists (
      select 1 from teams where user_id = auth.uid()
    )
  );

create policy "service_insert_activity" on user_activity
  for insert with check (true);
