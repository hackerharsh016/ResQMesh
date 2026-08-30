import { db } from '../database';
import { TransportType } from '../../transport/types';

export interface PeerTransportRecord {
  nodeId: string;
  transport: TransportType;
  supported: boolean;
  lastSeenAt: number;
  signalStrength?: number;
}

export interface PeerTransportRepository {
  upsert(nodeId: string, transport: TransportType, signalStrength?: number): Promise<void>;
  getByNode(nodeId: string): Promise<PeerTransportRecord[]>;
}

export class SQLitePeerTransportRepository implements PeerTransportRepository {
  async upsert(nodeId: string, transport: TransportType, signalStrength?: number): Promise<void> {
    await db.executeSql(
      `INSERT INTO peer_transports (node_id, transport, supported, last_seen_at, signal_strength)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(node_id, transport) DO UPDATE SET
         supported = 1,
         last_seen_at = excluded.last_seen_at,
         signal_strength = excluded.signal_strength`,
      [nodeId, transport, Date.now(), signalStrength ?? null]
    );
  }

  async getByNode(nodeId: string): Promise<PeerTransportRecord[]> {
    const res = await db.executeSql('SELECT * FROM peer_transports WHERE node_id = ? AND supported = 1', [nodeId]);
    return res.rows._array.map((row: any) => ({
      nodeId: row.node_id,
      transport: row.transport as TransportType,
      supported: row.supported === 1,
      lastSeenAt: row.last_seen_at,
      signalStrength: row.signal_strength
    }));
  }
}
