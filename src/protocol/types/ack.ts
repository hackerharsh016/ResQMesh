export enum AckType {
  RECEIVED = 'RECEIVED',
  FORWARDED = 'FORWARDED',
  DELIVERED = 'DELIVERED'
}

export interface BundleAck {
  ackId: string;
  bundleId: string;
  ackType: AckType;
  sourceNodeId: string;
  targetNodeId?: string;
  createdAt: number;
  receivedAt?: number;
}

export enum SyncStatus {
  WAITING = 'WAITING',
  UPLOADING = 'UPLOADING',
  RETRY_PENDING = 'RETRY_PENDING',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED'
}

export interface GatewaySyncItem {
  bundleId: string;
  gatewayNodeId?: string;
  attempts: number;
  lastAttemptAt?: number;
  nextAttemptAt?: number;
  status: SyncStatus;
  serverReceiptId?: string;
  lastError?: string;
  updatedAt: number;
}
