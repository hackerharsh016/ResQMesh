import { SQLiteIdentityRepository } from '../identity/IdentityRepository';
import { SQLiteLocalConfigRepository } from '../identity/LocalConfigRepository';
import { IdentityManager } from '../identity/IdentityManager';
import { db } from '../storage/database';

import { SQLiteBundleRepository } from '../storage/repositories/BundleRepository';
import { SQLitePeerRepository } from '../storage/repositories/PeerRepository';
import { SQLitePeerTransportRepository } from '../storage/repositories/PeerTransportRepository';
import { 
  SQLiteSecurityEventRepository,
  SQLiteProtocolEventRepository,
  SQLiteSyncQueueRepository,
  SQLiteContactRepository,
  SQLiteSessionRepository,
  SQLiteTransferRepository,
  SQLiteBundleAckRepository,
  SQLiteBundleHopRepository
} from '../storage/repositories/Mocks';

import { DtnEngine } from '../dtn/DtnEngine';
import { TransportManager } from '../transport/TransportManager';
import { BleTransport } from '../transport/ble/BleTransport';
import { WifiDirectTransport } from '../transport/wifi-direct/WifiDirectTransport';
import { WifiAwareTransport } from '../transport/wifi-aware/WifiAwareTransport';

import { 
  BleNativeModuleMock, 
  WifiDirectNativeModuleMock, 
  WifiAwareNativeModuleMock 
} from '../transport/mocks/NativeModuleMocks';

import { PeerDiscoveryService } from '../discovery/PeerDiscoveryService';
import { BundleExchangeCoordinator } from '../routing/BundleExchangeCoordinator';
import { GatewayService } from '../gateway/GatewayService';
import { NativeConnectivityMonitor } from '../gateway/ConnectivityMonitor';
import { SupabaseBackendClient } from '../gateway/BackendClient';

import { PermissionFlow, NativePermissionFlow } from './permissions/PermissionFlow';
import { MaintenanceScheduler, IntervalMaintenanceScheduler } from './scheduler/MaintenanceScheduler';
import { BundleNotifier } from './notifications/BundleNotifier';
import { ForegroundServiceWrapper } from './foreground-service/ForegroundServiceWrapper';

export interface MeshRuntimeInterface {
  startMesh(): Promise<void>;
  stopMesh(): Promise<void>;
  isRunning(): boolean;
  getDtnEngine(): DtnEngine;
  getGatewayService(): GatewayService;
  getPeerDiscoveryService(): PeerDiscoveryService;
}

export class MeshRuntime implements MeshRuntimeInterface {
  private running = false;

  private dtnEngine!: DtnEngine;
  private transportManager!: TransportManager;
  private peerDiscoveryService!: PeerDiscoveryService;
  private exchangeCoordinator!: BundleExchangeCoordinator;
  private gatewayService!: GatewayService;
  private maintenanceScheduler!: MaintenanceScheduler;

  constructor(private permissionFlow: PermissionFlow = new NativePermissionFlow()) {}

