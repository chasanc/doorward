export type ApiKeyRole = 'open' | 'manage' | 'check' | 'none';

/** `open` is local development: both keys empty, so every call is allowed. */
export function apiKeyRole(keys: { manage: string; check: string }, provided: string): ApiKeyRole {
  const manage = keys.manage.trim();
  const check = keys.check.trim();
  const got = provided.trim();
  if (!manage && !check) return 'open';
  if (manage && got === manage) return 'manage';
  if (check && got === check) return 'check';
  return 'none';
}

/** A check-only key may call Check and BatchCheck. A manage key may call every RPC. */
export function grpcAllows(role: ApiKeyRole, method: string): boolean {
  if (role === 'open' || role === 'manage') return true;
  return role === 'check' && (method === 'check' || method === 'batchCheck');
}

export function isOwnCheck(
  session: { sub: string; userKey: string },
  check: { userId?: string; userKey?: string },
): boolean {
  if (check.userId) return check.userId.toLowerCase() === session.sub.toLowerCase();
  if (check.userKey) return check.userKey === session.userKey;
  return false;
}

export type CheckDecision = 'app' | 'self' | 'forbidden' | 'unauthenticated';

/** REST Check: an app key may ask about anyone; a session may ask only about itself. */
export function checkDecision(
  role: ApiKeyRole,
  session: { sub: string; userKey: string } | undefined,
  checks: { userId?: string; userKey?: string }[],
): CheckDecision {
  if (role === 'open' || role === 'manage' || role === 'check') return 'app';
  if (!session) return 'unauthenticated';
  if (checks.length > 0 && checks.every((item) => isOwnCheck(session, item))) return 'self';
  return 'forbidden';
}
