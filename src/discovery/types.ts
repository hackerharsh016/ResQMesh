export enum SessionState {
  DISCOVERED = "DISCOVERED",
  HANDSHAKING = "HANDSHAKING",
  ACTIVE = "ACTIVE",
  CLOSED = "CLOSED",
  FAILED = "FAILED",
}

export interface ProtocolSession {
  sessionId: string;
  nodeId: string;
  startedAt: number;
  endedAt?: number;
  state: SessionState;
}
