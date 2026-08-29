import { EmergencyBundle } from './types/bundle';
import { PROTOCOL_VERSION } from './constants';

export class CanonicalSerializer {
  /**
   * Serializes ONLY the immutable subset of a bundle into a
   * deterministic byte string, suitable for signing and integrity hashing.
   */
  static serializeForSigning(bundle: EmergencyBundle): string {
    // Extract immutable fields (EMP section 24)
    // bundleId, originNodeId, destinationType, destinationNodeId, payloadType, priority, createdAt, expiresAt, payload
    
    const immutableData = {
      version: PROTOCOL_VERSION,
      bundleId: bundle.bundleId,
      originNodeId: bundle.originNodeId,
      creationTimestamp: bundle.creationTimestamp,
      payloadType: bundle.payloadType,
      payload: bundle.payload,
      routing: {
        priority: bundle.routing.priority,
        destinationType: bundle.routing.destinationType,
        destinationNodeId: bundle.routing.destinationNodeId,
      }
    };

    // Serialize deterministically
    return this.deterministicStringify(immutableData);
  }

  private static deterministicStringify(obj: any): string {
    if (obj === null || obj === undefined) {
      return 'null';
    }

    if (typeof obj !== 'object') {
      if (typeof obj === 'string') {
        return JSON.stringify(obj);
      }
      return String(obj);
    }

    if (Array.isArray(obj)) {
      const arrStr = obj.map(item => this.deterministicStringify(item)).join(',');
      return `[${arrStr}]`;
    }

    const keys = Object.keys(obj).sort();
    const keyVals = keys
      .filter(key => obj[key] !== undefined) // Skip undefined properties
      .map(key => `"${key}":${this.deterministicStringify(obj[key])}`);
    
    return `{${keyVals.join(',')}}`;
  }
}
