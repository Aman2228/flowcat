-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- (If you ran the earlier sign-in version, its table `flow_state` is unused now.
--  You can remove it with:  drop table if exists public.flow_state;)

-- ONE shared row holds the whole planner as JSON. The check constraint means
-- no other row can ever exist.
create table if not exists public.flow_planner_state (
  id         text primary key default 'main' check (id = 'main'),
  data       jsonb not null,
  device_id  text,
  updated_at timestamptz not null default now()
);

-- No login, so the public (anon) key may read and write that one row, and
-- nothing else: no other tables, no deleting.
alter table public.flow_planner_state enable row level security;

create policy "read the plan"
  on public.flow_planner_state for select to anon, authenticated
  using (id = 'main');

create policy "create the plan"
  on public.flow_planner_state for insert to anon, authenticated
  with check (id = 'main');

create policy "update the plan"
  on public.flow_planner_state for update to anon, authenticated
  using (id = 'main') with check (id = 'main');

-- The server stamps updated_at, so devices with wrong clocks can't confuse sync.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger flow_planner_touch
  before update on public.flow_planner_state
  for each row execute function public.touch_updated_at();

-- Lets other open devices hear about changes instantly.
alter publication supabase_realtime add table public.flow_planner_state;
