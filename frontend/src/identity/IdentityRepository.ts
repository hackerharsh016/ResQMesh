import { NodeIdentity } from '../protocol/types/node';
import { db } from '../storage/database';

export interface IdentityRepository {
  getIdentity(): Promise<NodeIdentity | null>;
  saveIdentity(identity: NodeIdentity): Promise<void>;
}

export class SQLiteIdentityRepository implements IdentityRepository {
  async getIdentity(): Promise<NodeIdentity | null> {
    const result = await db.executeSql('SELECT * FROM node_identity LIMIT 1');
    if (result.rows._array.length > 0) {
      const row = result.rows._array[0];
      return {
        nodeId: row.node_id,
        publicKey: row.public_key,
        privateKeyRef: row.encrypted_private_key,
        protocolVersion: row.protocol_version,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    }
    return null;
  }

  async saveIdentity(identity: NodeIdentity): Promise<void> {
    await db.executeSql(
      `INSERT OR REPLACE INTO node_identity 
      (node_id, public_key, encrypted_private_key, protocol_version, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        identity.nodeId,
        identity.publicKey,
        identity.privateKeyRef,
        identity.protocolVersion,
        identity.createdAt,
        identity.updatedAt
      ]
    );
  }
}
