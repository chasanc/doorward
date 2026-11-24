---
status: accepted
date: 2026-11-22
deciders: Hasan Hüse
relates-to: 0011-built-in-oidc-provider, 0014-passwords-sessions-and-sign-in-limits
---

# Two-step verification is TOTP with encrypted secrets, optional per user and enforceable per company

A user can enroll an authenticator app. From then on, both single sign-on and admin console sign-in need a current
6-digit code or one of ten single-use recovery codes. A company can switch on **Require two-step verification**,
which blocks sign-in for users who have not enrolled. The feature stays off until `TOTP_ENCRYPTION_KEY` is set.

Recorded afterwards from `docs/sso.md`, `docs/environment.md` and `apps/api/src/application/totp.ts`.

## Context

- A password alone is the only factor Doorward had. Operators asked for a second one without running another
  service.
- TOTP needs a shared secret stored on the server, so the stored secret must be protected from a database leak.
- Admin accounts are the highest-value targets, and one administrator locked out must not lock the install.

## Decision

### 1. TOTP, no SMS or push

The secret is a standard TOTP secret an authenticator app can scan from a QR code. The ID token carries
`amr: ["pwd", "otp"]` after a code was used.

### 2. Secrets are encrypted at rest with one environment key

`TOTP_ENCRYPTION_KEY` (32 or more characters) encrypts each secret in `users.user_totp` with AES-256-GCM. Without
the key nobody can enroll. Changing or losing it locks out every enrolled user until an administrator resets them.

### 3. Recovery codes, shown once

Enrollment ends by showing ten single-use recovery codes once. Each code, and each authenticator code, works once.

### 4. Two ways to enroll

An administrator opens a user and clicks **Set up**. Users may also enroll at `<issuer>/account/mfa`, a stateless
page that asks for the username (and company key when needed) and password at each step. An enrolled user cannot
replace their authenticator there; an administrator resets it first.

### 5. Enforcement is per company; reset ends OpenID sessions

**Require two-step verification** on a company blocks users who have not enrolled. **Reset** clears a user's
enrollment and deletes their rows in `oidc_payload` (`revokeOidc`). The admin cookie `doorward_token` stays valid
until the JWT expires ([0014](0014-passwords-sessions-and-sign-in-limits.md)). Doorward grants are not removed.

## Considered options

- **No second factor.** Rejected: the first operators wanted one.
- **SMS or email codes.** Not chosen: they need an outbound channel and phone numbers, which Doorward does not
  hold or send. Inferred.
- **WebAuthn / passkeys.** Not chosen for the first release; it needs a relying-party configuration and a browser
  flow that the OIDC login pages do not have. Inferred. Could be added beside TOTP.
- **Store secrets in plain text and rely on database access control.** Rejected: a database leak or backup would
  hand out every user's second factor.
- **Self-service enrollment behind a session.** Not chosen: the OIDC login page is where users first see Doorward,
  and there is no session before sign-in. Inferred.

## Consequences

- **The encryption key is a single point of failure.** Back it up. Rotating it has no migration path today.
- **Self-service enrollment is only as strong as the password.** Someone who knows a user's password can enroll
  their own authenticator and lock the real user out until an administrator resets it. The docs say so.
- **The last administrator can lock themselves out.** The recovery is two `DELETE` statements run in the database
  (`user_totp` and the user's rows in `oidc_payload`).
- **Directory users** ([0001](0001-ldap-sign-in.md)) are asked for a code after the directory accepts their
  password. Whether the directory has its own second factor is outside Doorward.
- **Codes are one-time only.** The last accepted 30-second step is stored (`last_step`) and any step at or
  below it is refused, so two quick submissions of the same code fail the second, and so does an older code.
  Using a recovery code is audited (`mfa_recovery_used`).

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/api/src/application/totp.ts`,
`apps/api/src/application/mfa.service.ts`, `apps/api/src/infrastructure/oidc/account-mfa.ts`. Operator view:
[docs/sso.md](../sso.md#two-step-verification-totp).
