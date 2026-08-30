import {
  EmergencyBundle,
  EmergencyPayload,
  RoutingMetadata,
  SecurityMetadata,
  BundleState
} from '../../protocol/types/bundle';

export class BundleMapper {
  static toDomain(row: any): EmergencyBundle {
    const payload: EmergencyPayload = JSON.parse(row.payload);
    const ttlSeconds = Math.floor((row.expires_at - row.created_at) / 1000);

    const routing: RoutingMetadata = {
      priority: row.priority,
      ttlSeconds,
      hopCount: row.hop_count,
      maxHopCount: row.max_hop_count,
      replicationBudget: row.replication_budget,
      destinationType: row.destination_type,
      destinationNodeId: row.destination_node_id
    };

    const security: SecurityMetadata = {
      keyId: row.key_id,
      signature: row.signature,
      integrityHash: row.integrity_hash
    };

    return {
      bundleId: row.bundle_id,
      incidentId: row.incident_id,
      protocolVersion: '1.0', // Not stored in table, assumed
      originNodeId: row.origin_node_id,
      creationTimestamp: row.created_at,
      payloadType: row.payload_type,
      payload,
      routing,
      security,
      state: row.state as BundleState,
      createdLocally: row.created_locally === 1,
      receivedAt: row.received_at,
      deliveredAt: row.delivered_at
    };
  }

  static toFlatRow(bundle: EmergencyBundle): any {
    const expiresAt = bundle.creationTimestamp + (bundle.routing.ttlSeconds * 1000);

    return {
      bundle_id: bundle.bundleId,
      incident_id: bundle.incidentId,
      origin_node_id: bundle.originNodeId,
      destination_type: bundle.routing.destinationType,
      destination_node_id: bundle.routing.destinationNodeId,
      payload_type: bundle.payloadType,
      priority: bundle.routing.priority,
      created_at: bundle.creationTimestamp,
      expires_at: expiresAt,
      hop_count: bundle.routing.hopCount,
      max_hop_count: bundle.routing.maxHopCount,
      replication_budget: bundle.routing.replicationBudget,
      state: bundle.state,
      payload: JSON.stringify(bundle.payload),
      signature: bundle.security.signature,
      key_id: bundle.security.keyId,
      integrity_hash: bundle.security.integrityHash,
      created_locally: bundle.createdLocally ? 1 : 0,
      received_at: bundle.receivedAt,
      delivered_at: bundle.deliveredAt,
      updated_at: Date.now()
    };
  }
}
