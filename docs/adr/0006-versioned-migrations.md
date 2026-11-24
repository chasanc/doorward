---
status: accepted
date: 2026-11-23
deciders: Hasan Hüse
relates-to: 0005-two-sql-packs
---

# The schema changes only through numbered, forward-only migrations, and the API refuses a mismatched database

Each pack keeps its schema as `migrations/NNNN_name.sql`, applied in order and never edited once shipped. The runner
records each applied file with a checksum. At startup the API compares the database with the migrations it ships and
refuses to start when the database is behind or ahead.

This replaced the install scripts of the first release (`fef618e`, PR #2). Recorded afterwards; reasons the
repository does not state are marked inferred.

## Context

- The first release created the schema from a single install script. It had no record of what a database
  contained, so an upgrade could not tell "old" from "hand edited".
- An API that boots against the wrong schema fails late and in odd places, such as an unknown column on the first
  request that touches it.
- Operators run more than one API instance, and migrations can take a lock they must not fight over.

## Decision

### 1. Numbered files, forward-only, gapless

`0001_baseline.sql` is the schema as of the first versioned release. Later files add to it. The numbers are
gapless and identical in both packs. Fixing a shipped migration means a new numbered file. The runner refuses to
run when an applied file's checksum (ignoring line endings) has changed.

### 2. The database records its own version

`users.schema_migration` holds each applied version and checksum. `pnpm db:migrate` applies the pending files
under a database lock so two instances do not migrate at once. `pnpm db:migrate:status` exits `1` when the
database is behind or ahead.

### 3. The API checks, and does not migrate by default

At startup the API compares the database with the migrations it ships and refuses to start on a mismatch. The
check does not take the migration lock (on SQL Server it did, and broke the API start; `59e439c`).
`AUTO_MIGRATE=true` applies pending migrations on boot and `AUTO_SEED=true` seeds; production runs
`pnpm db:migrate` as its own release step, so a deploy cannot alter the schema while booting.

### 4. Adopting an install-script database

A database that has the eleven baseline tables but no `users.schema_migration` is adopted: `0001_baseline` is
recorded as applied without being run. Adoption checks table names, not columns.

### 5. CI proves "database ahead of code"

Each e2e job writes a throwaway migration with the next number, applies it, then removes it and expects
`db:migrate:status` to fail. The probe name is computed so real migrations do not collide with it.

## Considered options

- **Keep one install script.** Rejected: no upgrade path and no version record.
- **ORM-generated migrations.** Rejected with `synchronize` in [0005](0005-two-sql-packs.md): they are not
  reviewable SQL and differ by engine.
- **Migrate on every boot.** Rejected as the default: a rolling deploy would let any new instance change the
  schema under the ones still running. It stays available through `AUTO_MIGRATE`.
- **Reversible (down) migrations.** Not chosen: a rollback is a forward fix, which avoids untested down scripts.
  Inferred; the docs state forward-only without giving the reason.
- **Let the API start against a behind database and report it in `/api/health`.** Rejected: it fails later and
  less clearly than refusing to start.

## Consequences

- **No rollback.** A bad migration is fixed by the next one. Operators should take a backup before upgrading.
- **A database ahead of the code blocks a downgrade.** Rolling the API image back to an older version fails to
  start until the older code ships the same migrations.
- **Adoption is only as good as the table list.** A hand-edited database passes adoption if its table names match.
- **SQL Server runs a file as one transaction split on `GO`.** `GO 5`, or `GO` inside a comment or a string, is
  not supported.
- **Dev databases reset by script** (`dev/reset.sql`), which the runner never touches.

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/api/src/infrastructure/database/migrate/`,
`db/*/migrations/`, `.github/workflows/ci.yml` (migration probe). Operator view:
[docs/database.md](../database.md#migrations).
