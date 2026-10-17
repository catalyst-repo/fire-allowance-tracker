-- WORK-258 rollback for the privilege tightening (requires independent security approval).
-- Reintroduces wider fat_service privilege and should normally NOT be executed.
do $undo$
declare t text;
begin
  foreach t in array array['roster_profiles','roster_leave','roster_day_work','roster_stations'] loop
    execute format('create policy roster_service on fat.%I for all to fat_service using (true) with check (true)',t);
    execute format('grant select,insert,update,delete on fat.%I to fat_service',t);
  end loop;
end $undo$;
