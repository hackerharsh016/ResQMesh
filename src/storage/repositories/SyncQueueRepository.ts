import { GatewaySyncItem, SyncStatus } from '../../protocol/types/ack';

export interface SyncQueueRepository {
  enqueue(item: GatewaySyncItem): Promise<void>;
  getWaiting(limit?: number): Promise<GatewaySyncItem[]>;
  updateStatus(bundleId: string, status: SyncStatus, patch?: Partial<GatewaySyncItem>): Promise<void>;
}
