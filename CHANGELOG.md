# Changelog

All notable changes to Doorward are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- LDAP sign-in. Set `LDAP_URL` and users who are not in Doorward yet are checked against the directory and created on first sign-in. `LDAP_GROUP_MAP` keeps their membership of chosen groups in step with the directory at every sign-in. Needs `pnpm db:migrate` (migration `0002_ldap`, which adds `users.user.auth_source`). See [docs/environment.md](docs/environment.md#directory-sign-in-ldap).

## [0.1.1] - 2026-11-24

### Changed

- Smaller Docker images: the API image drops from 1.55 GB to 474 MB and the web image from 1.65 GB to 305 MB. The API image installs only its production dependencies, and the web image runs the Next.js standalone server.

## [0.1.0] - 2026-11-24

First public release. This is a pre-1.0 preview, so APIs, schemas, and settings may still change between minor versions.

### Added

- Doorward: a NestJS API (REST and gRPC) and a Next.js admin console for users, groups, permissions, grants, scopes, and `Check`.
- PostgreSQL and SQL Server support, a Docker Compose setup, and client examples in C#, C++, Rust, Node.js, and curl.
- Structured JSON logging with request IDs and redaction.
- Optional OpenTelemetry tracing, off unless an OTLP endpoint is set.
- Published API and web images on GitHub Container Registry, built when a `v*` tag is pushed.
- A separate `GRPC_CHECK_API_KEY` that can only call `Check` and `BatchCheck`.
- Versioned schema migrations. Run `pnpm db:migrate`, or let the API apply them with `AUTO_MIGRATE`.
- `GET /api/health` checks that the database answers and returns 503 when it does not.

### Fixed

- Group members and group grants in the admin console no longer stop at 200 rows.

### Security

- The check-only API key cannot manage users, groups, or grants.
- REST requests are confined to the caller's company.
