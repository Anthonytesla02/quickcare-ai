create table public.global_cases (
  id text primary key,
  category text not null,
  title text not null,
  case_data jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select, insert on public.global_cases to authenticated;
grant all on public.global_cases to service_role;
alter table public.global_cases enable row level security;
create policy "Signed-in users read shared cases" on public.global_cases for select to authenticated using (true);
create policy "Signed-in users add shared cases" on public.global_cases for insert to authenticated with check (created_by = auth.uid());

create table public.user_case_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  case_id text not null,
  score integer not null default 0,
  result jsonb,
  created_at timestamptz not null default now()
);
create index on public.user_case_attempts (user_id, case_id);
grant select, insert, delete on public.user_case_attempts to authenticated;
grant all on public.user_case_attempts to service_role;
alter table public.user_case_attempts enable row level security;
create policy "Own attempts read" on public.user_case_attempts for select to authenticated using (user_id = auth.uid());
create policy "Own attempts insert" on public.user_case_attempts for insert to authenticated with check (user_id = auth.uid());
create policy "Own attempts delete" on public.user_case_attempts for delete to authenticated using (user_id = auth.uid());

create table public.user_progress (
  user_id uuid primary key,
  profile jsonb,
  dashboard_case_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.user_progress to authenticated;
grant all on public.user_progress to service_role;
alter table public.user_progress enable row level security;
create policy "Own progress read" on public.user_progress for select to authenticated using (user_id = auth.uid());
create policy "Own progress insert" on public.user_progress for insert to authenticated with check (user_id = auth.uid());
create policy "Own progress update" on public.user_progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());