---
status: accepted
date: 2026-11-22
deciders: Hasan Hüse
relates-to: 0009-one-process-rest-and-grpc
---

# The admin web is a Next.js app that talks only REST JSON, and the API stays on a long-lived host

`apps/web` is a Next.js admin console. It may run on Vercel or in a container. It calls the API over REST with JSON
and the generated `@doorward/proto` interfaces, never binary protobuf. `apps/api` does not run on Vercel: it
always opens a gRPC port, so it needs a long-lived host.

Recorded afterwards from `CONTEXT.md`, `deploy/vercel/README.md` and `apps/web/`.

## Context

- The console is a set of pages over the same services that gRPC exposes ([0009](0009-one-process-rest-and-grpc.md)).
- Vercel runs short-lived functions. A process that holds a gRPC listener, an OIDC provider and a database pool
  does not fit that model.
- The session is a cookie, so the browser and the API must look like one site.

## Decision

### 1. Two deployables, one contract

`apps/web` (Next.js 16, React 19) and `apps/api` (NestJS) ship as separate images and share only
`packages/proto` and `packages/domain` (enums and constants, no framework imports).

### 2. The web only speaks REST JSON

It never opens gRPC. The types come from the generated proto interfaces, so a field change fails the web build.

### 3. Same-origin cookies

The session cookie is `doorward_token`. Cookies work only if the browser reaches the API on the web app's origin,
so the Vercel setup is a rewrite of `/api/:path*` to the API origin and an empty `NEXT_PUBLIC_API_URL`. Direct
browser calls to another host need CORS and cookie-domain work that v1 avoids.

### 4. Server-side fetches need a reachable API URL

`NEXT_PUBLIC_API_URL` or `API_INTERNAL_URL`. Compose writes `API_INTERNAL_URL=http://api:3001/api` when the web
image is built.

### 5. Web flags mirror API flags

`NEXT_PUBLIC_MULTI_COMPANY_MODE` should match `MULTI_COMPANY_MODE` ([0010](0010-multi-company-is-a-mode.md)).

## Considered options

- **API on Vercel.** Rejected: Nest always binds gRPC, and function lifetimes do not suit it.
- **Serve the console from the API process.** Not chosen: it would tie the console's release to the API's, and
  give up Next.js rendering and hosting. Inferred.
- **Web calls the API from the browser with a bearer token.** Not chosen: the cookie is `httpOnly`
  ([0014](0014-passwords-sessions-and-sign-in-limits.md)), and a token in script-readable storage would give that
  up. Inferred.
- **gRPC-web from the browser.** Rejected: it adds a proxy and a second client path for no gain over REST.

## Consequences

- **Two things to deploy and keep in step.** A deploy of one can break the other if a contract field changes.
- **The rewrite is part of the product.** Without it, or without CORS, the console cannot sign in.
- **Vercel does not host everything.** An operator who wants a single platform must run the web in a container
  next to the API.
- **The web build includes the multi-company flag at build time,** so changing it means rebuilding.
- **Next.js 16 differs from older versions.** `apps/web/AGENTS.md` tells contributors to read the docs in
  `node_modules` before writing code.

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/web/`, `deploy/vercel/`, `deploy/compose/`.
