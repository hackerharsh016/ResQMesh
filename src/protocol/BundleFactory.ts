import { 
  EmergencyBundle, 
  EmergencyPayload, 
  DestinationType, 
  Priority, 
  BundleState 
} from './types/bundle';
import { NodeIdentity, PROTOCOL_VERSION } from './types/node';
import { 
  DEFAULT_TTL_SECONDS, 
  DEFAULT_MAX_HOP_COUNT, 
  DEFAULT_REPLICATION_BUDGET 
} from './constants';
import { SecurityService } from './SecurityService';
import { v4 as uuidv4 } from 'uuid';

export interface CreateBundleInput {
  destinationType: DestinationType;
  destinationNodeId?: string;
  priority: Priority;
  payload: EmergencyPayload;
  incidentId?: string;
}

export class BundleFactory {
  static async createBundle(input: CreateBundleInput, identity: NodeIdentity): Promise<EmergencyBundle> {
    const bundleId = `BNDL-${uuidv4()}`;
    const creationTimestamp = Date.now();
    const ttlSeconds = DEFAULT_TTL_SECONDS[input.priority];
    
    // Create the unsigned bundle
    const bundle: EmergencyBundle = {
      bundleId,
      incidentId: input.incidentId,
      protocolVersion: PROTOCOL_VERSION,
      originNodeId: identity.nodeId,
      creationTimestamp,
      payloadType: 'JSON', // Default for now
      payload: input.payload,
      routing: {
        priority: input.priority,
        ttlSeconds,
        hopCount: 0,
        maxHopCount: DEFAULT_MAX_HOP_COUNT,
        replicationBudget: DEFAULT_REPLICATION_BUDGET[input.priority],
        destinationType: input.destinationType,
        destinationNodeId: input.destinationNodeId,
      },
      security: {
        signature: '', // To be filled
        integrityHash: '' // To be filled
      },
      state: BundleState.CREATED,
      createdLocally: true,
    };

    // Populate security fields before returning. 
    // A bundle must never exist unsigned once createBundle() resolves.
    const securityMetadata = await SecurityService.sign(bundle, identity);
    bundle.security = securityMetadata;

    return bundle;
  }
}
