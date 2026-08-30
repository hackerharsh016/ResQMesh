import { db } from '../database';
import { EmergencyBundle, BundleSummary, BundleState } from '../../protocol/types/bundle';
import { BundleMapper } from '../mappers/BundleMapper';

export class DuplicateBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateBundleError';
  }
}

export interface BundleRepository {
  create(bundle: EmergencyBundle): Promise<void>;
  getById(bundleId: string): Promise<EmergencyBundle | null>;
  getPending(limit?: number): Promise<EmergencyBundle[]>;
  getSummaries(): Promise<BundleSummary[]>;
  markState(bundleId: string, state: BundleState): Promise<void>;
  incrementHop(bundleId: string): Promise<void>;
  decrementReplicationBudget(bundleId: string): Promise<void>;
  deleteExpired(): Promise<number>;
}

export class SQLiteBundleRepository implements BundleRepository {
  async create(bundle: EmergencyBundle): Promise<void> {
    // check duplicate
    const existing = await db.executeSql('SELECT bundle_id FROM bundles WHERE bundle_id = ? LIMIT 1', [bundle.bundleId]);
    if (existing.rows.length > 0) {
      throw new DuplicateBundleError(`Bundle ${bundle.bundleId} already exists`);
    }

    const row = BundleMapper.toFlatRow(bundle);
    
    await db.executeSql(
      `INSERT INTO bundles (
        bundle_id, incident_id, origin_node_id, destination_type, destination_node_id,
        payload_type, priority, created_at, expires_at, hop_count, max_hop_count,
        replication_budget, state, payload, signature, key_id, integrity_hash,
        created_locally, received_at, delivered_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.bundle_id, row.incident_id, row.origin_node_id, row.destination_type, row.destination_node_id,
        row.payload_type, row.priority, row.created_at, row.expires_at, row.hop_count, row.max_hop_count,
        row.replication_budget, row.state, row.payload, row.signature, row.key_id, row.integrity_hash,
        row.created_locally, row.received_at, row.delivered_at, row.updated_at
      ]
    );
  }

  async getById(bundleId: string): Promise<EmergencyBundle | null> {
    const result = await db.executeSql('SELECT * FROM bundles WHERE bundle_id = ? LIMIT 1', [bundleId]);
    if (result.rows.length === 0) return null;
    
    try {
      return BundleMapper.toDomain(result.rows._array[0]);
    } catch (e) {
      // Fallback/log logic if payload JSON is malformed
      console.error('Failed to parse bundle payload', e);
      return null;
    }
  }

  async getPending(limit: number = 50): Promise<EmergencyBundle[]> {
    const result = await db.executeSql(
      `SELECT * FROM bundles WHERE state IN ('QUEUED', 'PERSISTED') 
       ORDER BY priority ASC, expires_at ASC LIMIT ?`,
      [limit]
    );

    const bundles: EmergencyBundle[] = [];
    for (const row of result.rows._array) {
      try {
        bundles.push(BundleMapper.toDomain(row));
      } catch (e) {
        console.error('Failed to parse bundle', row.bundle_id, e);
      }
    }
    return bundles;
  }

  async getSummaries(): Promise<BundleSummary[]> {
    const result = await db.executeSql('SELECT bundle_id, incident_id, priority, state, created_at, expires_at FROM bundles');
    return result.rows._array.map(row => ({
      bundleId: row.bundle_id,
      incidentId: row.incident_id,
      priority: row.priority,
      state: row.state as BundleState,
      creationTimestamp: row.created_at,
      expiresAt: row.expires_at
    }));
  }

  async markState(bundleId: string, state: BundleState): Promise<void> {
    await db.executeSql('UPDATE bundles SET state = ?, updated_at = ? WHERE bundle_id = ?', [state, Date.now(), bundleId]);
  }

  async incrementHop(bundleId: string): Promise<void> {
    await db.executeSql('UPDATE bundles SET hop_count = hop_count + 1, updated_at = ? WHERE bundle_id = ?', [Date.now(), bundleId]);
  }

  async decrementReplicationBudget(bundleId: string): Promise<void> {
    await db.executeSql('UPDATE bundles SET replication_budget = MAX(0, replication_budget - 1), updated_at = ? WHERE bundle_id = ?', [Date.now(), bundleId]);
  }

  async deleteExpired(): Promise<number> {
    // Note: The policy of protecting certain bundles from deletion belongs to DTN Engine.
    // This method simply deletes based on expiry strictly as a storage mechanism.
    const now = Date.now();
    const result = await db.executeSql('DELETE FROM bundles WHERE expires_at < ?', [now]);
    return result.rowsAffected;
  }
}
