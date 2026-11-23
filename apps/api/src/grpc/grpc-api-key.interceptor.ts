import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import type { Metadata } from '@grpc/grpc-js';
import type { Observable } from 'rxjs';
import { apiKeyRole, grpcAllows } from '../auth/api-key-role.js';
import { logAuthFailure } from '../logging/auth-failure.js';

@Injectable()
export class GrpcApiKeyInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'rpc') {
      return next.handle();
    }
    const role = apiKeyRole(
      {
        manage: this.config.getOrThrow<string>('grpcApiKey'),
        check: this.config.getOrThrow<string>('grpcCheckApiKey'),
      },
      firstMetadata(context.switchToRpc().getContext<Metadata>(), 'x-api-key'),
    );
    const method = context.getHandler()?.name ?? '';
    if (grpcAllows(role, method)) {
      return next.handle();
    }
    logAuthFailure(this.config, role === 'check' ? 'check_only_key' : 'invalid_api_key');
    throw new RpcException({
      code: GrpcStatus.UNAUTHENTICATED,
      message: role === 'check' ? 'check-only api key' : 'invalid api key',
    });
  }
}

function firstMetadata(metadata: Metadata | undefined, key: string): string {
  const value = metadata?.get?.(key)?.[0];
  if (value == null) {
    return '';
  }
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}
