# Logging

The API writes its application and error logs to **stdout as one JSON object per line**. It does not write log files and does not send logs anywhere. The platform that runs the container collects them, so the same build works on an intranet server, AWS, and GCP.

Logging is separate from the audit log. The `users.audit_log` table records *who changed what* and is queried from the admin console. Logs record what the process itself is doing, including errors, and are kept by whatever collects stdout.

## What a line looks like

```json
{"severity":"WARNING","level":40,"time":1795379036380,"hostname":"api-1","req":{"id":"debb4276-2433-4df2-acab-699e988f0938","method":"POST","url":"/api/auth/login","remoteAddress":"203.0.113.9"},"context":"Auth","event":"auth_failure","reason":"bad_credentials","username":"alice","source":"rest"}
```

- `level` is a number: `30` info, `40` warn, `50` error. `severity` repeats it as a word (`INFO`, `WARNING`, `ERROR`, `CRITICAL`), which Cloud Logging uses.
- `time` is Unix time in milliseconds.
- `context` names the part of the API that logged it.
- Lines written while handling an HTTP request carry `req.id`, the method, the path without its query string, and the client IP.

## Settings

All are optional. Errors and warnings are always logged.

| Variable | Default | Effect |
| --- | --- | --- |
| `LOG_LEVEL` | `info` (required key) | Lowest level written: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, or `silent` for nothing. Case and surrounding spaces do not matter. Any other value stops the API at startup with a message naming `LOG_LEVEL`. |
| `LOG_HTTP_REQUESTS` | `true` | One line per HTTP request: method, path, status, duration. |
| `LOG_STARTUP` | `true` | Boot messages (modules, routes, "listening"). |
| `LOG_AUTH_FAILURES` | `true` | One warning per failed sign-in, wrong two-step code, bad gRPC API key, bad client secret at `/token`, or rate-limit hit. |

Set a switch to `false` to turn it off. See [environment.md](environment.md).

## Request IDs

Every HTTP response has an `X-Request-Id` header, and the same ID is on every log line for that request. If a proxy or load balancer sends its own `X-Request-Id` (8 to 64 characters of letters, digits, `.`, `_`, `-`), the API reuses it; anything else is replaced with a generated UUID.

When the admin console gets a server error (HTTP 5xx), it shows `(Request ID: …)` in the message. Search your logs for that ID to find the cause.

## What is never logged

Authorization headers, cookies, API keys, passwords, two-step codes, client secrets and tokens are replaced with `[Redacted]`. Query strings are dropped from logged URLs because they can carry tokens. Database errors are logged as message and stack only, without their bound query parameters.

A failed sign-in logs the stored username, and only when the attempt matched an existing account, so an operator can spot an attack on one account. What the caller typed is never logged, because people do paste their password into the username box. An attempt that matches nobody, or a rate-limited one, has no `username` field and is identified by `ip`. Trace spans do not carry query strings either.

## Where the logs go

| Where it runs | How to read them | Retention |
| --- | --- | --- |
| **Intranet, Docker Compose** | `docker compose logs api` | Docker keeps them until the container is removed. Set `logging.options.max-size` and `max-file` on the service, or use the host's log driver (journald, syslog, Loki). |
| **Intranet, systemd** | `journalctl -u <unit>` | Set `SystemMaxUse` in `journald.conf`. |
| **AWS (ECS on Fargate)** | CloudWatch Logs, through the `awslogs` driver. The [Terraform example](../deploy/terraform/aws) already creates the log group with 30-day retention. | Change `retention_in_days`. |
| **AWS (EKS)** | Ship container stdout with Fluent Bit or the CloudWatch agent. | Set on the log group. |
| **GCP (Cloud Run, GKE)** | Cloud Logging collects stdout with no setup. | Set on the log bucket (30 days by default). |

Notes for the cloud targets:

- **GCP severity:** every line carries a `severity` field, so Cloud Logging colours and filters entries natively (`severity>=WARNING`). The log text is in `jsonPayload.msg`.
- **Health checks:** a load balancer that calls `GET /api/health` every few seconds produces one log line per call. Set `LOG_HTTP_REQUESTS=false` on cloud installs, since the load balancer already keeps its own access log.
- **Reverse proxies:** set `TRUST_PROXY` so the logged client IP is the caller, not the proxy.

## Tracing (optional, OpenTelemetry)

Off by default. Nothing is loaded and nothing is sent until you set an OTLP endpoint:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318
```

The API then exports **traces only**, over OTLP/HTTP, for incoming HTTP and gRPC calls, Express, NestJS handlers and PostgreSQL queries. Health checks are not traced. Log lines written inside a traced request also carry `trace_id` and `span_id`, so you can jump from a log line to its trace.

- Use the standard variables to tune it: `OTEL_EXPORTER_OTLP_HEADERS` (for example an API key), `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_SERVICE_NAME` (default `doorward-api`), `OTEL_TRACES_SAMPLER`. `OTEL_SDK_DISABLED=true` turns it off again.
- The collector must accept OTLP over HTTP (port 4318), not only gRPC. AWS (ADOT collector), GCP (Cloud Trace via an OpenTelemetry Collector) and Grafana, Jaeger and others all do.
- SQL statements appear in spans, with parameter values replaced by placeholders. Treat the trace backend with the same care as the logs.
- Only the API is traced. MS SQL Server queries are not instrumented (PostgreSQL only).

## Known gaps

- The OpenID Connect routes (`/oidc/...`, including `/token` and the sign-in page) are not access-logged and have no request ID. Their auth failures are still logged, with the client IP.
- gRPC calls have no request ID. Unexpected gRPC errors are logged as errors.
