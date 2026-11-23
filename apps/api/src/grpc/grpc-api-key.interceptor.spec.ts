import { ConfigService } from '@nestjs/config';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { GrpcApiKeyInterceptor } from './grpc-api-key.interceptor.js';

describe('GrpcApiKeyInterceptor', () => {
  const next = { handle: () => of('ok') } as CallHandler;

  function rpcContext(metadata: Metadata, method = 'createUser'): ExecutionContext {
    return {
      getType: () => 'rpc',
      getHandler: () => ({ name: method }),
      switchToRpc: () => ({ getContext: () => metadata }),
    } as unknown as ExecutionContext;
  }

  function configReturning(values: Record<string, string>): ConfigService {
    return { getOrThrow: (key: string) => values[key] ?? '' } as unknown as ConfigService;
  }

  const keys = { grpcApiKey: 'secret', grpcCheckApiKey: 'check-secret' };

  it('skips HTTP', () => {
    const interceptor = new GrpcApiKeyInterceptor(configReturning(keys));
    const http = { getType: () => 'http' } as unknown as ExecutionContext;
    expect(interceptor.intercept(http, next)).toBeDefined();
  });

  it('allows empty keys', () => {
    const interceptor = new GrpcApiKeyInterceptor(configReturning({ grpcApiKey: '', grpcCheckApiKey: '' }));
    expect(() => interceptor.intercept(rpcContext(new Metadata()), next)).not.toThrow();
  });

  it('rejects a missing key when configured', () => {
    const interceptor = new GrpcApiKeyInterceptor(configReturning(keys));
    expect(() => interceptor.intercept(rpcContext(new Metadata()), next)).toThrow(/invalid api key/);
  });

  it('accepts the manage key on any method', () => {
    const interceptor = new GrpcApiKeyInterceptor(configReturning(keys));
    const metadata = new Metadata();
    metadata.set('x-api-key', 'secret');
    expect(() => interceptor.intercept(rpcContext(metadata), next)).not.toThrow();
  });

  it('lets the check-only key call Check and rejects it elsewhere', () => {
    const interceptor = new GrpcApiKeyInterceptor(configReturning(keys));
    const metadata = new Metadata();
    metadata.set('x-api-key', 'check-secret');
    expect(() => interceptor.intercept(rpcContext(metadata, 'check'), next)).not.toThrow();
    expect(() => interceptor.intercept(rpcContext(metadata, 'createUser'), next)).toThrow(/check-only api key/);
  });
});
