import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { apiKeyRole, checkDecision } from './api-key-role.js';
import { AUTH_COOKIE, type SessionPayload } from './auth.constants.js';

export type CheckAuth = { kind: 'app' } | { kind: 'self'; session: SessionPayload };

export function headerValue(request: Request, name: string): string {
  const value = request.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first.trim() : '';
}

function sessionOf(jwt: JwtService, request: Request): SessionPayload | undefined {
  const bearer = /^Bearer (.+)$/i.exec(request.headers.authorization ?? '');
  const token = request.cookies?.[AUTH_COOKIE] ?? bearer?.[1];
  if (!token || typeof token !== 'string') return undefined;
  try {
    return jwt.verify<SessionPayload>(token);
  } catch {
    return undefined;
  }
}

function checksIn(body: unknown): { userId?: string; userKey?: string }[] {
  if (!body || typeof body !== 'object') return [];
  const record = body as { checks?: unknown; userId?: string; userKey?: string; permission?: string };
  if (Array.isArray(record.checks)) {
    return record.checks.filter((item) => item && typeof item === 'object');
  }
  if ('userId' in record || 'userKey' in record || 'permission' in record) return [record];
  return [];
}

/** Check and BatchCheck: a check-only or manage key, or a signed-in user asking about themselves. */
@Injectable()
export class CheckRouteGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { checkAuth?: CheckAuth }>();
    const role = apiKeyRole(
      {
        manage: this.config.getOrThrow<string>('grpcApiKey'),
        check: this.config.getOrThrow<string>('grpcCheckApiKey'),
      },
      headerValue(request, 'x-api-key'),
    );
    const session = sessionOf(this.jwt, request);
    const decision = checkDecision(role, session, checksIn(request.body));
    if (decision === 'app') {
      request.checkAuth = { kind: 'app' };
      return true;
    }
    if (decision === 'self' && session) {
      request.checkAuth = { kind: 'self', session };
      return true;
    }
    if (decision === 'forbidden') {
      throw new ForbiddenException('You can only check your own user');
    }
    throw new UnauthorizedException('Not signed in');
  }
}
