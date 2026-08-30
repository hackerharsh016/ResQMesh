import { ConnectivityMonitor } from './ConnectivityMonitor';
import { BackendClient, BundleUploadPayload } from './BackendClient';
import { SyncCycleReport } from './types';
import { LocalConfigRepository } from '../identity/LocalConfigRepository';
import { SyncQueueRepository } from '../storage/repositories/SyncQueueRepository';
import { BundleRepository } from '../storage/repositories/BundleRepository';
import { ProtocolEventRepository } from '../storage/repositories/ProtocolEventRepository';
import { DtnEngineInterface } from '../dtn/DtnEngine';
import { TransportManagerInterface } from '../transport/TransportManager';
import { IdentityManager } from '../identity/IdentityManager';
import { Unsubscribe } from '../transport/types';
import { SyncStatus } from '../protocol/types/ack';
import { DestinationType, BundleState } from '../protocol/types/bundle';
import { MessageType, BundleAckMessage, ProtocolEnvelope } from '../protocol/types/messages';
import { PROTOCOL_VERSION } from '../protocol/constants';
import { AckType } from '../protocol/types/ack';

export class GatewayService {
  private unsubscribes: Unsubscribe[] = [];
  private gatewayCapable: boolean = false;

  constructor(
    private connectivity: ConnectivityMonitor,
    private configRepo: LocalConfigRepository,
    private syncQueue: SyncQueueRepository,
    private bundleRepo: BundleRepository,
    private backend: BackendClient,
    private dtnEngine: DtnEngineInterface,
    private transportManager: TransportManagerInterface,
    private protocolEventRepo: ProtocolEventRepository,
    private identityManager: IdentityManager
  ) {}

  async start(): Promise<void> {
    this.unsubscribes.push(
      this.connectivity.onConnectivityChanged((online) => this.updateCapabilityCache(online))
    );
    
    const isOnline = await this.connectivity.isOnline();
    await this.updateCapabilityCache(isOnline);

    await this.runStartupReconciliation();
  }

  async stop(): Promise<void> {
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes = [];
  }

  private async updateCapabilityCache(isOnline: boolean) {
    const gatewayModeEnabled = await this.configRepo.get('gatewayModeEnabled');
    // Enabled by default unless explicitly set to 'false'
    const isEnabled = gatewayModeEnabled !== 'false';
    this.gatewayCapable = isOnline && isEnabled;
    if ((this.identityManager as any).setGatewayCapable) {
      (this.identityManager as any).setGatewayCapable(this.gatewayCapable);
    }
  }

  async isGatewayCapable(): Promise<boolean> {
    return this.gatewayCapable;
  }

  async enqueueForSync(bundleId: string): Promise<void> {
    // Idempotent enqueue
    try {
      await this.syncQueue.enqueue({
        bundleId,
        attempts: 0,
        status: SyncStatus.WAITING,
        updatedAt: Date.now()
      });
    } catch (e: any) {
      // If it's a duplicate key error from SQL, ignore it.
      // We'll catch and ignore errors that look like duplicates.
      if (e.message && e.message.toLowerCase().includes('unique constraint')) {
        return;
      }
      // Still throw other critical DB errors
      throw e;
    }
  }

  async runSyncCycle(): Promise<SyncCycleReport> {
    const report: SyncCycleReport = {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      ranAt: Date.now()
    };

    if (!this.gatewayCapable) return report;

    const waiting = await this.syncQueue.getWaiting();
    
    const maxAttempts = await this.configRepo.getNumber('gateway_max_attempts', 5);
    const baseBackoffMs = await this.configRepo.getNumber('gateway_base_backoff_ms', 5000);
    const maxBackoffMs = await this.configRepo.getNumber('gateway_max_backoff_ms', 3600000);

    for (const item of waiting) {
      if (!this.gatewayCapable) {
        // Connectivity dropped mid-cycle
        break;
      }

      // Check if item should be retried based on nextAttemptAt
      if (item.nextAttemptAt && item.nextAttemptAt > Date.now()) {
        continue;
      }

      report.attempted++;

      const bundle = await this.bundleRepo.getById(item.bundleId);
      if (!bundle) {
        // Orphaned sync queue entry
        await this.syncQueue.remove(item.bundleId);
        await this.protocolEventRepo.log({
          eventType: 'ORPHANED_SYNC_ITEM_REMOVED',
          bundleId: item.bundleId,
          details: 'Bundle was evicted locally before it could be synced.'
        });
        continue;
      }

      try {
        const payload: BundleUploadPayload = {
          bundleId: bundle.bundleId,
          originNodeId: bundle.originNodeId,
          incidentId: bundle.incidentId,
          payloadType: bundle.payloadType,
          priority: String(bundle.routing.priority),
          createdAt: bundle.creationTimestamp,
          payload: bundle.payload,
          security: bundle.security,
          protocolVersion: bundle.protocolVersion
        };

        const res = await this.backend.uploadBundle(payload);

        await this.syncQueue.updateStatus(item.bundleId, SyncStatus.DELIVERED, {
          serverReceiptId: res.serverReceiptId,
          updatedAt: Date.now()
        });

        if (bundle.routing.destinationType === DestinationType.AUTHORITY) {
          await this.dtnEngine.markDelivered(item.bundleId);
        }

        // Best-effort opportunistic backward ack
        this.sendOpportunisticAck(bundle.originNodeId, bundle.bundleId).catch(() => {});

        report.succeeded++;
      } catch (e: any) {
        report.failed++;
        const attempts = item.attempts + 1;
        
        let status = SyncStatus.RETRY_PENDING;
        let nextAttemptAt = Date.now() + Math.min(maxBackoffMs, baseBackoffMs * Math.pow(2, attempts));

        if (attempts >= maxAttempts) {
          status = SyncStatus.FAILED;
          nextAttemptAt = Date.now() + 86400000; // far future
        }

        await this.syncQueue.updateStatus(item.bundleId, status, {
          attempts,
          lastError: e.message || String(e),
          lastAttemptAt: Date.now(),
          nextAttemptAt,
          updatedAt: Date.now()
        });
      }
    }

    return report;
  }

  private async sendOpportunisticAck(originNodeId: string, bundleId: string) {
    const transports = await this.transportManager.getAvailableTransports(originNodeId);
    if (transports.length > 0) {
      const identity = this.identityManager.getIdentity();
      const ack: ProtocolEnvelope<BundleAckMessage> = {
        version: PROTOCOL_VERSION,
        type: MessageType.BUNDLE_ACK,
        senderNodeId: identity.nodeId,
        timestamp: Date.now(),
        payload: {
          bundleId,
          ackType: AckType.DELIVERED
        }
      };
      // Best effort, fire and forget
      await this.transportManager.send(originNodeId, ack);
    }
  }

  private async runStartupReconciliation() {
    // Check sync_queue entries already SYNCED/DELIVERED whose corresponding bundle isn't DELIVERED locally
    const syncedItems = await this.syncQueue.getByStatus(SyncStatus.DELIVERED);
    for (const item of syncedItems) {
      const bundle = await this.bundleRepo.getById(item.bundleId);
      if (bundle && bundle.routing.destinationType === DestinationType.AUTHORITY && bundle.state !== BundleState.DELIVERED) {
        await this.dtnEngine.markDelivered(bundle.bundleId);
      }
    }
  }
}
