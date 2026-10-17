-- WORK-258 P2 least-privilege correction. DEV only; separate governed migration.
-- Identity provisioner fat_service must never manage member roster data.
do $tighten$
declare t text;
begin
  foreach t in array array['roster_profiles','roster_leave','roster_day_work','roster_stations'] loop
    execute format('revoke all on fat.%I from fat_service',t);
    execute format('drop policy if exists roster_service on fat.%I',t);
  end loop;
end $tighten$;
