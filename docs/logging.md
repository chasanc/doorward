# Logging

The API writes application and error logs to **stdout as one JSON object per line**. It does not write log files or ship logs on its own. Your container platform collects stdout, so the same build works on an intranet server, AWS, and GCP.

Application logs are separate from the audit log. The `users.audit_log` table records *who changed what* and appears in the admin console. Stdout logs record what the process is doing, including errors, and live in whatever collects stdout.

## What a line looks like

```json
{"severity":"WARNING","level":40,"time":1795379036380,"hostname":"api-1","req":{"id":"debb4276-2433-4df2-acab-699e988f0938","method":"POST","url":"/api/auth/login","remoteAddress":"203.0.113.9"},"context":"Auth","event":"auth_failure","reason":"bad_credentials","username":"alice","source":"rest"}
```

- `level` is a number: `30` info, `40` warn, `50` error. `severity` repeats it as a word (`INFO`, `WARNING`, `ERROR`, `CRITICAL`) for Cloud Logging.
- `time` is Unix time in milliseconds.
- `context` names the part of the API that wrote the line.
- Lines written during an HTTP request carry `req.id`, the method, the path without its query string, and the client IP.

## Settings

These switches are optional, and the API always logs errors and warnings.

| Variable | Default | Effect |
| --- | --- | --- |
| `LOG_LEVEL` | `info` (required key) | Lowest level written: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, or `silent` for nothing. Case and surrounding spaces do not matter. Any other value stops the API at startup with a message naming `LOG_LEVEL`. |
| `LOG_HTTP_REQUESTS` | `true` | One line per HTTP request: method, path, status, duration. |
| `LOG_STARTUP` | `true` | Boot messages (modules, routes, "listening"). |
| `LOG_AUTH_FAILURES` | `true` | One warning per failed sign-in, wrong two-step code, bad gRPC API key, bad client secret at `/token`, or rate-limit hit. |

Set any switch to `false` to turn it off. See [environment.md](environment.md).

## Request IDs

Every HTTP response includes an `X-Request-Id` header, and the API puts that same ID on every log line for the request. If a proxy or load balancer sends an `X-Request-Id` (8 to 64 characters of letters, digits, `.`, `_`, `-`), the API reuses it; otherwise it generates a UUID.

When the admin console hits a server error (HTTP 5xx), it displays `(Request ID: …)` in the message. Search your logs for that ID to find the cause.

## What is never logged

The logger replaces authorization headers, cookies, API keys, passwords, two-step codes, client secrets, and tokens with `[Redacted]`. It strips query strings from logged URLs because they can carry tokens, and logs database errors as message and stack only, without bound query parameters.

A failed sign-in logs the stored username only when the attempt matched an existing account, so you can spot an attack on one account. The logger never records the raw string the caller typed, since people sometimes paste their password into the username box. An attempt that matches no account, or hits the rate limit, omits `username` and records `ip` instead. Trace spans also strip query strings.

## Where the logs go

| Where it runs | How to read them | Retention |
| --- | --- | --- |
| **Intranet, Docker Compose** | `docker compose logs api` | Docker keeps logs until you remove the container. Set `logging.options.max-size` and `max-file` on the service, or use the host's log driver (journald, syslog, Loki). |
| **Intranet, systemd** | `journalctl -u <unit>` | Set `SystemMaxUse` in `journald.conf`. |
| **AWS (ECS on Fargate)** | CloudWatch Logs through the `awslogs` driver. The [Terraform example](../deploy/terraform/aws) creates the log group with 30-day retention. | Change `retention_in_days`. |
| **AWS (EKS)** | Ship container stdout with Fluent Bit or the CloudWatch agent. | Set on the log group. |
| **GCP (Cloud Run, GKE)** | Cloud Logging collects stdout with no setup. | Set on the log bucket (30 days by default). |

Cloud notes:

- **GCP severity:** Every line carries a `severity` field, so Cloud Logging colors and filters entries out of the box (`severity>=WARNING`). The log text sits in `jsonPayload.msg`.
- **Health checks:** A load balancer calling `GET /api/health` every few seconds creates one log line per check. Set `LOG_HTTP_REQUESTS=false` on cloud installs since the load balancer keeps its own access log.
- **Reverse proxies:** Set `TRUST_PROXY` so the logged client IP belongs to the caller rather than the proxy.

## Tracing (optional, OpenTelemetry)

Tracing is off by default; the API loads and sends nothing until you set an OTLP endpoint:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318
```

With that set, the API exports **traces only** over OTLP/HTTP for incoming HTTP and gRPC calls, Express, NestJS handlers, and PostgreSQL queries. Health checks are skipped. Log lines written inside a traced request include `trace_id` and `span_id`, so you can jump from a log line to its trace.

- Tune it with standard OpenTelemetry variables: `OTEL_EXPORTER_OTLP_HEADERS` (for example, an API key), `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_SERVICE_NAME` (default `doorward-api`), and `OTEL_TRACES_SAMPLER`. Set `OTEL_SDK_DISABLED=true` to turn tracing back off.
- Your collector must accept OTLP over HTTP (port `4318`), not gRPC only. AWS (ADOT collector), GCP (Cloud Trace via OpenTelemetry Collector), Grafana, and Jaeger all support it.
- SQL statements appear in spans with parameter values replaced by placeholders. Treat your trace backend with the same access controls as your logs.
- Only the API is traced, and SQL Server queries are not instrumented (PostgreSQL only).

## Known gaps

- OpenID Connect routes (`/oidc/...`, including `/token` and the sign-in page) do not emit HTTP access logs or request IDs. Their auth failures are still logged with the client IP.
- gRPC calls have no request ID. Unexpected gRPC errors are logged as errors.
