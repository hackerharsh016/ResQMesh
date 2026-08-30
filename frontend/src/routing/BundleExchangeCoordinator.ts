import { PeerDiscoveryServiceInterface } from '../discovery/PeerDiscoveryService';
import { TransportManagerInterface } from '../transport/TransportManager';
import { DtnEngineInterface } from '../dtn/DtnEngine';
import { PeerRepository } from '../storage/repositories/PeerRepository';
import { LocalConfigRepository } from '../identity/LocalConfigRepository';
import { BundleAckRepository } from '../storage/repositories/BundleAckRepository';
import { RoutingScorer, RoutingWeights, RoutingScoreContext } from './RoutingScorer';
import { DEFAULT_ROUTING_WEIGHTS } from './weights';
import { ProtocolSession, SessionState } from '../discovery/types';
import { Unsubscribe } from '../transport/types';
import { 
  MessageType, 
  SyncRequestMessage, 
  SyncResponseMessage, 
  BundleOfferMessage, 
  BundleAcceptMessage, 
  BundleRejectMessage, 
  BundleDataMessage, 
  BundleAckMessage, 
  ProtocolEnvelope,
  ProtocolMessage
} from '../protocol/types/messages';
import { PROTOCOL_VERSION } from '../protocol/constants';
import { applyHopIncrement } from '../protocol/mutations';
import { BundleSummary, DestinationType } from '../protocol/types/bundle';
import { IdentityManager } from '../identity/IdentityManager';
import { ProtocolEventRepository } from '../storage/repositories/ProtocolEventRepository';
import { AckType } from '../protocol/types/ack';
import { v4 as uuidv4 } from 'uuid';

interface SessionStateTracker {
  session: ProtocolSession;
  wantedBundleIds: Set<string>;
  offeredBundleIds: Set<string>;
  pendingAcks: Map<string, NodeJS.Timeout>;
}

export class BundleExchangeCoordinator {
  private scorer = new RoutingScorer();
  private unsubscribes: Unsubscribe[] = [];
  private activeSessions = new Map<string, SessionStateTracker>();
  
  constructor(
    private discoveryService: PeerDiscoveryServiceInterface,
    private transportManager: TransportManagerInterface,
    private dtnEngine: DtnEngineInterface,
    private peerRepo: PeerRepository,
    private configRepo: LocalConfigRepository,
    private bundleAckRepo: BundleAckRepository,
    private bundleRepo: any, // type BundleRepository
    private identityManager: IdentityManager,
    private protocolEventRepo: ProtocolEventRepository
  ) {}

  async start(): Promise<void> {
    this.unsubscribes.push(
      this.discoveryService.onSessionEstablished((session) => this.handleSessionEstablished(session))
    );

    this.unsubscribes.push(
      this.discoveryService.onSessionClosed((session) => this.handleSessionClosed(session))
    );

    this.unsubscribes.push(
      this.transportManager.onMessageReceived((peerNodeId, message) => this.handleMessage(peerNodeId, message))
    );
  }

  async stop(): Promise<void> {
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes = [];
    
    for (const tracker of this.activeSessions.values()) {
      for (const timeout of tracker.pendingAcks.values()) {
        clearTimeout(timeout);
      }
    }
    this.activeSessions.clear();
  }

  private async handleSessionEstablished(session: ProtocolSession) {
    this.activeSessions.set(session.nodeId, {
      session,
      wantedBundleIds: new Set(),
      offeredBundleIds: new Set(),
      pendingAcks: new Map()
    });

    try {
      const candidates = await this.dtnEngine.getForwardingCandidates(session.nodeId);
      await this.sendSyncRequest(session.nodeId, candidates);
    } catch (e) {
      console.error('Failed to initiate sync', e);
    }
  }

  private async handleSessionClosed(session: ProtocolSession) {
    const tracker = this.activeSessions.get(session.nodeId);
    if (tracker) {
      for (const timeout of tracker.pendingAcks.values()) {
        clearTimeout(timeout);
      }
      this.activeSessions.delete(session.nodeId);
    }
  }

