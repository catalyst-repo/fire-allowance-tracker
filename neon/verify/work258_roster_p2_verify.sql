-- WORK-258 P2 read-only catalog proof on Neon DEV only.
select n.nspname as schema_name,c.relname as table_name,c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='fat' and c.relname in ('roster_profiles','roster_leave','roster_day_work','roster_stations')
order by c.relname;
select tablename,policyname,roles,cmd,qual,with_check
from pg_policies
where schemaname='fat' and tablename in ('roster_profiles','roster_leave','roster_day_work','roster_stations')
order by tablename,policyname;
