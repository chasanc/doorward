import type { HttpInstrumentationConfig } from '@opentelemetry/instrumentation-http';

/** Options for the HTTP instrumentation. Kept apart from tracing.ts so a test can use the real thing. */
export const httpTraceOptions: HttpInstrumentationConfig = {
  // Health checks would otherwise be one trace every few seconds.
  ignoreIncomingRequestHook: (req) => req.url === '/api/health' || req.url === '/health',
  // The instrumentation only blanks AWS signature parameters, so OAuth state, nonce and codes would be exported.
  applyCustomAttributesOnSpan: (span) => {
    span.setAttribute('url.query', '');
  },
};
