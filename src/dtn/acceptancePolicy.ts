import { EmergencyBundle } from '../protocol/types/bundle';
import { RejectionReason, AcceptanceResult } from './types';

export interface AcceptanceDependencies {
  isDuplicate(bundleId: string): Promise<boolean>;
  verifySignatureAndIntegrity(bundle: EmergencyBundle, senderPublicKey: string): Promise<{ valid: boolean; reason?: 'INVALID_SIGNATURE' | 'INTEGRITY_MISMATCH' }>;
  ensureCapacity(bundlePriority: number): Promise<boolean>;
}

/**
 * Orchestrates the gates for bundle acceptance.
 * Does NOT persist the bundle itself.
 */
export async function evaluateBundleAcceptance(
  bundle: EmergencyBundle,
  senderPublicKey: string,
  deps: AcceptanceDependencies
): Promise<AcceptanceResult> {
  // 1. Basic structural validation (MALFORMED)
  if (!bundle || !bundle.bundleId || !bundle.originNodeId || !bundle.routing || !bundle.security) {
    return { accepted: false, reason: RejectionReason.MALFORMED };
  }

  // 2. Expiry check (EXPIRED)
  if (bundle.routing.ttlSeconds !== undefined && bundle.creationTimestamp) {
    const expiresAt = bundle.creationTimestamp + (bundle.routing.ttlSeconds * 1000);
    if (expiresAt < Date.now()) {
      return { accepted: false, reason: RejectionReason.EXPIRED };
    }
  }

  // 3. Dedup check (DUPLICATE)
  if (await deps.isDuplicate(bundle.bundleId)) {
    return { accepted: false, reason: RejectionReason.DUPLICATE };
  }

  // 4. Hop sanity check (HOP_LIMIT_EXCEEDED)
  if (bundle.routing.hopCount > bundle.routing.maxHopCount) {
    return { accepted: false, reason: RejectionReason.HOP_LIMIT_EXCEEDED };
  }

  // 5. Signature + integrity verification
  const verification = await deps.verifySignatureAndIntegrity(bundle, senderPublicKey);
  if (!verification.valid) {
    return { accepted: false, reason: verification.reason === 'INTEGRITY_MISMATCH' 
      ? RejectionReason.INTEGRITY_MISMATCH 
      : RejectionReason.INVALID_SIGNATURE };
  }

  // 6. Storage capacity check
  const hasCapacity = await deps.ensureCapacity(bundle.routing.priority);
  if (!hasCapacity) {
    return { accepted: false, reason: RejectionReason.STORAGE_FULL };
  }

  // 7. Success
  return { accepted: true, bundle };
}
