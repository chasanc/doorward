-- Create the dedicated PostgreSQL database and demo role.
-- Apply as a superuser against the maintenance database (usually postgres):
--   psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/postgres/bootstrap/01_create_database.sql
--
-- Hosted Postgres / Supabase: skip this file. Point DATABASE_URL at the
-- provisioned database and start at migrations/0001_baseline.sql.
--
-- Local demo credentials match DATABASE_URL=postgresql://doorward:doorward@localhost:5432/doorward
-- Change the role password before any shared or production use.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'doorward') THEN
    CREATE ROLE doorward LOGIN PASSWORD 'doorward';
  END IF;
END
$$;

SELECT 'CREATE DATABASE doorward OWNER doorward ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'doorward')\gexec

GRANT ALL PRIVILEGES ON DATABASE doorward TO doorward;
