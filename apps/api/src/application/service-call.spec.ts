import { describe, expect, it } from 'vitest';
import { NIL_UUID } from './ids.js';
import { confinedCompany } from './service-call.js';

describe('confinedCompany', () => {
  it('does not confine a single-company deployment', () => {
    expect(confinedCompany(false, { source: 'rest', companyId: 'c1' })).toBeUndefined();
  });

  it('confines REST to the signed-in company and fails closed without one', () => {
    expect(confinedCompany(true, { source: 'rest', companyId: 'c1' })).toBe('c1');
    expect(confinedCompany(true, { source: 'rest' })).toBe(NIL_UUID);
    expect(confinedCompany(true, { source: 'grpc' })).toBe(NIL_UUID);
  });
});