  private async handleMessage(peerNodeId: string, message: ProtocolMessage) {
    const tracker = this.activeSessions.get(peerNodeId);
    if (!tracker) return;

    try {
      switch (message.type) {
        case MessageType.SYNC_REQUEST:
          await this.handleSyncRequest(peerNodeId, message as ProtocolEnvelope<SyncRequestMessage>, tracker);
          break;
        case MessageType.SYNC_RESPONSE:
          await this.handleSyncResponse(peerNodeId, message as ProtocolEnvelope<SyncResponseMessage>, tracker);
          break;
        case MessageType.BUNDLE_OFFER:
          await this.handleBundleOffer(peerNodeId, message as ProtocolEnvelope<BundleOfferMessage>, tracker);
          break;
        case MessageType.BUNDLE_ACCEPT:
          await this.handleBundleAccept(peerNodeId, message as ProtocolEnvelope<BundleAcceptMessage>, tracker);
          break;
        case MessageType.BUNDLE_REJECT:
          await this.handleBundleReject(peerNodeId, message as ProtocolEnvelope<BundleRejectMessage>, tracker);
          break;
        case MessageType.BUNDLE_DATA:
          await this.handleBundleData(peerNodeId, message as ProtocolEnvelope<BundleDataMessage>, tracker);
          break;
        case MessageType.BUNDLE_ACK:
          await this.handleBundleAck(peerNodeId, message as ProtocolEnvelope<BundleAckMessage>, tracker);
          break;
      }
    } catch (e) {
      console.error(`Error handling ${message.type} from ${peerNodeId}`, e);
    }
  }

  private async sendSyncRequest(peerNodeId: string, candidates: BundleSummary[]) {
    const identity = this.identityManager.getIdentity();
    const msg: ProtocolEnvelope<SyncRequestMessage> = {
      version: PROTOCOL_VERSION,
      type: MessageType.SYNC_REQUEST,
      senderNodeId: identity.nodeId,
      timestamp: Date.now(),
      payload: {
        bundleSummaries: candidates
      }
    };
    await this.transportManager.send(peerNodeId, msg);
  }

  private async handleSyncRequest(peerNodeId: string, msg: ProtocolEnvelope<SyncRequestMessage>, tracker: SessionStateTracker) {
    const wanted: string[] = [];
    for (const summary of msg.payload.bundleSummaries) {
      const hasIt = await this.dtnEngine.hasBundle(summary.bundleId);
      if (!hasIt) {
        wanted.push(summary.bundleId);
      }
    }

    const identity = this.identityManager.getIdentity();
    const response: ProtocolEnvelope<SyncResponseMessage> = {
      version: PROTOCOL_VERSION,
      type: MessageType.SYNC_RESPONSE,
      senderNodeId: identity.nodeId,
      timestamp: Date.now(),
      payload: {
        wantedBundleIds: wanted
      }
    };

    await this.transportManager.send(peerNodeId, response);
    this.checkSessionCompletion(peerNodeId, tracker);
  }

  private async getWeights(): Promise<RoutingWeights> {
    return {
      priorityWeight: await this.configRepo.getNumber('weight_priority', DEFAULT_ROUTING_WEIGHTS.priorityWeight),
      gatewayProbabilityWeight: await this.configRepo.getNumber('weight_gateway', DEFAULT_ROUTING_WEIGHTS.gatewayProbabilityWeight),
      contactHistoryWeight: await this.configRepo.getNumber('weight_contact', DEFAULT_ROUTING_WEIGHTS.contactHistoryWeight),
      linkQualityWeight: await this.configRepo.getNumber('weight_link', DEFAULT_ROUTING_WEIGHTS.linkQualityWeight),
      batteryWeight: await this.configRepo.getNumber('weight_battery', DEFAULT_ROUTING_WEIGHTS.batteryWeight),
      hopPenaltyWeight: await this.configRepo.getNumber('weight_hop', DEFAULT_ROUTING_WEIGHTS.hopPenaltyWeight),
      queuePenaltyWeight: await this.configRepo.getNumber('weight_queue', DEFAULT_ROUTING_WEIGHTS.queuePenaltyWeight)
    };
  }

