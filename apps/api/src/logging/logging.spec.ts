import { Writable } from 'node:stream';
import { Logger, type LoggerService } from '@nestjs/common';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { envFlag } from '../config/load-env.js';
import type { ConfigService } from '@nestjs/config';
import { logAuthFailure } from './auth-failure.js';
import { parseLogLevel } from './log-level.js';
import { pinoOptions, requestId } from './pino-options.js';
import { quietUntilReady } from './startup-quiet.js';

function logLine(entry: Record<string, unknown>): string {
  let out = '';
  const stream = new Writable({
    write(chunk, _enc, done) {
      out += String(chunk);
      done();
    },
  });
  const { redact } = pinoOptions({ level: 'info', httpRequests: true }).pinoHttp as { redact: pino.LoggerOptions['redact'] };
  pino({ redact }, stream).info(entry);
  return out;
}

describe('redaction', () => {
  it('masks secrets at the top level, one level down, and in request headers and bodies', () => {
    const out = logLine({
      password: 'pw-top',
      user: { code: 'totp-nested', clientSecret: 'cs-nested', accessToken: 'tok-nested' },
      req: {
        headers: { authorization: 'Bearer hdr-auth', cookie: 'doorward_token=hdr-cookie', 'x-api-key': 'hdr-key' },
        body: { password: 'pw-body', code: '123456' },
      },
      res: { headers: { 'set-cookie': 'doorward_token=resp-cookie' } },
      username: 'alice',
    });
    for (const secret of ['pw-top', 'totp-nested', 'cs-nested', 'tok-nested', 'hdr-auth', 'hdr-cookie', 'hdr-key', 'pw-body', '123456', 'resp-cookie']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[Redacted]');
    expect(out).toContain('alice');
  });
});

describe('severity', () => {
  it.each([
    ['info', 'INFO', 30],
    ['warn', 'WARNING', 40],
    ['error', 'ERROR', 50],
    ['fatal', 'CRITICAL', 60],
  ])('%s lines carry severity %s and the numeric level', (method, severity, level) => {
    let out = '';
    const stream = new Writable({
      write(chunk, _enc, done) {
        out += String(chunk);
        done();
      },
    });
    const { formatters } = pinoOptions({ level: 'info', httpRequests: true }).pinoHttp as { formatters: pino.LoggerOptions['formatters'] };
    (pino({ formatters }, stream) as unknown as Record<string, (msg: string) => void>)[method]('x');
    expect(JSON.parse(out)).toMatchObject({ severity, level });
  });
});

describe('request id', () => {
  it('keeps a plain incoming id', () => {
    expect(requestId('abc-12345-xyz')).toBe('abc-12345-xyz');
  });

  it.each([undefined, '', 'short', 'has space in it', 'quote"}{injection', 'x'.repeat(65), ['a-b-c-d-e-f-g-h']])(
    'replaces %j with a generated uuid',
    (incoming) => {
      expect(requestId(incoming)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    },
  );
});

describe('http request logging toggle', () => {
  it('passes LOG_HTTP_REQUESTS to autoLogging', () => {
    expect(pinoOptions({ level: 'info', httpRequests: false }).pinoHttp).toMatchObject({ autoLogging: false });
    expect(pinoOptions({ level: 'info', httpRequests: true }).pinoHttp).toMatchObject({ autoLogging: true });
  });

  it('drops the query string and reports the client ip from the express request', () => {
    const { serializers } = pinoOptions({ level: 'info', httpRequests: true }).pinoHttp as {
      serializers: { req: (req: unknown) => unknown };
    };
    expect(serializers.req({ id: 'r1', method: 'GET', url: '/cb?code=SECRET&state=x', remoteAddress: '10.0.0.1', raw: { ip: '203.0.113.9' } })).toEqual({
      id: 'r1',
      method: 'GET',
      url: '/cb',
      remoteAddress: '203.0.113.9',
    });
  });
});

describe('startup logging toggle', () => {
  const inner = (): LoggerService => ({ log: vi.fn(), debug: vi.fn(), verbose: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() });

  it('hides info output while starting but never hides warnings or errors', () => {
    const base = inner();
    const logger = quietUntilReady(base);
    logger.log('boot');
    logger.warn('careful');
    logger.error('broken');
    expect(base.log).not.toHaveBeenCalled();
    expect(base.warn).toHaveBeenCalledWith('careful');
    expect(base.error).toHaveBeenCalledWith('broken');
  });

  it('logs normally after ready()', () => {
    const base = inner();
    const logger = quietUntilReady(base);
    logger.ready();
    logger.log('running');
    expect(base.log).toHaveBeenCalledWith('running');
  });
});

describe('auth failure logging toggle', () => {
  afterEach(() => vi.restoreAllMocks());

  const configWith = (on: boolean) => ({ getOrThrow: () => on }) as unknown as ConfigService;

  it('logs a structured warning when on and nothing when off', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    logAuthFailure(configWith(true), 'bad_credentials', { username: 'alice' });
    expect(warn).toHaveBeenCalledWith({ event: 'auth_failure', reason: 'bad_credentials', username: 'alice' });
    warn.mockClear();
    logAuthFailure(configWith(false), 'bad_credentials');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('parseLogLevel', () => {
  it.each([
    ['info', 'info'],
    [' WARN ', 'warn'],
    ['silent', 'silent'],
  ])('%j -> %s', (value, expected) => {
    expect(parseLogLevel(value)).toBe(expected);
  });

  it.each(['verbose', 'eror', '', undefined])('rejects %j with a message naming LOG_LEVEL', (value) => {
    expect(() => parseLogLevel(value)).toThrow(/LOG_LEVEL must be one of/);
  });
});

describe('envFlag', () => {
  it.each([
    [undefined, true],
    ['', true],
    ['true', true],
    ['false', false],
    [' FALSE ', false],
  ])('%j -> %s', (value, expected) => {
    expect(envFlag({ LOG_X: value }, 'LOG_X')).toBe(expected);
  });

  it('falls back to the process environment when .env does not set the key', () => {
    vi.stubEnv('LOG_X', 'false');
    expect(envFlag({}, 'LOG_X')).toBe(false);
    expect(envFlag({ LOG_X: 'true' }, 'LOG_X')).toBe(true); // .env wins
    vi.unstubAllEnvs();
  });
});
