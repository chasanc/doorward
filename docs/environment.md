# Environment Variables

Both the API and the web app load configuration from `.env` files and exit on startup if a required key is missing from those files. Exporting shell variables alone is not enough for required keys.

Configuration lives in three gitignored files:

- **Repository root `.env`:** shared settings used by both apps
- **`apps/api/.env`:** API-only settings
- **`apps/web/.env`:** web console settings

When a key appears in both the root `.env` and an app-specific `.env`, the app-specific file wins.

Run `node scripts/write-local-env.mjs` to create all three files with local defaults (such as `JWT_SECRET=change-me` and database user `doorward`). Replace those defaults before deploying to a shared environment.

**Security defaults and rules:**

- `GRPC_API_KEY` is the manage key and can call every RPC. Leave it empty locally to skip the key check. Never reuse `JWT_SECRET` here.
- `GRPC_CHECK_API_KEY` is optional and can only call `Check` and `BatchCheck` (over gRPC, and on `POST /api/v1/check` and `POST /api/v1/check/batch`). It must differ from `GRPC_API_KEY`.
- Under `NODE_ENV=production`, the API refuses to start if `GRPC_API_KEY` is empty or `JWT_SECRET` is `change-me`. Setting `DOORWARD_DEMO=true` relaxes this check for the Compose demo.
- `DATABASE_SSL=true` encrypts the database connection. Leave it off locally.
- When `GRPC_TLS=true`, both `GRPC_TLS_CERT` and `GRPC_TLS_KEY` must point to valid PEM files.

## Shared (`.env`)

```env
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
MULTI_COMPANY_MODE=false
```

## API (`apps/api/.env`)

```env
HTTP_HOST=0.0.0.0
HTTP_PORT=3001
GRPC_PORT=5581
GRPC_TLS=false
GRPC_TLS_CA=../../deploy/certs/server/ca.crt
GRPC_TLS_CERT=../../deploy/certs/server/server.crt
GRPC_TLS_KEY=../../deploy/certs/server/server.key
GRPC_TLS_REQUIRE_CLIENT_CERT=false
GRPC_API_KEY=
GRPC_CHECK_API_KEY=
DATABASE_SSL=false
DATABASE_KIND=postgres
DATABASE_URL=postgresql://doorward:doorward@localhost:5432/doorward
JWT_SECRET=change-me
JWT_EXPIRES_IN=1d
COOKIE_SECURE=false
RATE_LIMIT_ENABLED=false
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_SECONDS=60
```

### Optional API tuning

These settings are optional and default to the values shown:

```env
LOGIN_RATE_LIMIT_MAX=10
DB_POOL_MAX=20
DB_CONNECT_TIMEOUT_MS=5000
TRUST_PROXY=
LOG_HTTP_REQUESTS=true
LOG_STARTUP=true
LOG_AUTH_FAILURES=true
```

