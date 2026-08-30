import { EmergencyBundle, SecurityMetadata } from './types/bundle';
import { NodeIdentity } from './types/node';
import { KeystoreModule } from '../native/KeystoreModule';
import { CanonicalSerializer } from './CanonicalSerializer';
// In a real RN app, we would use react-native-quick-crypto or similar for hashing
// import { createHash } from 'react-native-quick-crypto';

export class SigningFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SigningFailedError';
  }
}

export class SecurityService {
  static async sign(bundle: EmergencyBundle, identity: NodeIdentity): Promise<SecurityMetadata> {
    if (!identity.privateKeyRef) {
      throw new SigningFailedError('Missing privateKeyRef in identity');
    }

    const canonicalString = CanonicalSerializer.serializeForSigning(bundle);
    
    try {
      const result = await KeystoreModule.sign(identity.privateKeyRef, canonicalString);
      const integrityHash = this.computeIntegrityHash(bundle);
      
      return {
        signature: result.signature,
        integrityHash,
        keyId: undefined // v1: single key per node
      };
    } catch (e) {
      throw new SigningFailedError(`Failed to sign bundle: ${e}`);
    }
  }

  static async verify(bundle: EmergencyBundle, senderPublicKey: string): Promise<boolean> {
    if (!bundle.security || !bundle.security.signature || !bundle.security.integrityHash) {
      return false;
    }

    // Verify Integrity Hash (covers full payload to catch transport corruption)
    const expectedHash = this.computeIntegrityHash(bundle);
    if (bundle.security.integrityHash !== expectedHash) {
      return false;
    }

    const canonicalString = CanonicalSerializer.serializeForSigning(bundle);
    
    try {
      return await KeystoreModule.verify(senderPublicKey, canonicalString, bundle.security.signature);
    } catch (e) {
      // Reject ambiguity
      return false;
    }
  }

  static computeIntegrityHash(bundle: EmergencyBundle): string {
    // EMP §97: Compute a fast hash over the full payload bytes for corruption detection.
    // In this RN stub, we just return a pseudo-hash using the canonical serializer output 
    // plus mutable fields to detect any tampering/corruption.
    const dataToHash = CanonicalSerializer.serializeForSigning(bundle) + bundle.routing.hopCount + bundle.routing.replicationBudget;
    
    // STUB: return a dummy hash. 
    // REAL: return createHash('sha256').update(dataToHash).digest('hex');
    let hash = 0;
    for (let i = 0; i < dataToHash.length; i++) {
      const char = dataToHash.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `sha256_stub_${Math.abs(hash)}`;
  }
}
