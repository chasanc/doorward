# Integrating Your Application

Backend applications talk to Doorward over **gRPC** (`doorward.v1`) on `GRPC_PORT` (default `5581`). The Next.js admin console uses **REST** on `HTTP_PORT` (default `3001`). Both APIs run in the same NestJS process and share the same services.

Pick the path that fits your app:

- **Web apps that want a "Sign in with Doorward" button:** use OpenID Connect. See [sso.md](sso.md).
- **Backend services that verify passwords and check permissions:** follow the gRPC flow below.

## gRPC integration flow

1. **Connect to gRPC.** Use TLS when `GRPC_TLS=true` is enabled on the server with its configured PEM certificates. Local development defaults to an unencrypted connection.
2. **Send your API key.** When the server has `GRPC_API_KEY` set, attach it in the `x-api-key` metadata header on every request. Leaving `GRPC_API_KEY` empty turns this check off for local development. If an app only calls `Check` and `BatchCheck`, give it `GRPC_CHECK_API_KEY` instead; the server rejects that key on all other RPCs.
3. **Identify the company (multi-company mode only).** When `MULTI_COMPANY_MODE=true`, send the `company-key` metadata header so every call stays scoped to that company.
4. **Authenticate the user.** Call `AuthService.Authenticate` with the username and password. Doorward returns `UNAUTHENTICATED` if the password is wrong or if the user or company is inactive. This call verifies identity only and checks no permissions.
5. **Check permissions.** Call `AccessService.Check` with the user ID, permission name, and an optional scope ID. When allowed, the response includes the exact grant that matched.
6. **Keep secrets separate.** `JWT_SECRET` signs REST admin sessions only. Do not reuse it as your gRPC API key, and do not forward the admin console cookie to backend apps.

## Permission checks

- Permission names are lowercase dotted strings you define, like `invoice.approve`, and are unique per company.
- A grant at a scope covers that scope and all of its descendants. Calling `Check` without a scope matches company-wide grants only.
- Use `BatchCheck` to evaluate several permission checks in one round trip (results come back in the same order).
- Use `ListGrantsForUser` to fetch every grant a user holds (both direct and inherited from active groups) when your app wants to cache claims.

## Working examples

Each example runs the same end-to-end flow and exits with a non-zero status on failure: authenticate a user, check `doorward.admin`, list the user's grants, list all users, and create four sample permissions if they are missing.

| Language | Path | Transport |
| --- | --- | --- |
| C# (.NET 10, layered) | [`examples/csharp`](../examples/csharp) | gRPC |
| C++ (CMake) | [`examples/cpp`](../examples/cpp) | gRPC |
| Rust (tonic) | [`examples/rust`](../examples/rust) | gRPC |
| Node.js | [`examples/grpc-client`](../examples/grpc-client) | gRPC |
| curl + jq | [`examples/rest`](../examples/rest) | REST bearer token |

For any other language, generate a client from `packages/proto/doorward.proto`. Permission names are plain strings on the wire, so each client defines its own constants.

## Bootstrapping permissions

On first run, an application registers the permissions it checks (such as `doorward.admin`, `data.create`, `data.update`, and `data.delete` in the examples) and grants them to users or groups, either company-wide or at a scope. New users hold no permissions until you grant them.

## REST with a bearer token

HTTP clients that do not use cookies can call `POST /api/auth/token` with `{ "username", "password" }`. The account needs a valid password and a company-wide `doorward.admin` grant. The endpoint returns `{ "accessToken", "tokenType": "Bearer" }` without setting a cookie, and shares the login rate limit.

Send `Authorization: Bearer <accessToken>` on requests under `/api/v1`. The session cookie from `/api/auth/login` still works; if a request sends both a cookie and a bearer token, the cookie wins.

## REST admin session

The admin console signs in through `POST /api/auth/login`, which sets an `httpOnly` cookie named `doorward_token`. The frontend never stores the JWT in `localStorage`.
