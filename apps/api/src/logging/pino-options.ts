import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { trace } from '@opentelemetry/api';
import type { Params } from 'nestjs-pino';

/** Field names that must never reach a log line, at the top level or one level down. */
const SECRET_KEYS = [
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'code',
  'totp',
  'totpSecret',
  'secret',
  'secretHash',
  'clientSecret',
  'client_secret',
  'token',
  'accessToken',
  'access_token',
  'refresh_token',
  'id_token',
  'apiKey',
  'api_key',
];

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  ...SECRET_KEYS.flatMap((key) => [key, `*.${key}`, `req.body.${key}`]),
];

/** What pino-http hands the serializer: pino's std request view, with the Express request under `raw`. */
type WrappedReq = {
  id?: unknown;
  method?: string;
  url?: string;
  remoteAddress?: string;
  raw?: { ip?: string };
};

/** Method, path, caller: enough to trace a request. The query string is dropped because it can carry tokens. */
function serializeReq(req: WrappedReq) {
  return {
    id: req.id,
    method: req.method,
    url: (req.url ?? '').split('?')[0],
    // raw.ip honours TRUST_PROXY, so behind a load balancer this is the client, not the proxy.
    remoteAddress: req.raw?.ip ?? req.remoteAddress,
  };
}

// A caller (proxy, load balancer) may send its own ID. Only plain tokens are kept, so a header cannot forge log lines.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestId(incoming: string | string[] | undefined): string {
  return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

// Cloud Logging reads `severity`; without it every stdout line shows as plain info. Other collectors ignore it.
const SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

export function pinoOptions(opts: { level: string; httpRequests: boolean }): Params {
  return {
    pinoHttp: {
      level: opts.level,
      // With tracing on, each line inside a traced request carries the ids that join it to its trace.
      mixin: () => {
        const span = trace.getActiveSpan()?.spanContext();
        return span ? { trace_id: span.traceId, span_id: span.spanId } : {};
      },
      formatters: {
        level: (label, number) => ({ severity: SEVERITY[label] ?? 'DEFAULT', level: number }),
      },
      genReqId: (req, res) => {
        const id = requestId(req.headers['x-request-id']);
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: opts.httpRequests,
      redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
      serializers: {
        req: serializeReq,
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    },
  };
}
