# PostgreSQL pack (`doorward`)

Integrator scripts for PostgreSQL or Supabase. This folder is the golden schema.
SQL Server is a later dialect copy of the same logical model. Never apply
`db/mssql` to a PostgreSQL instance, and never apply this folder to SQL Server.

## Layout

| Path | Purpose |
| --- | --- |
| `bootstrap/01_create_database.sql` | Creates the `doorward` role and database. Self-hosted only; skip on hosted Postgres / Supabase. |
| `migrations/NNNN_name.sql` | Schema, applied in number order. `0001_baseline.sql` is the full schema. |
| `seed/default.sql` | Demo data for a fresh database. |
| `dev/reset.sql` | Drops the `users` schema. Development only. |

## Apply order (psql)

```bash
psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/postgres/bootstrap/01_create_database.sql
psql -U doorward -d doorward -v ON_ERROR_STOP=1 -f db/postgres/migrations/0001_baseline.sql
psql -U doorward -d doorward -v ON_ERROR_STOP=1 -f db/postgres/seed/default.sql
```

Hosted Postgres / Supabase: skip `bootstrap/01_create_database.sql`. Connect to
the provisioned database and apply the migrations in number order, then the seed.

Development reset (drops `users` only):

```bash
psql -U postgres -d doorward -v ON_ERROR_STOP=1 -f db/postgres/dev/reset.sql
```

Then re-apply `0001_baseline.sql` and `seed/default.sql`.

## Writing a migration

- Forward-only, and immutable once released. Fix a mistake with a new file.
- Name it `NNNN_snake_case.sql`, the next number after the highest one.
- Add the same number with the same meaning to `db/mssql/migrations`.

## Nest connection

```
DATABASE_KIND=postgres
DATABASE_URL=postgresql://doorward:doorward@localhost:5432/doorward
```

`bootstrap/01_create_database.sql` creates role `doorward` / password `doorward` for local demo only.
Change that password before any shared host.

## Demo admin

| Field | Value |
| --- | --- |
| `username` | `admin` |
| password | `changeme` |
| `user_key` | `df47d4ff-cdb2-4fee-ae68-b0f4bfbf5372` |
| `password_hash` | argon2id PHC string (`$argon2id$v=19$m=65536,t=3,p=4$...`) |

The salt lives inside the PHC string. The admin console also requires the
seeded company-wide `doorward.admin` grant.

`users."user"` and `users."grant"` are quoted because both are reserved in
PostgreSQL. Every other identifier is unquoted snake_case. Ids are UUID v7; the
seed uses fixed ids.