  private async handleSyncResponse(peerNodeId: string, msg: ProtocolEnvelope<SyncResponseMessage>, tracker: SessionStateTracker) {
    const peer = await this.peerRepo.getById(peerNodeId);
    if (!peer) return;

    const weights = await this.getWeights();
    const threshold = await this.configRepo.getNumber('routing_score_threshold', 10.0);
    const identity = this.identityManager.getIdentity();

    // Look up the full bundles for the wanted IDs
    // In a real app we'd need DtnEngine to return full bundles or we get them via BundleRepo.
    // Since DtnEngine doesn't have `getBundlesByIds`, we will mock it or assume it's there.
    // I will use `dtnEngine.getForwardingCandidates` and filter, but we need full bundles to pass to RoutingScorer.
    // We'll actually need to import BundleRepo or add getBundle to DtnEngine.
    // Wait, DtnEngine has no getBundle() method.
    // I will inject BundleRepo into BundleExchangeCoordinator.

    
    const candidates = await this.dtnEngine.getForwardingCandidates(peerNodeId);
    let queuePosition = 0;

    for (const summary of candidates) {
      if (msg.payload.wantedBundleIds.includes(summary.bundleId)) {
        const bundle = await this.bundleRepo.getById(summary.bundleId);
        if (bundle && bundle.routing.replicationBudget > 0 && bundle.routing.hopCount < bundle.routing.maxHopCount) {
          const context: RoutingScoreContext = { peer, bundle, queuePosition };
          const score = this.scorer.computeScore(context, weights);
          
          if (score >= threshold) {
            tracker.offeredBundleIds.add(bundle.bundleId);
            await this.dtnEngine.markOffered(bundle.bundleId, peerNodeId);
            
            const offer: ProtocolEnvelope<BundleOfferMessage> = {
              version: PROTOCOL_VERSION,
              type: MessageType.BUNDLE_OFFER,
              senderNodeId: identity.nodeId,
              timestamp: Date.now(),
              payload: {
                bundleId: bundle.bundleId,
                summary
              }
            };
            await this.transportManager.send(peerNodeId, offer);
          }
        }
      }
      queuePosition++;
    }

    this.checkSessionCompletion(peerNodeId, tracker);
  }

  private async handleBundleOffer(peerNodeId: string, msg: ProtocolEnvelope<BundleOfferMessage>, tracker: SessionStateTracker) {
    // Re-check capacity
    const hasIt = await this.dtnEngine.hasBundle(msg.payload.bundleId);
    const identity = this.identityManager.getIdentity();

    if (hasIt) {
      const reject: ProtocolEnvelope<BundleRejectMessage> = {
        version: PROTOCOL_VERSION,
        type: MessageType.BUNDLE_REJECT,
        senderNodeId: identity.nodeId,
        timestamp: Date.now(),
        payload: {
          bundleId: msg.payload.bundleId,
          reason: 'DUPLICATE'
        }
      };
      await this.transportManager.send(peerNodeId, reject);
      return;
    }

    tracker.wantedBundleIds.add(msg.payload.bundleId);

    const accept: ProtocolEnvelope<BundleAcceptMessage> = {
      version: PROTOCOL_VERSION,
      type: MessageType.BUNDLE_ACCEPT,
      senderNodeId: identity.nodeId,
      timestamp: Date.now(),
      payload: {
        bundleId: msg.payload.bundleId
      }
    };
    await this.transportManager.send(peerNodeId, accept);
  }

