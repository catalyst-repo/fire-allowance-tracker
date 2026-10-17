-- WORK-258 P2 DEV rollback. DESTRUCTIVE: removes roster user data; require separate approval.
drop table if exists fat.roster_stations;
drop table if exists fat.roster_day_work;
drop table if exists fat.roster_leave;
drop table if exists fat.roster_profiles;
