# Signing Users In with Doorward (OpenID Connect)

Doorward includes an OpenID Connect (OIDC) provider so your web apps can offer a "Sign in with Doorward" flow. Users sign in with one account and password, and your app receives their identity, company, groups, and permissions.

The OIDC provider stays off until you set `OIDC_ISSUER` (see [environment.md](environment.md)). It implements standard OpenID Connect (Authorization Code Flow with PKCE), so any compliant OIDC library works out of the box. If you only need backend permission checks over gRPC, read [integrate.md](integrate.md) instead.

**Jump to a section:**

- **Operating Doorward:** [Quick start](#quick-start), [Production checklist](#production-checklist), [Two-step verification](#two-step-verification-totp)
- **Connecting an app:** [Settings for any OpenID client](#settings-for-any-openid-client), [Token scopes and claims](#token-scopes-and-claims), [Next.js (Auth.js)](#nextjs-authjs), [Troubleshooting](#troubleshooting)
- **Protocol details:** [Endpoints](#endpoints), [Signing out](#signing-out), [Conformance testing](#conformance-testing)

## Quick start

1. **Turn on the OIDC provider.** Generate a signing key once per environment, add these three variables to `apps/api/.env`, and restart the API:

   ```bash
   node scripts/generate-oidc-key.mjs ./oidc-signing-key.json
   ```

   ```env
   OIDC_ISSUER=http://localhost:3001/oidc
   OIDC_COOKIE_KEYS=<random string>
   OIDC_SIGNING_KEY_PATH=./oidc-signing-key.json
   ```

   Check that discovery responds with JSON: `curl <issuer>/.well-known/openid-configuration`.

2. **Register your application.** In the admin console, open **Applications** and add your app (see [Registering an application](#registering-an-application)). Copy the generated client ID and client secret.

3. **Configure your app's OIDC client.** Give your OpenID library the issuer URL, client ID, and client secret, and request the token scopes `openid profile email groups permissions`. See [Settings for any OpenID client](#settings-for-any-openid-client).

4. **Test the sign-in flow.** Your app sends users to Doorward's login page. After entering their password (plus a 6-digit code if two-step verification is on), Doorward redirects back to your callback URL with an authorization code that your app exchanges for tokens.

5. **Optional: turn on two-step verification.** Set `TOTP_ENCRYPTION_KEY` in `apps/api/.env` and follow [Two-step verification (TOTP)](#two-step-verification-totp).

## Registering an application

1. Open **Applications** in the admin console and click **Add**. Enter a name and one or more redirect URIs (for example, `https://app.example.com/api/auth/callback/doorward`; plain `http://` is allowed for `localhost` only).
2. Copy the **client ID** and **client secret** right away. Doorward shows the secret once and stores only a hash. If you lose it, click **Replace secret** to generate a new one; the old secret stops working right away.
3. Each application belongs to one company, and only users in that company can sign in to it.

Deactivating an application blocks new sign-ins and token refreshes. Deactivating a user or company, or changing a user's password, revokes all active Doorward sessions and tokens for that user right away. Because access and refresh tokens are opaque and stored server-side, revocation takes effect with no waiting period.

## Endpoints

All OIDC endpoints live under your configured issuer URL (for example, `https://doorward.example.com/oidc`). You can inspect the full discovery document at `<issuer>/.well-known/openid-configuration`.

| Purpose | Path |
| --- | --- |
| Authorization | `/auth` |
| Token exchange & refresh | `/token` (`client_secret_basic` or `client_secret_post`) |
| Userinfo | `/me` |
| Token revocation | `/token/revocation` |
| Public signing keys (JWKS) | `/jwks` |
| Sign out (RP-initiated logout) | `/session/end` |

PKCE (`S256`) is mandatory for every client, and ID tokens are signed with `ES256`. Doorward skips an interactive consent screen: if a client sends `prompt=consent` (as OpenID Connect requires when requesting `offline_access`), Doorward approves the registered token scopes without prompting the user.

## Signing out

To sign a user out of Doorward, redirect their browser to:

```
<issuer>/session/end?id_token_hint=<ID token>&post_logout_redirect_uri=<URI>&state=<state>
```

Doorward asks the user to confirm, ends their Doorward session, and redirects back to `post_logout_redirect_uri` with your `state` value. Make sure that URI is listed under **Logout redirect URIs** in the application's settings.

Ending the session invalidates associated refresh tokens, and silent authorization requests (`prompt=none`) return `login_required`. Doorward does not call back-channel or front-channel logout URLs on other apps, so each app must clear its own local session.

## Token scopes and claims

| Token scope | Returned claims |
| --- | --- |
| `openid` | `sub` (the user's Doorward ID) |
| `profile` | `name`, `given_name`, `family_name`, `preferred_username`, `user_key`, `company` (`{id, key, name}`) |
| `email` | `email` (when set on the user) |
| `groups` | `groups`: array of names of the user's active groups |
| `permissions` | `permissions`: array of `{permission, scope_id}` (`scope_id: null` means company-wide) |
| `offline_access` | Issues refresh tokens (also issued to clients allowed the `refresh_token` grant) |

Your app fetches `groups` and `permissions` live from the **userinfo** endpoint (`/me`) rather than reading them from the ID token. That keeps ID tokens small and ensures claims reflect current grants. Enable these token scopes on the application and request them in your client.

## Settings for any OpenID client

| Setting | Value |
| --- | --- |
| **Issuer / discovery URL** | `<issuer>` (most libraries append `/.well-known/openid-configuration` on their own) |
| **Client ID & client secret** | Copied from the application's page in the admin console |
| **Flow** | Authorization Code with PKCE `S256` (required) |
| **Token endpoint auth** | `client_secret_basic` or `client_secret_post` |
| **Redirect URI** | Must match a registered URI on the application character for character (no wildcards) |
| **Token scopes** | `openid profile email groups permissions` (add `offline_access` for refresh tokens) |
| **ID token algorithm** | `ES256` (public keys at `<issuer>/jwks`) |
| **Stable user identifier** | `sub` (the Doorward user ID; do not key accounts on email or username) |

## Manual curl example

```bash
# 1. Open in a browser (where code_challenge = base64url(sha256(verifier))):
<issuer>/auth?client_id=ID&redirect_uri=URI&response_type=code&scope=openid%20profile%20permissions\
&state=xyz&code_challenge=CHALLENGE&code_challenge_method=S256

# 2. After login, the browser redirects to URI?code=CODE&state=xyz. Exchange the code for tokens:
curl -u ID:SECRET <issuer>/token \
  -d grant_type=authorization_code \
  -d code=CODE \
  -d redirect_uri=URI \
  -d code_verifier=VERIFIER

# 3. Fetch the user's profile, groups, and permissions:
curl -H "Authorization: Bearer ACCESS_TOKEN" <issuer>/me

# 4. Refresh the access token:
curl -u ID:SECRET <issuer>/token \
  -d grant_type=refresh_token \
  -d refresh_token=REFRESH
```

## Next.js (Auth.js)

```ts
// auth.ts
import NextAuth from 'next-auth';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: 'doorward',
      name: 'doorward',
      type: 'oidc',
      issuer: process.env.DOORWARD_ISSUER, // https://doorward.example.com/oidc
      clientId: process.env.DOORWARD_CLIENT_ID,
      clientSecret: process.env.DOORWARD_CLIENT_SECRET,
      authorization: { params: { scope: 'openid profile email groups permissions' } },
      checks: ['pkce', 'state'],
    },
  ],
  callbacks: {
    // Auth.js merges userinfo into the profile; copy the fields your app checks onto the JWT.
    jwt({ token, profile }) {
      if (profile) {
        token.groups = profile.groups;
        token.permissions = profile.permissions;
        token.company = profile.company;
      }
      return token;
    },
  },
});
```

Register `https://<your-app>/api/auth/callback/doorward` as the redirect URI in Doorward. Because the JWT callback runs at sign-in only, the cached `groups` and `permissions` stay as fresh as the last login. Use a refresh token (or call `Check` over gRPC) when your app needs to pick up permission changes right away.

## Production checklist

- Serve Doorward over HTTPS and set `OIDC_ISSUER` to the public URL **including `/oidc`**. Outside local development, Doorward marks cookies `Secure`.
- Behind a reverse proxy, load balancer, or Vercel rewrites, set `TRUST_PROXY` so the provider sees the public `https` scheme and rate limits track real client IPs.
- Protect `OIDC_COOKIE_KEYS` and the signing key (`OIDC_SIGNING_KEY_PATH`). To rotate cookie keys without signing users out, prepend the new key to the comma-separated list and keep the old key behind it until existing sessions expire.
- Doorward does not implement cross-app single sign-out (back-channel or front-channel logout). Signing out through `/session/end` clears the Doorward session cookie, and each app clears its own session.

## Two-step verification (TOTP)

To turn on TOTP two-step verification, set `TOTP_ENCRYPTION_KEY` to a random string of 32 or more characters in `apps/api/.env`. This key encrypts stored authenticator secrets, so back it up. Changing or losing it locks out enrolled users until an administrator resets them.

**Admin-assisted setup:** Open a user's page in the admin console and click **Set up**. Doorward shows a QR code and secret key once. The user scans it with an authenticator app and enters the first 6-digit code, and Doorward then shows ten single-use recovery codes once. From then on, both SSO sign-ins and admin console logins (via the `code` field) require either a current authenticator code or a recovery code. Each code works once, and the ID token includes `amr: ["pwd", "otp"]`.

**Self-service setup:** Users can also enroll themselves at `<issuer>/account/mfa` (for example, `https://doorward.example.com/oidc/account/mfa`). The page is stateless: it asks for the username (plus the company key if that username exists in more than one company) and password at each step, displays the QR code, and checks the first code. Enrolled users cannot swap their authenticator here; an administrator has to reset it first.

> **Security note:** Because self-service enrollment needs only a username and password, an attacker who already has a user's password can enroll their own authenticator and lock out the real user until an administrator resets it. Share the self-service URL only if that fits your threat model.

**Enforcement and recovery:**
- Turn on **Require two-step verification** on a company to block sign-ins from users who have not enrolled yet.
- If a user loses their phone, click **Reset** on their user page to clear their enrollment and end all active sessions.
- If the only administrator loses their phone, clear their enrollment in the database and re-enroll:

```sql
DELETE FROM users.user_totp WHERE user_id = '<user id>';
DELETE FROM users.oidc_payload WHERE user_id = '<user id>';
```

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| `invalid_redirect_uri` or a Doorward error page at `/auth` | The redirect URI does not match the registered URI character for character (check trailing slashes and `http` vs `https`). |
| `invalid_request` mentioning `code_challenge` | The client omitted PKCE parameters. Turn on PKCE (`S256`) in your OIDC library. |
| `invalid_client` at `/token` | Wrong client secret, deactivated application, or unsupported client auth method. If you lost the secret, click **Replace secret**. Repeated failures from one IP return HTTP `429` for one rate-limit window. |
| Sign-in fails with "Wrong username or password" | Either the password is wrong or the user belongs to a different company than the application. The login page returns the same message for both on purpose. |
| `groups` or `permissions` are missing | Enable those token scopes on the application and request them in your client. They come from `/me` (userinfo), not from the ID token. |
| No refresh token is returned | Request `offline_access`, pass `prompt=consent`, and check that the `refresh_token` grant is enabled on the application. |
| `request_not_supported` error | Request objects and the `claims` parameter are disabled by design. Use token scopes instead. |
| Browser rejects the session cookie behind a proxy | Set `OIDC_ISSUER` to the public `https://` URL and configure `TRUST_PROXY`; otherwise Doorward treats the connection as plain HTTP. |
| API refuses to start | `OIDC_ISSUER` is set without `OIDC_COOKIE_KEYS` or `OIDC_SIGNING_KEY_PATH`. |
| Error: `"TOTP_ENCRYPTION_KEY must be set"` | Add `TOTP_ENCRYPTION_KEY` (32+ characters) to the API environment and restart. |

## Conformance testing

We tested Doorward locally against the OpenID Foundation conformance suite (Basic OP plan, static clients, discovery), though we have not submitted it for formal certification. During those runs, the suite's scripted browser drove the sign-in form, and we relaxed PKCE with `OIDC_PKCE_OPTIONAL` because the Basic profile does not send PKCE.

- **Passing:** Authorization code flow with `client_secret_basic` and `client_secret_post`, userinfo, authorization code reuse rejection, `prompt=none`, `max_age`, `id_token_hint`, `GET` and `POST` authorization requests, and refresh tokens with `offline_access`.
- **Unsupported by design:** The `address` and `phone` token scopes, unsigned request objects (rejected with `request_not_supported`), and the `acr` claim (Doorward does not define levels of assurance; `amr` shows how the user signed in). The `claims` request parameter is disabled so clients cannot ask for `groups` or `permissions` without having those token scopes allowed. The suite flags warnings for these, as well as for empty `profile` claims (`picture`, `birthdate`, etc.) and `email_verified` (Doorward does not verify email addresses).
- **Manual checks:** The suite delegates `prompt=login`, `max_age=1`, unregistered `redirect_uri`, and request objects with a redirect URI to manual screenshot checks. We verified all four by hand against the same server: each shows the expected sign-in or error page, and Doorward never redirects to an unregistered `redirect_uri`.
