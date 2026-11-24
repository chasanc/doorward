---
status: accepted
date: 2026-11-22
deciders: Hasan Hüse
relates-to: 0006-versioned-migrations
---

# The schema lives in two SQL packs, Postgres first, and the ORM never changes it

Doorward runs on PostgreSQL or SQL Server. Each has its own SQL pack (`db/postgres`, `db/mssql`) with the same
logical schema in each engine's types. Postgres is the golden pack. An install uses exactly one pack. TypeORM maps
the tables but runs with `synchronize: false`, so schema changes are SQL files, never ORM output.

Recorded afterwards from the repository at v0.1.1; reasons that the repository does not state are marked inferred.

## Context

- Operators bring their own database: Postgres or Supabase on one side, SQL Server or Azure SQL on the other.
- The schema is small (eleven tables in the `users` schema, no stored procedures), so keeping two copies is
  tractable.
- Both engines are exercised in CI (`e2e-postgres` and `e2e-mssql`), each with its own service container.

## Decision

### 1. One SQL pack per engine, same logical schema

`db/postgres` is the reference. `db/mssql` follows it with dialect types and quoting (`users."user"` against
`users.[user]`). Migrations carry the same numbers in both packs. Applying both packs to one instance is
unsupported. `DATABASE_KIND` picks the engine, and a kind that does not match the server is a startup error.

### 2. SQL is the schema source of truth

TypeORM runs with `synchronize: false`. Entities live in one folder and describe the tables; they do not create
them. `pnpm db:scaffold` compares the live table list with the entity list and fails if they differ.

### 3. No database-side logic

No stored procedures, triggers or engine-specific features beyond column types, check constraints and indexes
(for example the unique index on usernames of live users, filtered on `deleted_at IS NULL`). Business rules stay in the application.

### 4. IDs and timestamps come from the application

The application generates UUID v7 ids ([0008](0008-uuid-v7-ids.md)), so inserts do not depend on an engine's id
generator.

## Considered options

- **Postgres only.** Not chosen: an operator on SQL Server would have to run a second database for one service.
  Inferred.
- **Let TypeORM generate and migrate the schema (`synchronize`, or ORM migrations).** Rejected: the ORM's output
  differs by engine and gives no reviewable SQL, and `synchronize` can alter a production schema on boot.
- **One portable SQL dialect for both engines.** Not chosen: the engines differ in quoting, types and batching
  (SQL Server migrations are split on `GO`), so a lowest-common-denominator file would give up types on both.
  Inferred.
- **Stored procedures for Check.** Rejected: they would exist twice, once per dialect, and hide the rules from
  the code that tests them.

## Consequences

- **Every schema change is written twice** and must keep the same number in both packs. CI catches a missing
  engine only if a test touches it.
- **Uniqueness can differ at the edges.** Postgres makes usernames unique on `lower(username)`. The SQL Server
  index is on `username` itself, so whether `Ana` and `ana` collide there depends on the database collation
  (the default is case-insensitive).
- **Dialect bugs are possible** in anything that builds SQL by hand: the SQL Server driver once broke the API
  build and the migration lock had to be left out of the startup status check (see
  [0006](0006-versioned-migrations.md)).
- **Switching engines is a data move, not a flag.** `DATABASE_KIND` selects a pack that must already match.

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `db/postgres/`, `db/mssql/`,
`apps/api/src/infrastructure/database/`. Operator view: [docs/database.md](../database.md).
