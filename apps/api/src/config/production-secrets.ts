const DEMO_JWT = 'change-me';

/**
 * Production refuses to boot with an empty manage key or the local JWT secret.
 * `DOORWARD_DEMO=true` is the Compose demo, which ships those defaults on purpose.
 * A check-only key that equals the manage key is refused in every environment.
 */
export function assertProductionSecrets(input: {
  nodeEnv: string | undefined;
  demo: string | undefined;
  manageKey: string;
  checkKey: string;
  jwtSecret: string;
}): void {
  const manage = input.manageKey.trim();
  const check = input.checkKey.trim();
  if (manage && check && manage === check) {
    throw new Error('GRPC_CHECK_API_KEY must differ from GRPC_API_KEY');
  }
  if (input.nodeEnv !== 'production' || input.demo === 'true') return;
  if (!manage) {
    throw new Error('GRPC_API_KEY is required when NODE_ENV=production');
  }
  if (input.jwtSecret.trim() === DEMO_JWT) {
    throw new Error('JWT_SECRET must not be "change-me" when NODE_ENV=production');
  }
}
