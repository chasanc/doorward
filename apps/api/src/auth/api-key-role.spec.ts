import { describe, expect, it } from 'vitest';
import { apiKeyRole, checkDecision, grpcAllows } from './api-key-role.js';

const session = { sub: 'user-1', userKey: 'ada' };

describe('apiKeyRole', () => {
  it('is open when both keys are empty', () => {
    expect(apiKeyRole({ manage: '', check: '  ' }, '')).toBe('open');
  });

  it('tells a manage key from a check-only key', () => {
    const keys = { manage: 'manage-secret', check: 'check-secret' };
    expect(apiKeyRole(keys, 'manage-secret')).toBe('manage');
    expect(apiKeyRole(keys, 'check-secret')).toBe('check');
    expect(apiKeyRole(keys, 'nope')).toBe('none');
  });
});

describe('grpcAllows', () => {
  it('lets a check-only key call Check and BatchCheck', () => {
    expect(grpcAllows('check', 'check')).toBe(true);
    expect(grpcAllows('check', 'batchCheck')).toBe(true);
    expect(grpcAllows('check', 'createUser')).toBe(false);
  });
});

describe('checkDecision', () => {
  const own = { userId: 'user-1', permission: 'invoice.approve' };

  it('lets an app key check anyone', () => {
    expect(checkDecision('check', undefined, [{ userId: 'other' }])).toBe('app');
  });

  it('lets a session check only itself', () => {
    expect(checkDecision('none', session, [own])).toBe('self');
    expect(checkDecision('none', session, [{ userKey: 'ada' }])).toBe('self');
    expect(checkDecision('none', session, [{ userId: 'other' }])).toBe('forbidden');
    expect(checkDecision('none', session, [own, { userId: 'other' }])).toBe('forbidden');
    expect(checkDecision('none', undefined, [own])).toBe('unauthenticated');
  });
});
