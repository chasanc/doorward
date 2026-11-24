---
status: accepted
date: 2026-11-24
deciders: Hasan Hüse
relates-to: 0007-deactivate-then-remove, 0003-rest-company
---

# The audit log is append-only and nothing removes rows from it

`users.audit_log` records every update, deactivation, activation and removal, in the same transaction as the
change. No code, job or setting deletes or trims it, so it grows for as long as the database lives. There is no
retention period.

Recorded afterwards from `docs/domain.md`, `0001_baseline.sql` and a search of the API for deletes against it.

## Context

- A removal deletes the row for good, so the log is the only record of what existed ([0007](0007-deactivate-then-remove.md)).
- The log must keep its history when users, groups or companies are removed, so it holds ids without foreign keys.
- Operators in regulated settings often have a retention rule of their own, and one number would not fit them.

## Decision

### 1. Keep everything

Rows are never updated or deleted by the application. A removal keeps a snapshot of the row, without password
hashes. Inserts are not audited, and password data is never written.

### 2. No foreign keys

`audit_log` stores `entity_id`, `actor_user_id` and `company_id` as plain UUIDs, so history survives removal of what
it describes. The same goes for `oidc_payload.user_id`.

### 3. Retention belongs to the operator

Doorward ships no purge job, setting or API. An operator who needs one runs SQL against the table. The indexes on
`created_date`, `(entity_type, entity_id)`, actor and company support that.

### 4. Reading is scoped like everything else

The admin console shows history per record. In multi-company mode REST reads only the signed-in company's rows
([0003](0003-rest-company.md)).

## Considered options

- **A retention setting (delete after N days).** Not chosen yet: a wrong default silently destroys the record of
  a removal. Inferred.
- **A built-in archive or export.** Not chosen: more surface for a need nobody has stated yet. Inferred.
- **Partition by month.** Not chosen: it would differ between the PostgreSQL and SQL Server packs
  ([0005](0005-two-sql-packs.md)). Inferred.

## Consequences

- **The table grows without bound.** Every change adds a row, and a removal adds a full snapshot. Plan disk and
  backups for it.
- **Personal data stays.** A removal snapshot holds names and emails, so the log can contradict an erasure request.
  Deleting those rows is a manual step.
- **A purge by hand loses the only record of removals.** Delete by date only after exporting what you need.
- **Reads slow down with size.** Per-record history uses the entity index, but a company-wide list scans by date.
- **A retention setting can be added later** without changing the table, since nothing depends on old rows.

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/api/src/application/audit.ts`,
`apps/api/src/application/lifecycle.ts`, `db/postgres/migrations/0001_baseline.sql`,
`db/mssql/migrations/0001_baseline.sql`.
