# Deployment

You can self-host the full stack with Docker Compose or run the API and web console as separate services in the cloud. If you host the Next.js admin console on Vercel, the NestJS API still needs a long-lived host for its persistent gRPC socket.

## Docker Compose (recommended for self-hosting)

From the repository root, start PostgreSQL 16, the API, and the web console:

```bash
pnpm compose:up
```

To run SQL Server instead of PostgreSQL:

```bash
pnpm compose:up:mssql
```

You can also invoke Docker Compose on its own:

```bash
docker compose -f deploy/compose/docker-compose.yml --profile postgres up --build
```

### Exposed ports

| Service | Host port | Notes |
| --- | --- | --- |
| Web console | `3000` | Next.js admin UI |
| API HTTP / OpenAPI | `3001` | Health check at `/api/health`, docs at `/api/docs` |
| API gRPC | `5581` | `doorward.v1` services |
| PostgreSQL (`--profile postgres`) | `5432` | Override with `POSTGRES_HOST_PORT` |
| SQL Server (`--profile mssql`) | `1433` | Override with `MSSQL_HOST_PORT` |

If port `5432` is already in use on your machine, override the host port:

```bash
POSTGRES_HOST_PORT=5433 pnpm compose:up
```

### Database initialization

- The **PostgreSQL** profile starts an empty `doorward` database.
- The **SQL Server** profile creates the login and database through `deploy/compose/mssql-init.sh`.
- In both profiles, Compose turns on `AUTO_MIGRATE` and `AUTO_SEED`, so the API builds the schema and seeds the demo admin on boot. See [database.md](database.md).

Never apply both SQL packs to the same database.

The seeded admin account is `admin` / `changeme`. Change the password and set a strong `JWT_SECRET` before exposing the stack on a shared network. Compose sets `COOKIE_SECURE=false` so sessions work over `http://localhost`; switch to `COOKIE_SECURE=true` once you serve over HTTPS.

To stop and remove the containers:

```bash
pnpm compose:down
```

### Pointing Compose at an external database

By default, Compose points `DATABASE_URL` at the internal container hostnames (`postgres` or `mssql`) and ignores any host `DATABASE_URL` pointing to `localhost`. To connect to an external database server instead, export `DOORWARD_DATABASE_KIND` and `DOORWARD_DATABASE_URL` using a hostname reachable from inside the container (not `127.0.0.1`).

## Cloud deployment

- **Web console:** Deploy to Vercel (see [`deploy/vercel/README.md`](../deploy/vercel/README.md)), which rewrites `/api/*` to your NestJS HTTP origin, or run it as a container alongside the API.
- **API:** Deploy on Docker Compose, AWS, GCP, Fly.io, Railway, Render, or any long-lived container platform. Expose HTTP (`3001`) and gRPC (`5581`). Vercel cannot host the API because gRPC needs a long-lived socket.
- **Database:** Use Supabase or any managed PostgreSQL instance, **or** SQL Server / Azure SQL. Set `DATABASE_KIND` and `DATABASE_URL`, then run `pnpm db:migrate` and `pnpm db:seed` (see [database.md](database.md)).

### Enabling SSO and two-step verification in containers

The API container reads these optional variables from the environment (Compose passes them through from your shell). Leave them empty to keep SSO and two-step verification off.

| Variable | Purpose |
| --- | --- |
| `OIDC_ISSUER` | Public HTTPS URL ending in `/oidc`. Leaving it empty keeps SSO off. |
| `OIDC_COOKIE_KEYS` | Comma-separated random strings for signing provider cookies. |
| `OIDC_SIGNING_KEY_JSON` | Full JSON output from `node scripts/generate-oidc-key.mjs`. The container entrypoint writes this to a private file so you do not need to mount a volume. Use `OIDC_SIGNING_KEY_PATH` if you mount your own file. |
| `TOTP_ENCRYPTION_KEY` | 32 or more random characters. Never change it after users enroll. |
| `TRUST_PROXY` | Set to `1` when running behind a single load balancer or reverse proxy. |

Store all four secrets in your cloud secret manager instead of baking them into container images or plain-text task definitions.

### AWS and GCP (Terraform examples)

Run the API container behind an HTTPS load balancer. Starting-point Terraform configs live in [`deploy/terraform/aws`](../deploy/terraform/aws) and [`deploy/terraform/gcp`](../deploy/terraform/gcp). Both pass `terraform validate` but have not been applied to a live cloud account, so review them before applying.