- **`LOG_HTTP_REQUESTS`**, **`LOG_STARTUP`**, **`LOG_AUTH_FAILURES`**: Switches for optional parts of the JSON log on stdout. Each stays on unless set to `false`; errors and warnings are always logged. `LOG_LEVEL` (a required shared key) sets the lowest level written. See [logging.md](logging.md).
- **`LOGIN_RATE_LIMIT_MAX`**: Maximum login attempts per IP address and per username in each `RATE_LIMIT_WINDOW_SECONDS` window. This limit stays on even when `RATE_LIMIT_ENABLED=false`; set it to `0` to turn it off. Because it also counts per username, someone who knows a valid username can lock that account out for one window.
- **`AUTO_MIGRATE`**: When set to `true`, the API applies pending database migrations on boot. By default it is off, and the API refuses to start if the schema is behind or ahead of the build; run `pnpm db:migrate` first. Docker Compose sets it to `true`. Keep it off in production so a deploy cannot alter the schema on boot. Also accepted from the process environment. See [database.md](database.md).
- **`AUTO_SEED`**: When set to `true`, the API creates the default company, groups, scope, and `doorward.admin` permission on an empty database, plus an admin user if nobody holds `doorward.admin`. The admin credentials come from `DOORWARD_ADMIN_USERNAME` (default `admin`) and `DOORWARD_ADMIN_PASSWORD`. Under `NODE_ENV=production`, the runner refuses an empty password or `changeme` unless `DOORWARD_DEMO=true`. You can run the same step by hand with `pnpm db:seed`. Docker Compose turns this on for the demo.
- **`DB_POOL_MAX`**: Maximum database connections per API process. Keep `DB_POOL_MAX × instance count` below your database server's connection limit (PostgreSQL defaults to `100`).
- **`DB_CONNECT_TIMEOUT_MS`**: PostgreSQL only. How long a query waits for a free pool connection before failing. SQL Server uses its driver default.
- **`TRUST_PROXY`**: Set this behind a reverse proxy or load balancer so requests do not all appear to come from the proxy's IP and share one rate-limit bucket. Accepts `true`, a hop count (such as `1`), or a trusted subnet name (such as `loopback`). Leave it empty when clients connect straight to the API so callers cannot spoof `X-Forwarded-For`. Also accepted from the process environment.
- **`UV_THREADPOOL_SIZE`**: A Node.js process environment variable (not a `.env` key). Argon2 hashing runs on Node's libuv threadpool (4 threads by default), so raising this to match your CPU core count allows more password hashes in parallel. Each hash uses roughly 64 MiB of memory. Docker Compose leaves it at the default.

## OpenID Connect (single sign-on)

The API includes an OpenID Connect provider mounted at the path in `OIDC_ISSUER`. It stays off while `OIDC_ISSUER` is empty. Once you set `OIDC_ISSUER`, both `OIDC_COOKIE_KEYS` and `OIDC_SIGNING_KEY_PATH` become required, and the API refuses to start if either is missing. You can set these in `apps/api/.env` or in the process environment.

```env
OIDC_ISSUER=https://doorward.example.com/oidc
OIDC_COOKIE_KEYS=
OIDC_SIGNING_KEY_PATH=./oidc-signing-key.json
```

- **`OIDC_ISSUER`**: The public base URL client apps see, including the `/oidc` mount path. Use `https://` in production and set `TRUST_PROXY` behind a proxy.
- **`OIDC_COOKIE_KEYS`**: Comma-separated random strings for signing provider cookies. The first key signs new cookies while all listed keys verify existing ones, which lets you rotate keys without signing users out.
- **`OIDC_SIGNING_KEY_PATH`**: Path to the ES256 signing key generated by `node scripts/generate-oidc-key.mjs`. Generate a fresh key per environment and never reuse `JWT_SECRET`.
  - **Rotating keys:** Generate a new key and list both paths (`old.json,new.json`). The first key signs tokens while all listed keys appear at `/jwks`. Once clients refresh their JWKS cache, swap the order (`new.json,old.json`). Remove the old file after the maximum ID token lifetime passes (one hour by default; access and refresh tokens are opaque and unaffected).
- **HTTPS behavior:** When `OIDC_ISSUER` uses `https://` (or `COOKIE_SECURE=true`), the authorization endpoint accepts HTTP `POST` requests as OpenID Connect Core requires, and session cookies get `SameSite=None; Secure`. Over plain HTTP, `POST` is disabled and cookies stay `SameSite=Lax` for local development.
- **`OIDC_SIGNING_KEY_JSON`**: Docker alternative to `OIDC_SIGNING_KEY_PATH` that passes the signing key JSON through an environment variable. See [deploy.md](deploy.md).
- **`OIDC_PKCE_OPTIONAL`**: Allows clients to omit PKCE when set to `true`. Defaults to `false` and exists only for the OpenID Foundation Basic conformance profile. Never turn it on in production.
- **Token endpoint rate limiting:** Failed client authentication attempts at `/token` count toward `LOGIN_RATE_LIMIT_MAX` per IP; further requests get HTTP `429` until the window resets.

