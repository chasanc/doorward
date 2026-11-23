-- Development reset only (never part of the migration runner). Apply against doorward, then
-- re-apply migrations/0001_baseline.sql and seed/default.sql:
--   psql -U postgres -d doorward -v ON_ERROR_STOP=1 -f db/postgres/dev/reset.sql
--
-- To drop the database itself (superuser, connected to postgres, not doorward):
--   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
--     WHERE datname = 'doorward' AND pid <> pg_backend_pid();
--   DROP DATABASE IF EXISTS doorward;

DROP SCHEMA IF EXISTS users CASCADE;
