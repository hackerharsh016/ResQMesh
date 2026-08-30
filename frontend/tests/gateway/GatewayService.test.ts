import { GatewayService } from '../../src/gateway/GatewayService';
import { NativeConnectivityMonitor } from '../../src/gateway/ConnectivityMonitor';
import { SyncStatus } from '../../src/protocol/types/ack';
import { DestinationType, BundleState } from '../../src/protocol/types/bundle';

describe('GatewayService', () => {
  let monitor: NativeConnectivityMonitor;
  let configRepo: any;
  let syncQueue: any;
  let bundleRepo: any;
  let backend: any;
  let dtnEngine: any;
  let transportManager: any;
  let protocolEventRepo: any;
  let identityManager: any;
  let service: GatewayService;

  beforeEach(() => {
    monitor = new NativeConnectivityMonitor();
    configRepo = { get: jest.fn().mockResolvedValue('true'), getNumber: jest.fn().mockImplementation((k, d) => Promise.resolve(d)) };
    syncQueue = {
      enqueue: jest.fn(),
      getWaiting: jest.fn().mockResolvedValue([]),
      updateStatus: jest.fn(),
      remove: jest.fn(),
      getByStatus: jest.fn().mockResolvedValue([])
    };
    bundleRepo = { getById: jest.fn() };
    backend = { uploadBundle: jest.fn().mockResolvedValue({ serverReceiptId: 'rcpt-1' }) };
    dtnEngine = { markDelivered: jest.fn() };
    transportManager = { getAvailableTransports: jest.fn().mockResolvedValue([]), send: jest.fn() };
    protocolEventRepo = { log: jest.fn() };
    identityManager = { getIdentity: jest.fn().mockReturnValue({ nodeId: 'node-A' }), setGatewayCapable: jest.fn() };

    service = new GatewayService(monitor, configRepo, syncQueue, bundleRepo, backend, dtnEngine, transportManager, protocolEventRepo, identityManager);
  });

  it('should check connectivity on start and run reconciliation', async () => {
    monitor.simulateConnectivity(true);
    await service.start();
    expect(await service.isGatewayCapable()).toBe(true);
    expect(identityManager.setGatewayCapable).toHaveBeenCalledWith(true);
  });

  it('should run sync cycle and upload bundles', async () => {
    monitor.simulateConnectivity(true);
    await service.start();
    
    syncQueue.getWaiting.mockResolvedValue([
      { bundleId: 'b1', attempts: 0, status: SyncStatus.WAITING }
    ]);
    bundleRepo.getById.mockResolvedValue({
      bundleId: 'b1',
      originNodeId: 'node-X',
      payloadType: 'text',
      routing: { priority: 1, destinationType: DestinationType.AUTHORITY },
      payload: {},
      security: {}
    });

    const report = await service.runSyncCycle();
    expect(report.attempted).toBe(1);
    expect(report.succeeded).toBe(1);
    expect(report.failed).toBe(0);
    
    expect(backend.uploadBundle).toHaveBeenCalled();
    expect(syncQueue.updateStatus).toHaveBeenCalledWith('b1', SyncStatus.DELIVERED, expect.any(Object));
    expect(dtnEngine.markDelivered).toHaveBeenCalledWith('b1');
  });

  it('should handle orphaned items in sync queue', async () => {
    monitor.simulateConnectivity(true);
    await service.start();
    
    syncQueue.getWaiting.mockResolvedValue([
      { bundleId: 'b1', attempts: 0, status: SyncStatus.WAITING }
    ]);
    bundleRepo.getById.mockResolvedValue(null); // Orphaned

    const report = await service.runSyncCycle();
    expect(report.attempted).toBe(1);
    expect(report.succeeded).toBe(0);
    expect(report.failed).toBe(0);
    
    expect(syncQueue.remove).toHaveBeenCalledWith('b1');
  });

  it('should handle upload failures and apply backoff', async () => {
    monitor.simulateConnectivity(true);
    await service.start();
    
    syncQueue.getWaiting.mockResolvedValue([
      { bundleId: 'b1', attempts: 0, status: SyncStatus.WAITING }
    ]);
    bundleRepo.getById.mockResolvedValue({
      bundleId: 'b1',
      routing: { priority: 1, destinationType: DestinationType.AUTHORITY },
      payload: {},
      security: {}
    });

    backend.uploadBundle.mockRejectedValue(new Error('Network fail'));

    const report = await service.runSyncCycle();
    expect(report.failed).toBe(1);
    expect(syncQueue.updateStatus).toHaveBeenCalledWith('b1', SyncStatus.RETRY_PENDING, expect.objectContaining({ attempts: 1 }));
  });
});
