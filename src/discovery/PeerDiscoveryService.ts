import { ProtocolSession, SessionState } from './types';
import { HandshakeStateMachine, HandshakeState } from './handshakeStateMachine';
import { TransportManagerInterface } from '../transport/TransportManager';
import { TransportType, Unsubscribe } from '../transport/types';
import { IdentityManager } from '../identity/IdentityManager';
import { MessageType, HelloMessage, HelloAckMessage, ProtocolEnvelope } from '../protocol/types/messages';
import { PROTOCOL_VERSION } from '../protocol/constants';
import { v4 as uuidv4 } from 'uuid';

// We depend on these repositories from Module 2 (mocked or implemented)
export interface PeerRepository { upsert(peer: any): Promise<void>; recordEncounter(nodeId: string, durationMs: number): Promise<void>; }
export interface ContactRepository { create(contact: any): Promise<void>; }
export interface SessionRepository { getActiveSessions(): Promise<ProtocolSession[]>; updateState(sessionId: string, state: SessionState): Promise<void>; create(session: ProtocolSession): Promise<void>; }
export interface ProtocolEventRepository { log(event: any): Promise<void>; }

export interface PeerDiscoveryServiceInterface {
  start(): Promise<void>;
  stop(): Promise<void>;
  onSessionEstablished(handler: (session: ProtocolSession) => void): Unsubscribe;
  onSessionClosed(handler: (session: ProtocolSession) => void): Unsubscribe;
  getActiveSessions(): Promise<ProtocolSession[]>;
  closeSession(nodeId: string, reason?: string): Promise<void>;
}

export class PeerDiscoveryService implements PeerDiscoveryServiceInterface {
  private stateMachine = new HandshakeStateMachine();
  private activeSessionsByNode = new Map<string, ProtocolSession>();

  private establishedHandlers = new Set<(session: ProtocolSession) => void>();
  private closedHandlers = new Set<(session: ProtocolSession) => void>();
  private unsubscribes: Unsubscribe[] = [];

  constructor(
    private transportManager: TransportManagerInterface,
    private identityManager: IdentityManager,
    private peerRepo: PeerRepository,
    private contactRepo: ContactRepository,
    private sessionRepo: SessionRepository,
    private protocolEventRepo: ProtocolEventRepository
  ) {}

  async start(): Promise<void> {
    // Cleanup stale HANDSHAKING sessions would go here (omitted for brevity, assume db clean)

    this.unsubscribes.push(
      this.transportManager.onRawPeerDiscovered((peerAddress, transport, rssi) => this.handleRawDiscovery(peerAddress, transport, rssi))
    );

    this.unsubscribes.push(
      this.transportManager.onRawMessageReceived((peerAddress, transport, payload) => this.handleRawMessage(peerAddress, transport, payload))
    );

    this.unsubscribes.push(
      this.transportManager.onPeerLost((nodeId) => this.handlePeerLost(nodeId))
    );
  }

  async stop(): Promise<void> {
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes = [];
  }

  private async handleRawDiscovery(peerAddress: string, transport: TransportType, signalStrength?: number) {
    if (this.stateMachine.isMidHandshake(peerAddress) || this.stateMachine.isEstablished(peerAddress)) {
      return;
    }

    this.stateMachine.transition(peerAddress, HandshakeState.HANDSHAKE_SENT);

    const identity = this.identityManager.getIdentity();
    const hello: ProtocolEnvelope<HelloMessage> = {
      version: PROTOCOL_VERSION,
      type: MessageType.HELLO,
      senderNodeId: identity.nodeId,
      timestamp: Date.now(),
      payload: {
        nodeId: identity.nodeId,
        publicKey: identity.publicKey,
        protocolVersion: PROTOCOL_VERSION,
        capabilities: this.identityManager.getCapabilities()
      }
    };

    try {
      await this.transportManager.sendToAddress(peerAddress, transport, hello);
    } catch (e) {
      this.stateMachine.transition(peerAddress, HandshakeState.FAILED);
    }
  }

  private async handleRawMessage(peerAddress: string, transport: TransportType, payload: Uint8Array) {
    const { WireCodec } = require('../transport/WireCodec');
    const codec = new WireCodec();
    let msg: any;
    try {
      msg = codec.decode(payload);
    } catch (e) {
      return;
    }

    if (msg.type === MessageType.HELLO) {
      await this.handleHello(peerAddress, transport, msg as ProtocolEnvelope<HelloMessage>);
    } else if (msg.type === MessageType.HELLO_ACK) {
      await this.handleHelloAck(peerAddress, transport, msg as ProtocolEnvelope<HelloAckMessage>);
    }
  }

