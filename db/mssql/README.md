# SQL Server pack (`doorward`)

Integrator scripts for SQL Server or Azure SQL. This folder is a dialect copy
of the golden PostgreSQL schema. Never apply `db/postgres` to a SQL Server
instance, and never apply this folder to PostgreSQL.

## Layout

| Path | Purpose |
| --- | --- |
| `bootstrap/01_create_database.sql` | Creates the `doorward` login and database. Self-hosted only; skip on Azure SQL / hosted. |
| `migrations/NNNN_name.sql` | Schema, applied in number order. `0001_baseline.sql` is the full schema. |
| `seed/default.sql` | Demo data for a fresh database. |
| `dev/reset.sql` | Drops the `users` tables and schema. Development only. |

## Apply order (sqlcmd)

```bash
sqlcmd -S localhost -U sa -C -b -i db/mssql/bootstrap/01_create_database.sql
sqlcmd -S localhost -U doorward -P doorward -d doorward -C -b -i db/mssql/migrations/0001_baseline.sql
sqlcmd -S localhost -U doorward -P doorward -d doorward -C -b -i db/mssql/seed/default.sql
```

`-b` aborts on error (same role as `psql -v ON_ERROR_STOP=1`). `-C` trusts the
server certificate (sqlcmd 18+). Adjust `-S` / credentials for your instance.

Azure SQL / hosted: skip `bootstrap/01_create_database.sql`. Connect to the
provisioned database and apply the migrations in number order, then the seed.

Development reset (drops `users` only):

```bash
sqlcmd -S localhost -U sa -d doorward -C -b -i db/mssql/dev/reset.sql
```

Then re-apply `0001_baseline.sql` and `seed/default.sql`.

## Writing a migration

- Forward-only, and immutable once released. Fix a mistake with a new file.
- Name it `NNNN_snake_case.sql`, the next number after the highest one.
- Add the same number with the same meaning to `db/postgres/migrations`.
- Batches are separated by a line containing only `GO`.

## Nest connection

```
DATABASE_KIND=mssql
DATABASE_URL=mssql://doorward:doorward@localhost:1433/doorward
```

`bootstrap/01_create_database.sql` creates login `doorward` / password `doorward` for local demo only.
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

`users.[user]` and `users.[grant]` are quoted because both are reserved in
SQL Server. Every other identifier is unquoted snake_case. Ids are UUID v7
(`uniqueidentifier`); the seed uses fixed ids.
