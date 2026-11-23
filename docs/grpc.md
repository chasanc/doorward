# gRPC API (`doorward.v1`)

The NestJS process serves eight gRPC services on `GRPC_PORT` (default `5581`) alongside the REST API:

- `AuthService`
- `AccessService`
- `UserService`
- `UserGroupService`
- `PermissionService`
- `ScopeService`
- `CompanyService`
- `GrantService`

The protobuf contract lives in [`packages/proto/doorward.proto`](../packages/proto/doorward.proto). After editing it, regenerate the TypeScript definitions with `pnpm proto:generate`.

### Conventions

- All IDs are UUID v7 strings.
- List endpoints paginate with `page_size` and `page_token`.
- Update requests use field masks so you overwrite only the fields you name.
- Errors map to standard gRPC status codes: `NOT_FOUND`, `ALREADY_EXISTS`, `INVALID_ARGUMENT`, `UNAUTHENTICATED`, `PERMISSION_DENIED`, and `FAILED_PRECONDITION`.

## Security layers

Keep each security layer and its secret separate:

| Layer | Configuration | Purpose |
| --- | --- | --- |
| **TLS** | `GRPC_TLS=true` + PEM file paths | Encrypts gRPC traffic on the wire. Off by default for local dev. |
| **Manage key** | `GRPC_API_KEY` (sent as `x-api-key` metadata) | Authenticates calling apps for every RPC. Empty turns the check off locally; production refuses an empty key. |
| **Check key** | `GRPC_CHECK_API_KEY` (same header) | Optional. Allowed to call `Check` and `BatchCheck` only. |
| **User auth** | `AuthService.Authenticate` | Verifies an end user's username and password. Call `AccessService.Check` after this for permissions. |
| **REST JWT** | `JWT_SECRET` | Signs admin console session cookies and REST bearer tokens only. Never reuse it for gRPC. |

In production, enable **TLS** and set **`GRPC_API_KEY`**. Run `pnpm certs:generate` to create local TLS certificates for testing.

## Testing and examples

See [`examples/grpc-client`](../examples/grpc-client) for a Node.js client that sends `x-api-key` and `company-key` metadata, authenticates a user, runs `Check`, and calls `ListGrantsForUser`.

You can also inspect and call services with `grpcurl` or `grpcui`. Every gRPC operation has a matching REST endpoint under `/api/v1` (documented with OpenAPI at `/api/docs`), which is how the Next.js admin console talks to the API without speaking gRPC.