## Two-step verification

```env
TOTP_ENCRYPTION_KEY=
```

- **`TOTP_ENCRYPTION_KEY`**: A random string of 32 or more characters used to encrypt authenticator secrets in `users.user_totp` (AES-256-GCM). Users cannot enroll in two-step verification without it. Do not change this key after users enroll, or they will be locked out until an administrator resets their enrollment.

## Directory sign-in (LDAP)

Off unless `LDAP_URL` is set. Run `pnpm db:migrate` first: it adds `users.user.auth_source`.

```env
LDAP_URL=ldaps://ldap.example.com
LDAP_BIND_DN=cn=doorward,ou=service,dc=example,dc=com
LDAP_BIND_PASSWORD=
LDAP_USER_BASE=ou=people,dc=example,dc=com
LDAP_USER_FILTER=(uid={username})
LDAP_COMPANY_KEY=<company_key from users.company>
LDAP_GROUP_MAP={"cn=admins,ou=groups,dc=example,dc=com":"Admin"}
```

- **`LDAP_URL`**: `ldap://` or `ldaps://`. Prefer `ldaps://`: passwords travel to the directory in clear text over `ldap://`. For a private CA, set `NODE_EXTRA_CA_CERTS` to its PEM file. StartTLS is not supported.
- **`LDAP_BIND_DN`**, **`LDAP_BIND_PASSWORD`**: A read-only account that looks users up. Empty means an anonymous lookup.
- **`LDAP_USER_BASE`**: Where to search (required). The search covers the whole subtree.
- **`LDAP_USER_FILTER`**: Must contain `{username}`, which is replaced by the escaped name typed at sign-in. For Active Directory use `(sAMAccountName={username})`. A filter that matches two entries signs nobody in.
- **`LDAP_COMPANY_KEY`**: The `company_key` of the company that new directory users are created in (required). It is a UUID, not the company name; read it from `users.company.company_key` (the seeded Default company's key is in `db/postgres/seed/default.sql`). One company only.
- **`LDAP_GROUP_MAP`**: Optional JSON object of directory group DN to Doorward group name. The user's `memberOf` values are compared with it at every directory sign-in. The Doorward group must already exist in that company; a missing one is logged and skipped.

How it behaves:

- A username that no Doorward user holds is checked against the directory. On success the user is created with `auth_source = ldap`, name and email from `givenName`, `sn` (or `cn`) and `mail`. Those fields are copied once and not refreshed.
- A directory user has no Doorward password; setting one is refused. Deactivating the user in Doorward blocks sign-in at once.
- A local user (including the seeded `admin`) never falls through to the directory, so a directory account cannot take over a local one and the admin still signs in when the directory is down. A name that differs from a local user only by case is refused.
- Groups in `LDAP_GROUP_MAP` belong to the directory: at each sign-in the user is added to the ones the directory lists and removed from the others. Removals are written to the audit log (`ldap_sync`). Groups not in the map are not touched. Changing the map needs a restart.
- If the directory cannot be reached the sign-in fails like a wrong password; the cause is in the auth-failure log (`ldap_unavailable`).

## Web (`apps/web/.env`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
API_INTERNAL_URL=http://localhost:3001/api
NEXT_PUBLIC_DEFAULT_LOCALE=en
NEXT_PUBLIC_DEFAULT_APP_NAME=Doorward
NEXT_PUBLIC_MULTI_COMPANY_MODE=false
NEXT_PUBLIC_HOME_TITLE=Doorward
```

## Docker Compose behavior

Docker Compose (`pnpm compose:up`) ignores your host `.env` files. Instead, the API container entrypoint generates its own `.env` files from the Compose environment. To point Compose at an external database, export `DOORWARD_DATABASE_KIND` and `DOORWARD_DATABASE_URL` (see [deploy.md](deploy.md)). The web container writes its `.env` at build time with `API_INTERNAL_URL=http://api:3001/api`.
