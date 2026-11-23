# Database

Doorward stores all data in eleven tables inside the `users` schema, with no stored procedures.

## Design

The schema uses plain primary and foreign keys. `user` and `grant` are reserved SQL keywords, so the SQL quotes them. Each `grant` row points to either a `user_id` or a `group_id`, never both, and a null `scope_id` marks a company-wide grant. `audit_log` and `oidc_payload.user_id` store UUIDs without foreign-key constraints so audit history and sessions stay decoupled from deletions.

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

Pick **one** SQL pack for your database engine:

- [`db/postgres`](../db/postgres): PostgreSQL / Supabase (primary reference schema)
- [`db/mssql`](../db/mssql): SQL Server / Azure SQL

Never apply both packs to the same database. TypeORM runs with `synchronize: false`, so the ORM does not alter the schema; changes arrive through numbered migration files. After editing the SQL schema, run `pnpm db:scaffold` to confirm the TypeORM entities match the live `users` tables.

## Migrations

Each pack keeps its schema in `migrations/NNNN_name.sql`. Migrations are forward-only and share the same numbering across both packs. Once a migration file ships, leave it untouched and fix mistakes in the next numbered file. `0001_baseline.sql` contains the full schema as of the first versioned release.

| Command | What it does |
| --- | --- |
| `pnpm db:migrate` | Applies pending migrations. Safe to re-run; the runner takes a database lock so two instances do not migrate at once. |
| `pnpm db:migrate:status` | Lists applied and pending migrations, exiting with `1` if the database is behind or ahead. |
| `pnpm db:seed` | Creates the default company, groups, scope, and `doorward.admin` permission on an empty database, then creates the admin user if nobody holds `doorward.admin`. |

The runner records applied versions and file checksums in `users.schema_migration`, ignoring line-ending differences. If an applied file has been edited, the runner stops with an error.

**At API startup:** The API compares the database against the migrations it ships. If the database is behind or ahead, the API refuses to start and prints the mismatch, and `/api/health` reports the `schemaVersion` seen at startup. You can set `AUTO_MIGRATE=true` to apply pending migrations on boot (and `AUTO_SEED=true` to seed); see [environment.md](environment.md). In production, run `pnpm db:migrate` as its own release step so a deploy cannot alter the schema on boot.

**Adopting an existing database:** A database created with the older install scripts has the `users` tables but no `users.schema_migration` table. The first `pnpm db:migrate` checks that the database contains the eleven baseline tables and records `0001_baseline` as applied without running it. Because adoption checks table names rather than individual columns, compare any hand-edited tables against `0001_baseline.sql` before adopting.

**SQL Server batch splitting:** The runner splits migration files on lines containing only `GO` and wraps the run in one transaction. It does not support `GO 5` or `GO` lines inside block comments or string literals.

## Schema conventions

- **Database and schema:** The default database name is `doorward`, and all tables live in the `users` schema with `snake_case` names.
- **Reserved table names:** `user` and `grant` are reserved SQL keywords, so queries quote them (`users."user"` and `users."grant"` in PostgreSQL; `users.[user]` and `users.[grant]` in SQL Server).
- **Primary keys:** The application generates UUID v7 strings for all record IDs.
- **Terminology:** Capabilities live in `permission` (never `asset`). The `grant` table links a user or user group to a permission, either company-wide or at a node in the `scope` tree.
- **Resetting a dev database:** There is no upgrade path from the older 16-table layout. To wipe and rebuild a local database, run `dev/reset.sql` from your pack (the migration runner never touches it), then run `pnpm db:migrate` and `pnpm db:seed`.

## Initial seed data

`pnpm db:seed` creates the same starting records on both engines:

- **Company:** `Default`
- **Root scope:** `Application`
- **Groups:** `Admin` and `Everyone`
- **Admin user:** `DOORWARD_ADMIN_USERNAME` (default `admin`) with `DOORWARD_ADMIN_PASSWORD`, hashed with argon2id and granted company-wide `doorward.admin`

The seed runner creates the admin account in code rather than SQL, and only when nobody holds `doorward.admin`. Under `NODE_ENV=production`, the runner refuses an empty password or `changeme`. Local setup (`write-local-env.mjs`) and the Compose demo use `changeme`; change it before exposing the database or API to a shared network.

## Connecting the API

Set the database engine and connection string in `apps/api/.env`:

```env
DATABASE_KIND=postgres   # or mssql
DATABASE_URL=postgresql://doorward:doorward@localhost:5432/doorward   # or mssql://...
```

If `DATABASE_KIND` does not match the database server you connect to, the API refuses to start.
