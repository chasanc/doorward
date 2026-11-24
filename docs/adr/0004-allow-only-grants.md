---
status: accepted
date: 2026-11-22
deciders: Hasan Hüse
relates-to: 0003-rest-company
---

# Access is recorded only as allow-only grants to users or flat groups, at a scope tree node

Every answer Doorward gives to "may this user have this permission here?" traces to one `grant` row, or to none.
There are no deny rules, no nested groups and no roles between a user and a permission. A grant ties a permission
to one user or one group, either company-wide or at a node of a scope tree, and a grant at a node also covers its
descendants.

This is a record of a decision taken at the first release (v0.1.0), written afterwards from the schema, the code
and [docs/domain.md](../domain.md#rules). Where the reason is a guess it says so.

## Context

- Apps that reuse Doorward ask one question, `Check`, and want to log or show why it succeeded.
- Places matter as much as capabilities: "approve invoices" differs by customer area, plant or region, and a
  flat permission list cannot say that.
- Operators have to read the result: a support person must be able to open one user and see where access comes
  from.

## Decision

### 1. One table records access

`users."grant"` holds a permission, exactly one of `user_id` or `group_id`, and an optional `scope_id`. A null
scope means company-wide. Nothing else gives access. The admin permission `doorward.admin` is an ordinary grant,
checked like any other, so sign-in itself needs no permission ([domain rule 1](../domain.md#rules)).

### 2. Allow-only

There are no deny rules. Access is a matching grant or nothing. A positive `Check` returns the grant that matched
(id, subject, scope), so every allowed answer can be explained.

### 3. Groups are flat

A group holds users and never other groups. A user's access is their own grants plus those of every active group
they belong to. A user can only join groups of their own company.

### 4. Scopes form a tree; grants inherit downward

A grant at scope `S` applies to `S` and every descendant. A `Check` with no scope counts company-wide grants
only, so a grant tied to `Berlin` never satisfies a question asked without a place.

### 5. Deactivated records have no effect

Inactive or deleted users, groups, scopes, permissions and companies are ignored by sign-in and `Check`
([0007](0007-deactivate-then-remove.md) covers the lifecycle).

## Considered options

- **Deny rules (allow and deny, with precedence).** Rejected: a result then depends on rule order, and "why was
  this allowed?" no longer has one grant as its answer.
- **Nested groups.** Rejected: flat groups keep "why does this user have access" to one hop. Inferred; the code
  and docs state the rule but not the alternatives that were weighed.
- **Roles as a layer between users and permissions.** Not chosen: a group already plays that part, so a role
  would be a second thing to administer. Inferred.
- **Scope as a column on the permission (no tree).** Rejected: the same permission would need one copy per place,
  and "Germany covers Berlin" would mean listing every city.
- **A separate "can sign in" permission.** Rejected ([domain rule 1](../domain.md#rules)): any app can reuse
  Doorward for sign-in, so identity is checked and permissions are asked about separately.

## Consequences

- **No exceptions.** You cannot say "everyone in this group except Ana". The workaround is a second group.
- **Wide grants are easy to make.** A company-wide grant covers every scope, and a grant at a parent covers
  every descendant, so a broad grant reaches further than its holder may expect.
- **A scope tree needs care.** A bad parent choice changes where access applies for every grant beneath it.
  Deactivating a scope needs its children deactivated first.
- **Checks read several tables.** A `Check` joins grants, group memberships and the scope ancestry; there is no
  precomputed access table to go stale.
- **Everything about a grant is in one place.** Audit, removal and the "no grants on a user" rule before removal
  all work against the same table.

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/api/src/application/access.service.ts`,
`apps/api/src/application/grants.service.ts`, `db/postgres/migrations/0001_baseline.sql`.
