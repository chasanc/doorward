import { NIL_UUID } from './ids.js';

/** Who is calling. `companyId` is set from the company-key header on gRPC calls. */
export type ServiceCall = {
  source: 'rest' | 'grpc';
  companyId?: string;
  /** signed-in user behind a REST call, recorded in the change history */
  actorUserId?: string;
};

/**
 * Company a caller is confined to, or undefined when multi-company mode is off.
 * REST sets `companyId` from the signed-in user. gRPC sets it from `company-key`.
 * The nil id matches no company row, so a missing company fails closed.
 */
export function confinedCompany(multiCompany: boolean, call: ServiceCall): string | undefined {
  if (!multiCompany) return undefined;
  return call.companyId ?? NIL_UUID;
}
