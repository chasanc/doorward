---
status: accepted
date: 2026-11-22
deciders: Hasan Hüse
relates-to: 0004-allow-only-grants
---

# Records are deactivated first and removed only when nothing points at them; every change but an insert is audited

Companies, users, groups, permissions and scopes leave use in two steps. **Deactivate** sets `active = false` and
`deleted_at`, hides the row and removes its effect, and can be undone. **Remove** deletes a deactivated row that
nothing references. Every update, deactivation, activation and removal is written to `users.audit_log` in the
same transaction as the change. Inserts are not logged.

Recorded afterwards from [docs/domain.md](../domain.md#deactivating-and-removing-records) and the code.

## Context

- Sign-in and `Check` must stop honoring a person or a place the moment it is switched off, without losing the
  history that says who held what.
- Grants and memberships point at users, groups, scopes and permissions. A hard delete would leave dangling
  references or silently take access away.
- Operators need to answer "who changed this, and from where (REST or gRPC)?" long after the row is gone.

## Decision

### 1. Deactivate, then remove

Deactivate keeps the row and stamps `deleted_at`. Reads exclude deactivated rows unless asked
(`includeDeactivated`). Activate brings a row back, and fails if another live row has taken its unique name.
Remove is allowed only on a deactivated row with no references: no grants or memberships on a user or group, no
children or grants on a scope, no child records on a company, no grants on a permission.

### 2. Uniqueness applies to live rows

Unique names (usernames, keys, permission names) are enforced on rows with `deleted_at IS NULL`, so a name can
be reused after deactivation.

### 3. Grants and memberships are deleted outright

They have no lifecycle of their own. Their removal is audited like any other change.

### 4. One audit path, in the same transaction

`runAudited` runs the change and its audit row in one transaction; an audit failure rolls the change back. A
removal writes a `remove` entry with a snapshot of the row minus password hashes, the actor and the source.
Password hashes never appear in `audit_log`. `audit_log` and `oidc_payload.user_id` carry no foreign keys, so the
history survives deletions. A unique violation inside the transaction becomes `already_exists`. One update skips
this path: a successful local sign-in that rehashes an old argon2 hash writes `password_hash` with a plain
`UPDATE` and no audit row. A password change through the API is audited, with an empty payload.

### 5. Inserts are not audited

A new row's existence and creation time are on the row itself. Only changes to existing state need a trail.

## Considered options

- **Hard delete only.** Rejected: access would vanish with no way back, and references would have to be cleaned up
  by hand.
- **Soft delete only, never remove.** Not chosen: personal data and names would stay forever. Inferred.
- **Audit by database trigger.** Rejected with [0005](0005-two-sql-packs.md): it would exist per engine and hide
  who (the actor) from the database.
- **Audit inserts too.** Not chosen: it roughly doubles audit volume for rows whose creation is already visible.
  Inferred; the docs state the rule, not the reason.

## Consequences

- **The audit log does not show who created a row.** A creator is only known from application logs, if at all.
- **Removing needs a clean-up order.** Remove grants and memberships first, then deactivate, then remove. A
  scope cannot be deactivated while it has active children.
- **Reactivation can fail** when a live row has taken the name.
- **The audit table grows without bound.** There is no retention or pruning job.
- **Changes made by a directory sync** are audited with the signed-in user as the actor
  ([0001](0001-ldap-sign-in.md)).

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/api/src/application/audit.ts`,
`apps/api/src/application/lifecycle.ts`.
