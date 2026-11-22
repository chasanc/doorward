import type { Span } from '@opentelemetry/api';
import { expect, it } from 'vitest';
import { httpTraceOptions } from './http-trace-options.js';

it('blanks the query string on an incoming request span before export', () => {
  const attributes: Record<string, unknown> = { 'url.path': '/cb', 'url.query': 'code=SECRET&state=SECRET2' };
  const span = { setAttribute: (key: string, value: unknown) => ((attributes[key] = value), span) } as unknown as Span;
  httpTraceOptions.applyCustomAttributesOnSpan?.(span, {} as never, {} as never);
  expect(JSON.stringify(attributes)).not.toMatch(/SECRET/);
  expect(attributes['url.path']).toBe('/cb');
});

it('keeps ignoring health checks', () => {
  expect(httpTraceOptions.ignoreIncomingRequestHook?.({ url: '/api/health' } as never)).toBe(true);
  expect(httpTraceOptions.ignoreIncomingRequestHook?.({ url: '/api/users' } as never)).toBe(false);
});
