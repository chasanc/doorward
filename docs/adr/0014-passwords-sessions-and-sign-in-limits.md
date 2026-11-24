---
status: accepted
date: 2026-11-22
deciders: Hasan Hüse
relates-to: 0001-ldap-sign-in, 0002-two-api-keys
---

# Passwords are argon2id, sessions are httpOnly JWT cookies, and sign-in is rate-limited and uniform

A local password is stored as an argon2id hash. A REST session is a JWT in an `httpOnly` cookie signed with
`JWT_SECRET`. Sign-in attempts are limited per IP and per username before any hashing happens, and every failure
gives the caller the same answer while the log records the reason.

Recorded afterwards from `password.service.ts`, `auth.service.ts`, `login-rate-limiter.ts`,
`auth.constants.ts` and `production-secrets.ts`.

## Context

- Credentials are the most attacked part. Hashing must be slow enough to hurt guessing and fast enough that a
  burst of parallel logins does not stall the process.
- A caller must not learn whether a username exists, or which check failed.
- Local development and CI run with empty keys and a placeholder secret; production must not.

## Decision

### 1. argon2id with fixed, modest parameters

19 MiB memory, time cost 2, parallelism 1 (the OWASP argon2id option). Parallelism is 1 because concurrency comes
from parallel logins. A verified hash made with other parameters, such as the seed hash, is rehashed at the next
successful sign-in. A hash that does not start with `$argon2` never verifies. A directory user has no hash
([0001](0001-ldap-sign-in.md)).

### 2. The same answer for every failure

Sign-in returns "Invalid username or password" for a wrong password, an unknown user, an inactive user or company,
a company mismatch and a directory failure. The auth-failure log carries the specific reason for operators and
never the typed text, which can be a password. A password is verified even when no user matched, so timing does not
reveal the username.

### 3. Rate limits count before hashing

`LoginRateLimiter` is always on and caps attempts per IP and per lower-cased username, and failed client
authentication at the OIDC token endpoint ([0011](0011-built-in-oidc-provider.md)), before any argon2 work, so a
parallel burst is cut early. The global request limiter is separate and off by default (`RATE_LIMIT_ENABLED`). Set
`TRUST_PROXY` behind a proxy, or every client shares one bucket.

### 4. A session is a signed cookie

`doorward_token` holds a JWT with the user id, username, user key and company id. The cookie is `httpOnly`,
`SameSite=Lax`, `Secure` when `COOKIE_SECURE` is true, and expires with `JWT_EXPIRES_IN` (default `1d`).
`JwtAuthGuard` also accepts that JWT as a `Bearer` token. It verifies the signature and does not look the user
up again.

### 5. Production refuses placeholder secrets

With `NODE_ENV=production` the API will not boot with an empty `GRPC_API_KEY` or `JWT_SECRET=change-me` unless
`DOORWARD_DEMO=true` ([0002](0002-two-api-keys.md)). The seed refuses an empty password or `changeme`. `JWT_SECRET`
is for the REST session only; it is not reused for gRPC or OIDC.

## Considered options

- **bcrypt or scrypt.** Not chosen: argon2id is the current recommendation and the library supports its
  parameters and `needsRehash`. Inferred.
- **Server-side sessions in the database.** Not chosen: they would add a lookup per request and a table to clean.
  The cost is that sessions cannot be revoked early. Inferred.
- **Distinct errors for unknown user and wrong password.** Rejected: it lets a caller list usernames.
- **Only a global rate limit.** Rejected: it is off by default and does not cap guesses against one name.
- **A random default admin password.** Not chosen: local setup and the Compose demo need a known default. The
  production refusal covers the risk.

## Consequences

- **The cookie itself cannot be revoked.** It stays valid until its JWT expires (a day by default). What it
  can do is limited by a per-request check ([0015](0015-rest-session-proves-identity-not-authority.md)).
- **A leaked `JWT_SECRET` lets anyone mint a session.** It must be random and kept out of the repository.
- **Counters live in process memory.** A restart clears them, and two API instances each keep their own, so the
  effective limit is higher behind a load balancer.
- **A username lockout is possible.** Anyone can burn another person's per-name allowance by failing for them.
- **The demo ships public defaults** and must never be exposed.

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/api/src/application/password.service.ts`,
`apps/api/src/application/auth.service.ts`, `apps/api/src/auth/`, `apps/api/src/config/production-secrets.ts`.
