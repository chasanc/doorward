---
status: accepted
date: 2026-11-22
deciders: Hasan Hüse
relates-to: 0005-two-sql-packs
---

# Row ids are UUID v7 made by the application; the keys people share are random

Every record id the application inserts is a UUID v7 string. `users.audit_log.audit_log_id` is a `bigserial`,
and `users.oidc_payload` is keyed by the provider's `(model, id)`. The columns that leave the system and are not
v7 are `user_key`, `company_key` and `scope_key`: random v4 UUIDs, so a shared value does not reveal when the
row was created.

Recorded afterwards from the code (`apps/api/src/application/ids.ts`) and `CONTEXT.md`.

## Context

- Two engines ([0005](0005-two-sql-packs.md)) have different ways to make ids. A key made in the application
  works the same on both.
- Random UUIDs scatter inserts across a b-tree index. Ids that start with a timestamp keep recent rows together
  and sort by creation time.
- Integrating apps hold `company_key` and `user_key`, and a creation time inside them would be a small leak.

## Decision

### 1. UUID v7 for record ids the application inserts

`uuidv7()` puts a 48-bit millisecond timestamp first, then random bits, with the version and variant bits set.
Companies, users, groups, permissions, scopes, grants and OIDC clients get that id before insert. Those ids sort
by creation time, to the millisecond. The audit log's primary key is a database identity column. An OIDC payload
row keeps the id the provider assigned.

### 2. Random v4 for the shared keys

`user_key`, `company_key` and `scope_key` are the stable identifiers apps send in metadata and tokens. They are
generated with `randomUUID()` and carry no time.

### 3. Ids are strings everywhere

Proto fields, REST bodies and entities carry the id as a string. Lookups lower-case a supplied id before
comparing it.

### 4. The nil UUID matches nothing

`00000000-0000-0000-0000-000000000000` is used as the company id of a call that named no company or an unknown
one, so a lookup fails closed ([0003](0003-rest-company.md)).

## Considered options

- **Database-generated ids** (identity columns or `gen_random_uuid()` / `NEWSEQUENTIALID()`). Not chosen: the
  engines differ, and the application would learn an id only after the insert. Inferred.
- **Random v4 for everything.** Not chosen: index locality and creation-time ordering are lost. Inferred.
- **Integer keys.** Not chosen: they are guessable and collide when two installs are merged. Inferred.
- **v7 for the shared keys too.** Rejected: it would put a creation time in a value apps hold.

## Consequences

- **Ids reveal creation time** to anyone who sees one. Do not treat an id as secret; `user_key`, `company_key`
  and `scope_key` are the values meant to be shared.
- **Clock jumps can reorder ids.** `uuidv7()` does not guarantee order within one millisecond, only a time-ordered
  prefix.
- **Resource lists page by `id`,** which is creation order. The audit log pages by `audit_log_id`, which is not
  a UUID.

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/api/src/application/ids.ts`.