  async startMesh(): Promise<void> {
    if (this.running) return;

    const identityRepo = new SQLiteIdentityRepository();
    const configRepo = new SQLiteLocalConfigRepository();
    const identityManager = IdentityManager.getInstance(identityRepo, configRepo);
    await identityManager.initialize(); // MUST be first

    const bundleRepo = new SQLiteBundleRepository();
    const securityEventRepo = new SQLiteSecurityEventRepository();
    const protocolEventRepo = new SQLiteProtocolEventRepository();
    const syncQueueRepo = new SQLiteSyncQueueRepository();
    const peerRepo = new SQLitePeerRepository();
    const peerTransportRepo = new SQLitePeerTransportRepository();
    const contactRepo = new SQLiteContactRepository();
    const sessionRepo = new SQLiteSessionRepository();
    const transferRepo = new SQLiteTransferRepository();
    const bundleAckRepo = new SQLiteBundleAckRepository();
    const bundleHopRepo = new SQLiteBundleHopRepository();

    this.dtnEngine = new DtnEngine(
      bundleRepo,
      securityEventRepo,
      protocolEventRepo,
      configRepo,
      identityManager
    );

    this.transportManager = new TransportManager(peerTransportRepo);

    // Register Transports (using mocks for pure JS environment as allowed in spec)
    const nativeMock = {
      isSupported: async () => true,
      requestPermissions: async () => true,
      startAdvertising: async () => {},
      stopAdvertising: async () => {},
      startScanning: async () => {},
      stopScanning: async () => {},
      connect: async () => {},
      disconnect: async () => {},
      sendChunk: async () => {},
      onDeviceDiscovered: () => () => {},
      onPeerDiscovered: () => () => {},
      onGroupFormed: () => () => {},
      onConnectionStateChanged: () => () => {},
      onChunkReceived: () => () => {},
      onDataReceived: () => () => {},
      publish: async () => {},
      subscribe: async () => {},
      stopPublishSubscribe: async () => {},
      openDataPath: async () => {},
      closeDataPath: async () => {},
      sendBytes: async () => {},
      onDataPathEstablished: () => () => {}
    } as any;

    const bleTransport = new BleTransport(nativeMock, configRepo);
    const wifiDirectTransport = new WifiDirectTransport(nativeMock, configRepo);
    const wifiAwareTransport = new WifiAwareTransport(nativeMock, configRepo);

    this.transportManager.registerTransport(bleTransport);
    this.transportManager.registerTransport(wifiDirectTransport);
    this.transportManager.registerTransport(wifiAwareTransport);

    this.peerDiscoveryService = new PeerDiscoveryService(
      this.transportManager,
      identityManager,
      peerRepo,
      contactRepo,
      sessionRepo,
      protocolEventRepo
    );

    this.exchangeCoordinator = new BundleExchangeCoordinator(
      this.peerDiscoveryService,
      this.transportManager,
      this.dtnEngine,
      peerRepo,
      configRepo,
      bundleAckRepo,
      bundleRepo,
      identityManager,
      protocolEventRepo
    );

    this.gatewayService = new GatewayService(
      new NativeConnectivityMonitor(),
      configRepo,
      syncQueueRepo,
      bundleRepo,
      new SupabaseBackendClient('https://mock.supabase.co', 'mock-key'),
      this.dtnEngine,
      this.transportManager,
      protocolEventRepo,
      identityManager
    );

    this.dtnEngine.setGatewayService(this.gatewayService);

    const permResult = await this.permissionFlow.hasCompletedBefore();
    if (!permResult) {
      await this.permissionFlow.run();
    }

    await this.transportManager.startAll();
    await this.peerDiscoveryService.start();
    await this.exchangeCoordinator.start();
    await this.gatewayService.start();

    this.maintenanceScheduler = new IntervalMaintenanceScheduler(this.dtnEngine, this.gatewayService, configRepo);
    this.maintenanceScheduler.start();

    const notifier = new BundleNotifier(this.dtnEngine, identityManager);
    notifier.start();

    await ForegroundServiceWrapper.startService();

    this.running = true;
  }

  async stopMesh(): Promise<void> {
    if (!this.running) return;
    
    await ForegroundServiceWrapper.stopService();

    if (this.maintenanceScheduler) this.maintenanceScheduler.stop();
    if (this.gatewayService) await this.gatewayService.stop();
    if (this.exchangeCoordinator) await this.exchangeCoordinator.stop();
    if (this.peerDiscoveryService) await this.peerDiscoveryService.stop();
    if (this.transportManager) await this.transportManager.stopAll();

    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  getDtnEngine(): DtnEngine {
    return this.dtnEngine;
  }

  getGatewayService(): GatewayService {
    return this.gatewayService;
  }

  getPeerDiscoveryService(): PeerDiscoveryService {
    return this.peerDiscoveryService;
  }
}
