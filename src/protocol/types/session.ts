import { TransportType } from './node';

export enum SessionState {
  DISCOVERED = 'DISCOVERED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  NEGOTIATING = 'NEGOTIATING',
  SYNCING = 'SYNCING',
  TRANSFERRING = 'TRANSFERRING',
  IDLE = 'IDLE',
  DISCONNECTED = 'DISCONNECTED',
  TIMEOUT = 'TIMEOUT',
  FAILED = 'FAILED'
}

export interface ProtocolSession {
  sessionId: string;
  localNodeId: string;
  peerNodeId: string;
  transport: TransportType;
  startedAt: number;
  endedAt?: number;
  state: SessionState;
  protocolVersion?: string;
  createdAt: number;
}
