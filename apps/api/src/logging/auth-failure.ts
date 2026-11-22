import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const log = new Logger('Auth');

/**
 * One warning per failed sign-in, MFA check, API key check or rate-limit hit, unless LOG_AUTH_FAILURES is false.
 * Fields must never hold a password, code, token, key or anything the caller typed.
 */
export function logAuthFailure(config: ConfigService, reason: string, fields: Record<string, unknown> = {}): void {
  if (config.getOrThrow<boolean>('logAuthFailures')) log.warn({ event: 'auth_failure', reason, ...fields });
}
