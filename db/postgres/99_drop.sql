-- Optional reset. Apply against doorward, then re-run 03 and 04:
--   psql -U postgres -d doorward -v ON_ERROR_STOP=1 -f db/postgres/99_drop.sql
--
-- To drop the database itself (superuser, connected to postgres, not doorward):
--   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
--     WHERE datname = 'doorward' AND pid <> pg_backend_pid();
--   DROP DATABASE IF EXISTS doorward;

DROP SCHEMA IF EXISTS users CASCADE;
