---
status: accepted
date: 2026-11-22
deciders: Hasan Hüse
relates-to: 0002-two-api-keys
---

# One Nest process serves REST and gRPC from the same services, and the proto file is the API contract

`apps/api` is a single process. It listens for REST on `HTTP_PORT` (default 3001) and for gRPC on `GRPC_PORT`
(default 5581), and both call the same application services. `packages/proto/doorward.proto` (`doorward.v1`) is the
source of truth for the API's types. There is no second executable.

Recorded afterwards from `apps/api/src/main.ts`, `CONTEXT.md` and the docs at v0.1.1.

## Context

- Two kinds of callers exist. Integrating apps ask `Check` and manage records over gRPC with an API key. The admin
  console and browsers use REST with a session cookie.
- Both must give the same answer to the same question, including the same errors and the same audit entries.
- The project is small, and an operator should run one container, not a gateway plus a service.

## Decision

### 1. One process, two transports

`main.ts` creates the HTTP app and attaches a gRPC microservice to it. The transports differ only at the edge:
guards and interceptors for keys and sessions, and an error filter that maps one `AppError` to an HTTP status or a
gRPC status code ([0002](0002-two-api-keys.md), [0003](0003-rest-company.md)).

### 2. Application services hold the rules

REST controllers and the gRPC controller call the same services (users, groups, grants, access, auth). Neither
transport has business rules of its own. A `ServiceCall` carries who is calling and from where
(`source: 'rest' | 'grpc'`, company, acting user).

### 3. The proto file is the type source of truth

`doorward.proto` defines one gRPC service per resource, with string ids, paginated lists, field-mask updates and
gRPC status codes. `pnpm proto:generate` writes the TypeScript, and CI fails if the generated files differ from
what is committed. The web app uses the generated interfaces for REST JSON; it never speaks binary protobuf.

### 4. REST is documented by OpenAPI

Swagger is served at `/api/docs`. The REST surface mirrors the gRPC services as `/api/v1/<resource>`.

### 5. gRPC transport security is optional and off by default

`GRPC_TLS` turns on TLS with PEM paths, and `GRPC_TLS_REQUIRE_CLIENT_CERT` adds mutual TLS. The API key is not
transport security. Production is meant to use both TLS and the manage key.

## Considered options

- **Separate gRPC and REST services.** Not chosen: two deployables and two copies of the rules to keep in step.
  Inferred.
- **gRPC only, with a gateway for HTTP (grpc-gateway or Envoy).** Not chosen: it adds a moving part the operator
  must run, and the REST surface is session-based, which a generic gateway does not give. Inferred.
- **REST only.** Rejected: integrating apps want a typed contract and streaming-friendly transport, and the proto
  file gives clients in any language generated code.
- **Hand-written TypeScript types shared by hand.** Rejected: they drift. A generated file with a CI diff check
  cannot.

## Consequences

- **A gRPC port must be reachable** wherever the API runs, so the API cannot sit on a host that exposes only HTTP
  (see [0013](0013-web-on-vercel-api-long-lived.md)).
- **One crash takes both transports down,** and one slow transport shares the process with the other.
- **A proto change is a contract change.** Fields are added, not repurposed, and generated files go in the same PR.
- **Every service method is reachable from both transports,** so a rule written in only one controller would be a
  bug. Reviewers should look for logic outside `application/`.
- **Rate limits and body parsing differ by transport.** The global HTTP rate limiter does not see gRPC calls.

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/api/src/main.ts`, `apps/api/src/grpc/`,
`apps/api/src/http/`, `packages/proto/doorward.proto`.
