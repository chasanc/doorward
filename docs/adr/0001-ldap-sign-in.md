---
status: accepted
date: 2026-11-24
deciders: Hasan Hüse
relates-to: none (first ADR)
---

# Directory users sign in through LDAP, flagged per user, and are never mixed with local users

Doorward can check a password against an LDAP directory. The choice that drives everything else: whether a
user's password is checked locally or in the directory is a property of the **user** (`users.user.auth_source`),
not a switch for the whole install. Local users keep local passwords, directory users hold no password at all,
and neither kind can fall into the other's path.

## Context

- Sign-in used to mean one thing: the user exists, is active, is not deleted, belongs to an active company and
  gives the right password, verified with argon2id ([docs/domain.md](../domain.md#rules), rule 1).
- Operators with a directory want their staff to use one password and want group membership to follow the
  directory, but Doorward must keep working when the directory is down: the seeded `admin` is the way back in.
- Doorward is one codebase for REST, gRPC and the OIDC provider. Every one of them reaches sign-in through
  `AuthService.authenticate`, so the decision has to live there and nowhere else.
- Usernames are unique per company among live users. Postgres ignores case (`ux_user_username` on
  `company_id, lower(username)`); SQL Server follows the database collation. Directories treat names as
  case-insensitive too.

## Decision

### 1. `auth_source` is a per-user flag

`users.user.auth_source` is `'local'` (default) or `'ldap'`, enforced by a check constraint
(migration `0002_ldap` in both packs). A `local` user is checked against `password_hash`. An `ldap` user is
checked by binding to the directory as that user, and has `password_hash = ''`; setting a Doorward password for
one is refused.

### 2. A local user the first lookup finds never falls through to the directory

The first lookup is an exact match on `username`. A local row found that way is checked only against
`password_hash`. The directory is consulted when that lookup finds nobody, or when the row is already `ldap`.
A second lookup, case-insensitive and limited to `auth_source = 'ldap'`, finds a directory user typed in another
case. A local user is not in that second lookup. On Postgres, signing in as `professor` when the local user is
`Professor` finds no row, so the password is sent to the directory, and creating the directory user then fails
on `ux_user_username` (`provision_failed`). SQL Server's usual collation matches that name on the first lookup.
A directory account cannot replace a local account the first lookup finds, and the seeded `admin` signs in with
the directory down.

### 3. First directory sign-in creates the user

A name no Doorward user holds is searched in the directory (`LDAP_USER_FILTER`, with the typed name escaped).
On a successful bind the user is created with `auth_source = 'ldap'` in one company, `LDAP_COMPANY_KEY`. The
stored username is lower-cased, and later lookups of directory users ignore case, so `PROFESSOR` finds the row
created for `professor`. Name and email are copied once and not refreshed. A name that differs from a live user only by case is refused
by Postgres `ux_user_username`. On SQL Server that index follows the database collation
([0005](0005-two-sql-packs.md)).

### 4. Groups listed in `LDAP_GROUP_MAP` belong to the directory

At every directory sign-in, the user's `memberOf` DNs are compared with `LDAP_GROUP_MAP` (directory group DN to
Doorward group name). The user is added to mapped groups the directory lists and removed from mapped groups it
does not. Groups not in the map are never touched, so hand-made memberships survive. Removals are written to the
audit log as `ldap_sync` with the user as actor; additions are inserts and, like every insert, are not logged.
Two sign-ins that add the same memberships at once are harmless: the loser's unique violation is ignored.

### 5. A directory outage is a failed sign-in

If the directory cannot be reached the caller sees the same "Invalid username or password" as for a wrong
password. The operator sees `ldap_unavailable` in the auth-failure log. An empty password is rejected before any
bind, because many servers treat an empty password as an anonymous bind that succeeds.

### 6. Scope kept small

One company only. `ldaps://` is preferred; StartTLS is not supported. Groups come from `memberOf` only. The
connection settings are the seven `LDAP_*` keys in [docs/environment.md](../environment.md#directory-sign-in-ldap).

## Considered options

- **A global switch** (`AUTH_MODE=ldap` for everyone). Rejected: it locks every user, the seeded `admin`
  included, to the directory, so a directory outage means nobody can sign in and nobody can fix it.
- **Try local first, then fall back to the directory for any failure.** Rejected: a wrong local password would
  be sent to the directory, and a directory user who chose a matching name could take a local account over.
- **Provision users ahead of time (import or sync job).** Not chosen (inferred: avoids a second moving part).
  Creating the user at first sign-in needs no scheduler; the cost is that a directory user does not exist in
  Doorward until they have signed in once.
- **Store a copy of the directory password hash.** Rejected: Doorward would hold credentials it cannot keep in
  step with the directory, and a directory password change would not reach it.
- **Refresh name and email at every sign-in.** Not chosen: it makes Doorward overwrite edits made in the admin
  console. Revisit if operators ask for it.
- **Support several companies and StartTLS.** Deferred, not rejected: neither was needed for the first
  operator, and both add configuration that is hard to remove later.

## Consequences

- **A directory user can only be reached after a first sign-in.** Grants cannot be given to someone who has
  never signed in, except through a group in `LDAP_GROUP_MAP`, which is applied at that first sign-in.
- **Deactivating a user in Doorward blocks their next sign-in at once;** disabling them in the directory blocks
  it only when the directory refuses the bind. A session already issued keeps its cookie until the JWT expires.
  After a Doorward deactivation it can no longer use the admin API, because every request re-checks
  `doorward.admin` ([0015](0015-rest-session-proves-identity-not-authority.md)). A user disabled only in the
  directory is still active in Doorward, so their session carries on until it expires.
- **Name and email drift.** They are copied once, so the directory and Doorward can disagree afterwards.
- **A name collision is refused, not merged.** A directory user whose name matches a local user in another case
  cannot sign in (`provision_failed` in the log). On Postgres the password is sent to the directory before that
  refusal, because the first lookup missed the local row. Rename the local user to resolve it.
- **Every sign-in costs directory round-trips** (bind as the service account, search, bind as the user) with
  5 s timeouts, and a directory that is slow slows sign-in.
- **Not exercised against `ldaps://` or Active Directory.** The flows were tested against OpenLDAP over
  `ldap://` with a throwaway database; the REST login route is not covered by an LDAP test. The LDAP e2e is
  skipped unless a database and a directory are provided, so default CI does not run it.
- **`AuthService` carries provisioning and group sync.** Moving both into `LdapService` was suggested in review
  and left for later.

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/api/src/application/auth.service.ts`,
`apps/api/src/application/ldap.service.ts`, `db/*/migrations/0002_ldap.sql`,
`apps/api/test/ldap.e2e-spec.ts`. Change: PR #9.
