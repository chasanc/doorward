# Database

Doorward stores all data in eleven tables inside the `users` schema. There are no stored procedures.

## Design

Keys and foreign keys only. `user` and `grant` are quoted in SQL because those words are reserved. A `grant` row has exactly one of `user_id` or `group_id`. A null `scope_id` means the grant is company-wide. `audit_log` and `oidc_payload.user_id` store ids but have no foreign key.

```mermaid
erDiagram
  company ||--o{ user : company_id
  company ||--o{ user_group : company_id
  company ||--o{ permission : company_id
  company ||--o{ scope : company_id
  company ||--o{ oidc_client : company_id
  user ||--o{ user_group_member : user_id
  user_group ||--o{ user_group_member : group_id
  user |o--o{ grant : user_id
  user_group |o--o{ grant : group_id
  permission ||--o{ grant : permission_id
  scope |o--o{ grant : scope_id
  scope |o--o{ scope : parent_id
  user ||--o| user_totp : user_id

  company {
    uuid id PK
    varchar company_key UK
  }
  user {
    uuid id PK
    uuid company_id FK
    varchar user_key UK
    text username
  }
  user_group {
    uuid id PK
    uuid company_id FK
    text name
  }
  user_group_member {
    uuid user_id PK
    uuid group_id PK
  }
  permission {
    uuid id PK
    uuid company_id FK
    varchar name UK
  }
  scope {
    uuid id PK
    uuid company_id FK
    uuid parent_id FK
  }
  grant {
    uuid id PK
    uuid user_id FK
    uuid group_id FK
    uuid permission_id FK
    uuid scope_id FK
  }
  audit_log {
    bigint audit_log_id PK
    uuid company_id
    varchar entity_type
    uuid entity_id
    uuid actor_user_id
  }
  oidc_client {
    uuid id PK
    uuid company_id FK
    varchar client_id UK
  }
  oidc_payload {
    varchar model PK
    varchar id PK
    uuid user_id
  }
  user_totp {
    uuid user_id PK
  }
```

## Choosing a SQL pack

Pick **one** SQL pack matching your database engine:

- [`db/postgres`](../db/postgres) — PostgreSQL / Supabase (primary reference schema)
- [`db/mssql`](../db/mssql) — SQL Server / Azure SQL

Never apply both packs to the same database instance. TypeORM runs with `synchronize: false`, so the ORM never alters the schema. Changes arrive only through numbered migration files. After changing the SQL schema, run `pnpm db:scaffold` to verify that the TypeORM entities match the live `users` tables.

## Migrations

Each pack keeps its schema in `migrations/NNNN_name.sql`. Files are forward-only and numbered the same way in both packs. A file that has been released is never edited; a mistake is fixed by the next file. `0001_baseline.sql` is the full schema as of the first versioned release.

| Command | What it does |
| --- | --- |
| `pnpm db:migrate` | Applies every pending migration. Safe to run again; instances take a database lock so two never migrate at once. |
| `pnpm db:migrate:status` | Lists applied and pending migrations. Exits with `1` if the database is behind or ahead. |
| `pnpm db:seed` | On an empty database, creates the default company, groups, scope and `doorward.admin` permission. Then creates the admin user if nobody holds `doorward.admin`. |

Applied versions are recorded in `users.schema_migration` with a checksum of each file. The runner refuses to continue if an applied file was edited. Line endings are ignored in the checksum.

**At API start.** The API compares the database with the migrations it ships. If the database is behind or ahead, it refuses to start and says so, and `/api/health` reports the `schemaVersion` it found. Set `AUTO_MIGRATE=true` to apply pending migrations at start instead (and `AUTO_SEED=true` for the seed); see [environment.md](environment.md). In production, run `pnpm db:migrate` as a separate step (a one-off container or release job) so a deploy cannot change the schema unattended.

**Existing databases.** A database created with the old install scripts has the `users` tables but no `users.schema_migration`. The first `pnpm db:migrate` checks that it has exactly the eleven baseline tables, then records `0001_baseline` as applied without running it. Adopting trusts that the tables came from the old script; it compares table names, not columns. If you changed a table by hand, compare it with `0001_baseline.sql` before adopting.

**SQL Server.** Files are split on lines holding only `GO`, and the whole run is one transaction. The runner does not understand `GO 5`, or a `GO` line inside a block comment or string.

## Schema conventions

- **Database and schema:** The default database name is `doorward`, and all tables live in the `users` schema using `snake_case` names.
- **Reserved table names:** `user` and `grant` are reserved SQL keywords, so they are always quoted (`users."user"` and `users."grant"` in PostgreSQL; `users.[user]` and `users.[grant]` in SQL Server).
- **Primary keys:** The application generates UUID v7 strings for all record IDs.
- **Terminology:** Capabilities are stored in `permission` (never `asset`). The `grant` table links a user or a user group to a permission, optionally scoped to a node in the `scope` tree.
- **No legacy upgrade path:** There is no migration script from the older 16-table layout. To reset a development database, run `dev/reset.sql` from the pack (it is never part of the runner), then `pnpm db:migrate` and `pnpm db:seed`.

## Initial seed data

`pnpm db:seed` creates the same starting records for both engines:

- **Company:** `Default`
- **Root scope:** `Application`
- **Groups:** `Admin` and `Everyone`
- **Admin user:** `DOORWARD_ADMIN_USERNAME` (default `admin`) with `DOORWARD_ADMIN_PASSWORD`, hashed with argon2id, granted the company-wide `doorward.admin` permission

The admin is created by the runner, not by a SQL file, and only if nobody holds `doorward.admin`. With `NODE_ENV=production` an empty password or `changeme` is refused. Local setup (`write-local-env.mjs`) and the Compose demo use `changeme`; change it before exposing the database or API to a shared network.

## Connecting the API

Configure the database engine and connection string in `apps/api/.env`:

```env
DATABASE_KIND=postgres   # or mssql
DATABASE_URL=postgresql://doorward:doorward@localhost:5432/doorward   # or mssql://...
```

If `DATABASE_KIND` does not match the database server you connect to, the API refuses to start.
