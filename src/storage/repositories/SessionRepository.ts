import { db } from '../database';
import { ProtocolSession, SessionState } from '../../protocol/types/session';

export interface SessionRepository {
  create(session: ProtocolSession): Promise<void>;
  updateState(sessionId: string, state: SessionState): Promise<void>;
  getActiveByPeer(peerNodeId: string): Promise<ProtocolSession | null>;
}
