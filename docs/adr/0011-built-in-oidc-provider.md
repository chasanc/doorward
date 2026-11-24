---
status: accepted
date: 2026-11-22
deciders: Hasan Hüse
relates-to: 0010-multi-company-is-a-mode, 0012-totp-two-step-verification
---

# Doorward is its own OpenID Connect provider, mounted in the API and off until an issuer is set

Applications can offer "Sign in with Doorward" through standard OpenID Connect (authorization code with PKCE). The
provider runs inside the API process, at the path of `OIDC_ISSUER`, on the `oidc-provider` library. It stays off
while `OIDC_ISSUER` is empty. Apps are registered as clients per company, and receive the user's profile, groups
and permissions as claims.

Recorded afterwards from `docs/sso.md`, `docs/environment.md` and `apps/api/src/infrastructure/oidc/`.

## Context

- Doorward already holds the identities, groups and grants. An app that wants single sign-on should not need a
  second identity system in front of it.
- Any compliant OIDC library has to work, so the surface must follow the standard rather than a custom flow.
- Operators who only need backend `Check` over gRPC should not have to run or secure an OIDC surface.

## Decision

### 1. Use `oidc-provider`, mounted in the API

The provider is mounted before the body parsers and the global rate limiter, because it reads its own bodies
(`mountOidc` in `main.ts`). It shares the API's database and its sign-in rules
([0014](0014-passwords-sessions-and-sign-in-limits.md), [0001](0001-ldap-sign-in.md)).

### 2. Off by default; once on, its keys are mandatory

With `OIDC_ISSUER` empty nothing is mounted. Setting it makes `OIDC_COOKIE_KEYS` and `OIDC_SIGNING_KEY_PATH`
required, and the API refuses to start without them. The signing key is an ES256 key made per environment by
`scripts/generate-oidc-key.mjs`, and must never be `JWT_SECRET`. Both can hold several values, so keys rotate
without signing users out.

### 3. Authorization code with PKCE, opaque access and refresh tokens

ID tokens are signed JWTs (one hour by default). Access and refresh tokens are opaque and stored in
`users.oidc_payload`. The token scopes `openid`, `profile`, `email`, `groups` and `permissions` decide the claims
an app may request. Doorward writes "token scope" for this meaning, and **Scope** only for the tree
([CONTEXT.md](../../CONTEXT.md)).

### 4. Clients belong to a company, and secrets are shown once

An application is registered in the admin console with redirect URIs (plain `http://` only for `localhost`). Its
client secret is shown once and only a hash is stored; **Replace secret** issues a new one and the old one stops
working at once. Only users of the application's company can sign in to it.

### 5. HTTPS changes cookie behavior

With an `https://` issuer or `COOKIE_SECURE=true`, the authorization endpoint accepts `POST` and session cookies
are `SameSite=None; Secure`. Over plain HTTP they stay `SameSite=Lax` for local development.

### 6. Failed client authentication at `/token` is rate-limited

Failures count toward `LOGIN_RATE_LIMIT_MAX` per IP, and further requests get `429` until the window resets.

## Considered options

- **Rely on an external identity provider (Keycloak, Auth0).** Not chosen: the operator would run a second system
  that must stay in step with Doorward's users and groups. Inferred.
- **A custom token endpoint instead of OIDC.** Rejected: every client would need custom code, where a standard
  library works as it is.
- **A separate OIDC service.** Not chosen: it would share the database anyway and double the deploy
  ([0009](0009-one-process-rest-and-grpc.md)). Inferred.
- **JWT access tokens.** Not chosen: opaque tokens can be revoked by deleting their row and do not leak claims.
  Inferred.
- **Always on.** Rejected: it would require signing keys and an issuer for installs that never use SSO.

## Consequences

- **The API process now owns an OIDC surface.** It needs a stable public issuer URL, and a changed issuer breaks
  clients.
- **Keys need care.** Losing the signing key invalidates ID tokens; reusing `JWT_SECRET` would weaken both.
- **Provider state sits in the database,** in `oidc_payload`, which has no foreign key to users. Ending an
  OpenID session is therefore explicit: deactivating or removing a user or company, setting a password and
  resetting two-step verification each call `revokeOidc` in the same transaction
  ([0007](0007-deactivate-then-remove.md)). That deletes provider rows only, not `users."grant"` rows, and not
  the admin cookie ([0014](0014-passwords-sessions-and-sign-in-limits.md)). A timer purges expired rows.
- **No dynamic client registration.** Clients come from the admin console only. Inferred from the docs not
  mentioning it.
- **Conformance is tested, not certified.** The docs describe a conformance run; nothing here claims certification.

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/api/src/infrastructure/oidc/`,
`apps/api/src/application/oidc-clients.service.ts`. Operator view: [docs/sso.md](../sso.md).
