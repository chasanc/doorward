---
status: accepted
date: 2026-11-23
deciders: Hasan Hüse
relates-to: 0003-rest-company
---

# Integrating apps share two environment keys, and a check-only key cannot manage

Doorward does not store a credential per integrating app. `GRPC_API_KEY` may call every RPC. `GRPC_CHECK_API_KEY`,
when set, may call only `Check` and `BatchCheck`. The split exists so a process that only asks "may this user?"
never holds a key that can create users or grants.

## Context

- Before this, every integrating app sent the same `GRPC_API_KEY`. That key could call `CreateUser` and
  `CreateGrant` as well as `Check`. An empty key skipped the check, which is how local development and CI run.
- `POST /api/v1/check` sat behind the admin session guard, so an HTTP app needed a full admin login to ask a
  yes-or-no question.
- Production had no boot check for an empty manage key or the local `JWT_SECRET` of `change-me`.

## Decision

### 1. Two shared keys, no credential table

`x-api-key` is matched in `apiKeyRole`. The manage key wins over the check key. A value that matches neither is
`none`. Keys are process environment, not rows. Revoking one app means rotating the shared key.

### 2. The check key stops at Check

On gRPC, `grpcAllows` permits `check` and `batchCheck` for the check role and every method for the manage role.
On REST, `CheckRouteGuard` accepts either key for `POST /api/v1/check` and `POST /api/v1/check/batch`. A signed-in
user with no key may ask only about their own id. Asking about someone else is forbidden once a key is configured.

### 3. Empty keys stay open, except in production

Both keys empty means `open`: every call is allowed. That is local development and CI. `NODE_ENV=production`
refuses to boot when the manage key is empty or `JWT_SECRET` is `change-me`, unless `DOORWARD_DEMO=true`.
A check key equal to the manage key is refused in every environment.

## Considered options

- **One shared key, and refuse to boot in production when it is empty.** Rejected: Check and manage would stay
  the same privilege, so a leaked check caller could still create grants.
- **A database row per app, marked check-only or manage, with create and revoke in the API.** Not chosen: it
  needs a migration on both engines and a management UI before the first operator had more than one key to
  hand out. Inferred from the choice to ship environment keys first. Revisit when operators need to revoke one
  app without rotating every other app.
- **Leave Check behind the admin session only.** Rejected: an HTTP integrator would need `doorward.admin` to
  ask a question that gRPC already answers with a key.

## Consequences

- **Rotating the manage key rotates it for every manage caller.** There is no per-app revoke.
- **A session cannot Check another user** once either key is set. CI still works because its keys are empty,
  which leaves the route open.
- **The Compose demo boots with the public defaults** because `DOORWARD_DEMO=true` skips the production refusal.
  A real production process must not set that flag.
- **The check key is optional.** Unset, only the manage key (or an open install) can call Check.

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/api/src/auth/api-key-role.ts`,
`apps/api/src/auth/check-route.guard.ts`, `apps/api/src/config/production-secrets.ts`. Change: PR #4.
