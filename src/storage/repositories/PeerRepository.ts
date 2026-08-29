import { db } from '../database';
import { Peer } from '../../protocol/types/peer';

export interface PeerRepository {
  upsert(peer: Peer): Promise<void>;
  getById(nodeId: string): Promise<Peer | null>;
  getRecentPeers(limit?: number): Promise<Peer[]>;
  recordEncounter(peerNodeId: string, durationMs: number): Promise<void>;
  recordTransferSuccess(peerNodeId: string): Promise<void>;
  recordTransferFailure(peerNodeId: string): Promise<void>;
}

export class SQLitePeerRepository implements PeerRepository {
  async upsert(peer: Peer): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.executeSql(
        `INSERT INTO peers (
          node_id, public_key, protocol_version, is_gateway, battery_class,
          first_seen_at, last_seen_at, encounter_count, successful_transfers,
          failed_transfers, average_contact_duration_ms, last_signal_strength, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
        ON CONFLICT(node_id) DO UPDATE SET
          public_key = excluded.public_key,
          protocol_version = excluded.protocol_version,
          is_gateway = excluded.is_gateway,
          battery_class = excluded.battery_class,
          last_seen_at = excluded.last_seen_at,
          encounter_count = excluded.encounter_count,
          successful_transfers = excluded.successful_transfers,
          failed_transfers = excluded.failed_transfers,
          average_contact_duration_ms = excluded.average_contact_duration_ms,
          last_signal_strength = excluded.last_signal_strength,
          updated_at = excluded.updated_at`,
        [
          peer.nodeId, peer.publicKey, peer.protocolVersion, peer.isGateway ? 1 : 0,
          peer.batteryClass, peer.firstSeenAt, peer.lastSeenAt, peer.encounterCount,
          peer.successfulTransfers, peer.failedTransfers, peer.averageContactDurationMs,
          peer.lastSignalStrength, Date.now()
        ]
      );

      await tx.executeSql('DELETE FROM peer_transports WHERE node_id = ?', [peer.nodeId]);

      for (const t of peer.transports) {
        await tx.executeSql(
          `INSERT INTO peer_transports (node_id, transport, supported, last_seen_at, signal_strength)
           VALUES (?, ?, ?, ?, ?)`,
          [peer.nodeId, t.transport, t.supported ? 1 : 0, t.lastSeenAt, t.signalStrength]
        );
      }
    });
  }

  async getById(nodeId: string): Promise<Peer | null> {
    const peerRes = await db.executeSql('SELECT * FROM peers WHERE node_id = ? LIMIT 1', [nodeId]);
    if (peerRes.rows.length === 0) return null;
    
    const row = peerRes.rows._array[0];
    const transportsRes = await db.executeSql('SELECT * FROM peer_transports WHERE node_id = ?', [nodeId]);
    
    return {
      nodeId: row.node_id,
      publicKey: row.public_key,
      protocolVersion: row.protocol_version,
      isGateway: row.is_gateway === 1,
      batteryClass: row.battery_class,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      encounterCount: row.encounter_count,
      successfulTransfers: row.successful_transfers,
      failedTransfers: row.failed_transfers,
      averageContactDurationMs: row.average_contact_duration_ms,
      lastSignalStrength: row.last_signal_strength,
      transports: transportsRes.rows._array.map(t => ({
        transport: t.transport,
        supported: t.supported === 1,
        lastSeenAt: t.last_seen_at,
        signalStrength: t.signal_strength
      }))
    };
  }

  async getRecentPeers(limit: number = 20): Promise<Peer[]> {
    const peerRes = await db.executeSql('SELECT * FROM peers ORDER BY last_seen_at DESC LIMIT ?', [limit]);
    const peers: Peer[] = [];
    for (const row of peerRes.rows._array) {
      peers.push(await this.getById(row.node_id) as Peer);
    }
    return peers;
  }

  async recordEncounter(peerNodeId: string, durationMs: number): Promise<void> {
    await db.executeSql(
      `UPDATE peers SET 
         encounter_count = encounter_count + 1, 
         average_contact_duration_ms = ((average_contact_duration_ms * encounter_count) + ?) / (encounter_count + 1),
         last_seen_at = ?,
         updated_at = ?
       WHERE node_id = ?`,
      [durationMs, Date.now(), Date.now(), peerNodeId]
    );
  }

  async recordTransferSuccess(peerNodeId: string): Promise<void> {
    await db.executeSql('UPDATE peers SET successful_transfers = successful_transfers + 1, updated_at = ? WHERE node_id = ?', [Date.now(), peerNodeId]);
  }

  async recordTransferFailure(peerNodeId: string): Promise<void> {
    await db.executeSql('UPDATE peers SET failed_transfers = failed_transfers + 1, updated_at = ? WHERE node_id = ?', [Date.now(), peerNodeId]);
  }
}
