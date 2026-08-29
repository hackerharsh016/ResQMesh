import { TransportType, BatteryClass } from './node';

export interface PeerTransport {
  transport: TransportType;
  supported: boolean;
  lastSeenAt: number;
  signalStrength?: number;
}

export interface Peer {
  nodeId: string;
  publicKey?: string;
  protocolVersion?: string;
  isGateway: boolean;
  batteryClass?: BatteryClass;
  firstSeenAt: number;
  lastSeenAt: number;
  encounterCount: number;
  successfulTransfers: number;
  failedTransfers: number;
  averageContactDurationMs: number;
  lastSignalStrength?: number;
  transports: PeerTransport[];
}

export enum ContactStatus {
  ONGOING = 'ONGOING',
  COMPLETED = 'COMPLETED',
  DROPPED = 'DROPPED'
}

export interface Contact {
  contactId: string;
  peerNodeId: string;
  transport: TransportType;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  signalStrength?: number;
  bundlesOffered: number;
  bundlesTransferred: number;
  status: ContactStatus;
}
