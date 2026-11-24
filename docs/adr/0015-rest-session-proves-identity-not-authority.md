---
status: accepted
date: 2026-11-24
deciders: Hasan Hüse
relates-to: 0014-passwords-sessions-and-sign-in-limits, 0007-deactivate-then-remove
---

# A REST session proves who someone is; what they may do is checked on every request

The REST cookie is a signed JWT that is not looked up again, so it cannot be revoked before it expires. The
admin API does not rely on it for authority. `JwtAuthGuard` verifies the signature, and then `AdminGuard`
asks `Check` for `doorward.admin` company-wide on every request. OIDC sessions are different: they are rows, and
they are deleted when an account stops being valid.

Recorded afterwards from `jwt-auth.guard.ts`, `admin.guard.ts`, `lifecycle.ts` and `oidc-adapter.ts`.

## Context

- Deactivating a user must stop them working, even if they hold a cookie.
- A database lookup on every request is the cost a stateless JWT avoids ([0014](0014-passwords-sessions-and-sign-in-limits.md)).
- Authority is already a database question: `Check` ignores inactive users, companies, groups and grants
  ([0004](0004-allow-only-grants.md)).

## Decision

### 1. The token proves identity only

The payload names the user and company. `JwtAuthGuard` accepts `doorward_token` or the same JWT as a `Bearer`
token, verifies the signature and expiry, and does not read the user.

### 2. The admin API re-checks authority on every request

`AdminGuard` calls `isAdmin`, which runs `Check` for `doorward.admin` with no scope. An inactive user or company
holds nothing, and a revoked grant stops working at once, whatever the token still says.

### 3. OIDC sessions are rows and are revoked with the account

`revokeOidc` deletes that user's rows in `oidc_payload`: the provider's sessions, grants and tokens. It does not
delete `users."grant"` rows, and it does not invalidate `doorward_token`. It runs in the same transaction when the
user or company is deactivated or removed, when a password is set and when two-step verification is reset
([0012](0012-totp-two-step-verification.md)).

### 4. Sign-in re-checks the account

Both local and directory sign-in need an active, not-deleted user of an active company ([0001](0001-ldap-sign-in.md)).

## Considered options

- **Look the user up in the guard on every request.** Not chosen: the admin API already pays for one check, and
  one place for the rule is enough. Inferred.
- **Server-side session rows.** Not chosen: a table to clean up and a lookup on each request. Inferred.
- **A token version or deny list.** Not chosen: more state for the same effect on the admin API. Inferred.
- **Short JWT lifetimes only.** Kept as a setting (`JWT_EXPIRES_IN`), not relied on.

## Consequences

- **The cookie outlives the account.** `JwtAuthGuard` still accepts it until the JWT expires. `GET /auth/me`
  then loads a live user, so a deactivated user is not found. That route does not re-check `doorward.admin`.
- **Any new REST route is open to a stale cookie unless it re-checks.** A route that uses `JwtAuthGuard` without
  `AdminGuard`, or a check of its own, would trust the token alone. Reviewers should treat that as a bug.
- **A directory-only disable does nothing here.** The user stays active in Doorward, so their session works
  until it expires.
- **There is no sign-out everywhere.** `logout` clears the browser's cookie; a copied token stays valid until it
  expires. A leaked `JWT_SECRET` has the same reach.
- **Every admin request costs a `Check`.**

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/api/src/auth/jwt-auth.guard.ts`,
`apps/api/src/auth/admin.guard.ts`, `apps/api/src/application/lifecycle.ts`,
`apps/api/src/infrastructure/oidc/oidc-adapter.ts`.
