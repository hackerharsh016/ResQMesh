import { TransportType } from './node';

export enum TransferStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMEOUT = 'TIMEOUT'
}

export interface BundleTransfer {
  transferId: string;
  sessionId: string;
  bundleId: string;
  senderNodeId: string;
  receiverNodeId: string;
  transport: TransportType;
  startedAt: number;
  completedAt?: number;
  bytesSent: number;
  status: TransferStatus;
  errorCode?: string;
}

export interface BundleHop {
  hopId: string;
  bundleId: string;
  fromNodeId: string;
  toNodeId: string;
  transport: TransportType;
  hopNumber: number;
  transferredAt: number;
  status: TransferStatus;
}