  private async handleHello(peerAddress: string, transport: TransportType, msg: ProtocolEnvelope<HelloMessage>) {
    if (this.stateMachine.isEstablished(peerAddress)) return;

    const accepted = msg.payload.protocolVersion === PROTOCOL_VERSION;
    this.stateMachine.transition(peerAddress, HandshakeState.HELLO_RECEIVED);

    const identity = this.identityManager.getIdentity();
    const ack: ProtocolEnvelope<HelloAckMessage> = {
      version: PROTOCOL_VERSION,
      type: MessageType.HELLO_ACK,
      senderNodeId: identity.nodeId,
      timestamp: Date.now(),
      payload: {
        nodeId: identity.nodeId,
        publicKey: identity.publicKey,
        protocolVersion: PROTOCOL_VERSION,
        accepted
      }
    };

    try {
      await this.transportManager.sendToAddress(peerAddress, transport, ack);
      this.stateMachine.transition(peerAddress, HandshakeState.ACK_SENT);
      if (accepted) {
        await this.finalizeSession(peerAddress, transport, msg.senderNodeId);
      } else {
        this.stateMachine.transition(peerAddress, HandshakeState.FAILED);
      }
    } catch (e) {
      this.stateMachine.transition(peerAddress, HandshakeState.FAILED);
    }
  }

  private async handleHelloAck(peerAddress: string, transport: TransportType, msg: ProtocolEnvelope<HelloAckMessage>) {
    if (this.stateMachine.getState(peerAddress) !== HandshakeState.HANDSHAKE_SENT) {
      return; // Not expecting this
    }

    if (msg.payload.accepted) {
      await this.finalizeSession(peerAddress, transport, msg.senderNodeId);
    } else {
      this.stateMachine.transition(peerAddress, HandshakeState.FAILED);
      await this.protocolEventRepo.log({ event: 'HANDSHAKE_REJECTED', peerAddress });
    }
  }

  private async finalizeSession(peerAddress: string, transport: TransportType, nodeId: string) {
    this.stateMachine.transition(peerAddress, HandshakeState.ESTABLISHED);
    this.transportManager.registerPeerIdentity(peerAddress, nodeId, transport);

    await this.peerRepo.upsert({ nodeId });
    await this.contactRepo.create({ nodeId, startedAt: Date.now() });

    const session: ProtocolSession = {
      sessionId: uuidv4(),
      nodeId,
      startedAt: Date.now(),
      state: SessionState.ACTIVE
    };

    this.activeSessionsByNode.set(nodeId, session);
    await this.sessionRepo.create(session);

    for (const h of this.establishedHandlers) h(session);
  }

  private async handlePeerLost(nodeId: string) {
    const session = this.activeSessionsByNode.get(nodeId);
    if (session) {
      session.state = SessionState.CLOSED;
      session.endedAt = Date.now();
      this.activeSessionsByNode.delete(nodeId);

      const durationMs = session.endedAt - session.startedAt;
      await this.peerRepo.recordEncounter(nodeId, durationMs);
      await this.sessionRepo.updateState(session.sessionId, SessionState.CLOSED);

      for (const h of this.closedHandlers) h(session);
    }
  }

  async getActiveSessions(): Promise<ProtocolSession[]> {
    return this.sessionRepo.getActiveSessions();
  }

  async triggerScan(): Promise<void> {
    // Force transports to restart discovery to pick up any new broadcast packets immediately
    await this.transportManager.stopAll();
    await this.transportManager.startAll();
  }

  onSessionEstablished(handler: (session: ProtocolSession) => void): Unsubscribe {
    this.establishedHandlers.add(handler);
    return () => this.establishedHandlers.delete(handler);
  }

  onSessionClosed(handler: (session: ProtocolSession) => void): Unsubscribe {
    this.closedHandlers.add(handler);
    return () => this.closedHandlers.delete(handler);
  }
  async closeSession(nodeId: string, reason?: string): Promise<void> {
    const session = this.activeSessionsByNode.get(nodeId);
    if (session) {
      try {
        // Try to send SESSION_CLOSE message gracefully
        const identity = this.identityManager.getIdentity();
        const closeMsg: ProtocolEnvelope<any> = {
          version: PROTOCOL_VERSION,
          type: MessageType.SESSION_CLOSE,
          senderNodeId: identity.nodeId,
          timestamp: Date.now(),
          payload: { reason }
        };
        await this.transportManager.send(nodeId, closeMsg);
      } catch (e) {
        // Ignore if transport already failed
      }

      await this.handlePeerLost(nodeId);
    }
  }
}
