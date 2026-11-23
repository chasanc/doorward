import { describe, expect, it } from 'vitest';
import { assertProductionSecrets } from './production-secrets.js';

const live = {
  nodeEnv: 'production',
  demo: undefined,
  manageKey: 'manage-secret',
  checkKey: '',
  jwtSecret: 'real-secret',
};

describe('assertProductionSecrets', () => {
  it('accepts a production manage key and a non-default JWT secret', () => {
    expect(() => assertProductionSecrets(live)).not.toThrow();
  });

  it('refuses an empty manage key or the local JWT secret in production', () => {
    expect(() => assertProductionSecrets({ ...live, manageKey: ' ' })).toThrow(/GRPC_API_KEY/);
    expect(() => assertProductionSecrets({ ...live, jwtSecret: 'change-me' })).toThrow(/JWT_SECRET/);
  });

  it('allows the Compose demo to keep the local defaults', () => {
    expect(() =>
      assertProductionSecrets({ ...live, demo: 'true', manageKey: '', jwtSecret: 'change-me' }),
    ).not.toThrow();
  });

  it('refuses a check-only key that is the manage key', () => {
    expect(() => assertProductionSecrets({ ...live, checkKey: live.manageKey })).toThrow(/GRPC_CHECK_API_KEY/);
  });
});