  private async handleBundleAccept(peerNodeId: string, msg: ProtocolEnvelope<BundleAcceptMessage>, tracker: SessionStateTracker) {
    if (!tracker.offeredBundleIds.has(msg.payload.bundleId)) return;

    const bundle = await this.bundleRepo.getById(msg.payload.bundleId);
    if (!bundle) return;

    // Create a copy for the wire and increment hop count
    const outgoingCopy = JSON.parse(JSON.stringify(bundle));
    applyHopIncrement(outgoingCopy);

    const identity = this.identityManager.getIdentity();
    const dataMsg: ProtocolEnvelope<BundleDataMessage> = {
      version: PROTOCOL_VERSION,
      type: MessageType.BUNDLE_DATA,
      senderNodeId: identity.nodeId,
      timestamp: Date.now(),
      payload: {
        bundle: outgoingCopy
      }
    };

    await this.transportManager.send(peerNodeId, dataMsg);

    // Setup timeout for ack
    const timeoutMs = await this.configRepo.getNumber('ack_timeout_ms', 10000);
    const timeout = setTimeout(async () => {
      tracker.pendingAcks.delete(msg.payload.bundleId);
      tracker.offeredBundleIds.delete(msg.payload.bundleId);
      await this.protocolEventRepo.log({
        eventType: 'TRANSFER_TIMEOUT',
        bundleId: msg.payload.bundleId,
        details: `No ACK received from ${peerNodeId}`
      });
      this.checkSessionCompletion(peerNodeId, tracker);
    }, timeoutMs);

    tracker.pendingAcks.set(msg.payload.bundleId, timeout);
  }

  private async handleBundleReject(peerNodeId: string, msg: ProtocolEnvelope<BundleRejectMessage>, tracker: SessionStateTracker) {
    tracker.offeredBundleIds.delete(msg.payload.bundleId);
    await this.dtnEngine.markRejectedByPeer(msg.payload.bundleId, peerNodeId, msg.payload.reason);
    this.checkSessionCompletion(peerNodeId, tracker);
  }

  private async handleBundleData(peerNodeId: string, msg: ProtocolEnvelope<BundleDataMessage>, tracker: SessionStateTracker) {
    tracker.wantedBundleIds.delete(msg.payload.bundle.bundleId);

    const peer = await this.peerRepo.getById(peerNodeId);
    if (!peer) return;

    const result = await this.dtnEngine.receiveBundle(msg.payload.bundle, peer.publicKey);

    if (result.accepted) {
      const identity = this.identityManager.getIdentity();
      const ack: ProtocolEnvelope<BundleAckMessage> = {
        version: PROTOCOL_VERSION,
        type: MessageType.BUNDLE_ACK,
        senderNodeId: identity.nodeId,
        timestamp: Date.now(),
        payload: {
          bundleId: msg.payload.bundle.bundleId,
          ackType: AckType.RECEIVED
        }
      };
      await this.transportManager.send(peerNodeId, ack);
    }

    this.checkSessionCompletion(peerNodeId, tracker);
  }

  private async handleBundleAck(peerNodeId: string, msg: ProtocolEnvelope<BundleAckMessage>, tracker: SessionStateTracker) {
    const timeout = tracker.pendingAcks.get(msg.payload.bundleId);
    if (timeout) {
      clearTimeout(timeout);
      tracker.pendingAcks.delete(msg.payload.bundleId);
    }
    tracker.offeredBundleIds.delete(msg.payload.bundleId);

    await this.bundleAckRepo.create({
      ackId: uuidv4(),
      bundleId: msg.payload.bundleId,
      ackType: msg.payload.ackType,
      sourceNodeId: msg.senderNodeId,
      createdAt: msg.timestamp,
      receivedAt: Date.now()
    });

    if (msg.payload.ackType === AckType.RECEIVED) {
      await this.dtnEngine.markTransferred(msg.payload.bundleId, peerNodeId);
    } else if (msg.payload.ackType === AckType.DELIVERED) {
      await this.dtnEngine.markDelivered(msg.payload.bundleId);
    }

    this.checkSessionCompletion(peerNodeId, tracker);
  }

  private checkSessionCompletion(peerNodeId: string, tracker: SessionStateTracker) {
    if (tracker.wantedBundleIds.size === 0 && tracker.offeredBundleIds.size === 0 && tracker.pendingAcks.size === 0) {
      // Sync is complete
      this.discoveryService.closeSession(peerNodeId, 'SYNC_COMPLETE').catch(() => {});
    }
  }
}