| Component | AWS | GCP |
| --- | --- | --- |
| **API container** | ECS on Fargate or EKS | Cloud Run (HTTP only), or GKE / Compute Engine VM if you also need gRPC |
| **Database** | RDS for PostgreSQL | Cloud SQL for PostgreSQL |
| **Secrets** | AWS Secrets Manager injected into task `secrets` | GCP Secret Manager injected into the pod or VM |
| **HTTPS frontend** | ALB with an ACM certificate (`TRUST_PROXY=1`) | HTTPS load balancer with a managed certificate (`TRUST_PROXY=1`) |
| **gRPC (`5581`)** | ALB target group with gRPC protocol, or an internal NLB | GKE internal load balancer, or private VPC networking |
| **Web console** | Separate ECS service or Vercel | Separate GKE workload or Vercel |

**AWS Terraform notes:** The example provisions an ECS service, an RDS PostgreSQL database, an HTTPS ALB, encrypted CloudWatch logs, and a Secrets Manager secret holding the four SSO values. It expects an existing VPC and ACM certificate. The API applies pending migrations on boot (`AUTO_MIGRATE=true`). After the first `terraform apply`, run `pnpm db:seed` against the `db_address` output from inside the VPC with a real `DOORWARD_ADMIN_PASSWORD`, then point DNS at `alb_dns_name`. Store Terraform state in an encrypted bucket because it holds generated secrets.

**GCP Terraform notes:** The example provisions a Cloud Run service, a private Cloud SQL PostgreSQL 16 instance, and one Secret Manager entry per secret. It expects an existing VPC network, subnet, and pushed container image. The API applies pending migrations on boot (`AUTO_MIGRATE=true`). After the first `terraform apply`, run `pnpm db:seed` against `db_private_ip` with a real `DOORWARD_ADMIN_PASSWORD` from inside the VPC (for example, through Cloud SQL Auth Proxy with `--private-ip` from a VM), then map your custom domain and set `oidc_issuer`. Store Terraform state in an encrypted bucket.

### Operational notes

- **Cloud Run and gRPC:** Cloud Run exposes one port per service, so the GCP example serves HTTP only. If you need gRPC alongside HTTP, use GKE or a Compute Engine VM.
- **Database migrations:** The API refuses to start when the schema is behind or ahead of its code. Run `pnpm db:migrate` as a one-off job before a release, or set `AUTO_MIGRATE=true` (both Terraform examples do) to apply pending migrations on boot. Seed an admin once with `pnpm db:seed`.
- **Health checks:** Point your load balancer health check at `GET /api/health` on port `3001`. It reports that the process is up along with the schema version seen at startup, without querying the database. The process does not open the port if startup cannot reach the database.
- **Logs:** The API writes JSON logs to stdout for your platform to collect. Both Terraform examples set `LOG_HTTP_REQUESTS=false` because the load balancer keeps its own access log and health checks would flood the API log. See [logging.md](logging.md) for retention and other log switches.
- **Tracing (optional):** Set the Terraform variable `otlp_endpoint` (for example `http://collector:4318`) to send OpenTelemetry traces. It defaults to empty, which leaves tracing off. The examples do not create a collector, and the API must be able to reach it: on AWS, allow outbound port `4318` in the task security group; on GCP, give Cloud Run VPC egress. See [logging.md](logging.md#tracing-optional-opentelemetry).
- **Securing gRPC:** Keep gRPC clients on a private network when possible. Whenever gRPC traffic crosses an untrusted network, turn on both TLS and `GRPC_API_KEY`.
- **Running multiple API instances:** Point all instances at the same database and give them the same OIDC signing key and cookie keys. Per-IP rate limits live in memory per process rather than in a shared store. Keep `DB_POOL_MAX × instance count` below your database's connection limit.

## Generating TLS certificates for gRPC

Generate local development certificates with:

```bash
pnpm certs:generate
```

Then set `GRPC_TLS=true` and configure the PEM paths in [docs/environment.md](environment.md). In production, use both TLS and `GRPC_API_KEY`, and never reuse `JWT_SECRET` for gRPC.

## Continuous integration

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs linting, unit tests, a protobuf drift check, a web production build, end-to-end API and smoke tests against both PostgreSQL and SQL Server, and Docker image builds on push.
