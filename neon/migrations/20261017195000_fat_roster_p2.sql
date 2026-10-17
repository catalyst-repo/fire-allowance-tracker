-- WORK-258 P2, Neon DEV only. Never apply to main or Supabase.
-- Strictly additive. Execute only after governance-v2 backend preflight allows this exact change.
create table fat.roster_profiles (
  user_id uuid primary key references fat.app_identities(id) on delete cascade,
  platoon text not null check (platoon in ('A','B','C','D','Z')),
  timezone text not null default 'Australia/Melbourne' check (timezone = 'Australia/Melbourne'),
  updated_at timestamptz not null default now()
);
create table fat.roster_leave (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references fat.app_identities(id) on delete cascade,
  period text not null check (length(trim(period)) between 1 and 120),
  starting_roster_block integer not null,
  start_date date not null,
  end_date date not null,
  check (end_date >= start_date)
);
create table fat.roster_day_work (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references fat.app_identities(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  check (end_at > start_at)
);
create table fat.roster_stations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references fat.app_identities(id) on delete cascade,
  station_id integer not null check (station_id between 1 and 96),
  effective_from date not null,
  effective_to date,
  temporary boolean not null default false,
  one_shift_relief boolean not null default false,
  roster_block integer,
  check (effective_to is null or effective_to >= effective_from),
  check (not one_shift_relief or (temporary and effective_to = effective_from))
);
create index roster_leave_user_dates_idx on fat.roster_leave(user_id,start_date,end_date);
create index roster_day_work_user_start_idx on fat.roster_day_work(user_id,start_at);
create index roster_stations_user_dates_idx on fat.roster_stations(user_id,effective_from,effective_to);
do $rls$
declare t text;
begin
  foreach t in array array['roster_profiles','roster_leave','roster_day_work','roster_stations'] loop
    execute format('alter table fat.%I enable row level security',t);
    execute format('alter table fat.%I force row level security',t);
    execute format('create policy roster_owner on fat.%I for all to fat_app using (user_id=fat.current_app_user_id()) with check (user_id=fat.current_app_user_id())',t);
    execute format('create policy roster_service on fat.%I for all to fat_service using (true) with check (true)',t);
    execute format('revoke all on fat.%I from public',t);
    execute format('grant select,insert,update,delete on fat.%I to fat_app',t);
    execute format('grant select,insert,update,delete on fat.%I to fat_service',t);
  end loop;
end $rls$;
