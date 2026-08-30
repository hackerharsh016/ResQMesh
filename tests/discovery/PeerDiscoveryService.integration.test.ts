import { PeerDiscoveryService } from '../../src/discovery/PeerDiscoveryService';
import { TransportManager } from '../../src/transport/TransportManager';
import { MockTransport } from '../../src/transport/mocks/MockTransport';
import { TransportType } from '../../src/transport/types';

describe('PeerDiscoveryService Integration', () => {
  let tmA: TransportManager;
  let tmB: TransportManager;
  let pdA: PeerDiscoveryService;
  let pdB: PeerDiscoveryService;
  let bleA: MockTransport;
  let bleB: MockTransport;

  beforeEach(() => {
    // Setup TransportManager A
    tmA = new TransportManager({ upsert: jest.fn().mockResolvedValue(undefined), getByNode: jest.fn().mockResolvedValue([]) } as any);
    bleA = new MockTransport(TransportType.BLE, 1024, 'ble-mac-A');
    tmA.registerTransport(bleA);

    // Setup TransportManager B
    tmB = new TransportManager({ upsert: jest.fn().mockResolvedValue(undefined), getByNode: jest.fn().mockResolvedValue([]) } as any);
    bleB = new MockTransport(TransportType.BLE, 1024, 'ble-mac-B');
    tmB.registerTransport(bleB);

    // Link the "ether"
    bleA.etherPeers.set('ble-mac-B', bleB);
    bleB.etherPeers.set('ble-mac-A', bleA);


    // Setup PeerDiscoveryService A
    pdA = new PeerDiscoveryService(
      tmA,
      { getIdentity: () => ({ nodeId: 'node-A', publicKey: 'pkA', capabilities: {} as any }), getCapabilities: () => ({} as any) } as any,
      { upsert: jest.fn().mockResolvedValue(undefined), recordEncounter: jest.fn().mockResolvedValue(undefined) } as any,
      { create: jest.fn().mockResolvedValue(undefined) } as any,
      { create: jest.fn().mockResolvedValue(undefined), updateState: jest.fn().mockResolvedValue(undefined), getActiveSessions: jest.fn().mockResolvedValue([]) } as any,
      { log: jest.fn().mockResolvedValue(undefined) } as any
    );

    // Setup PeerDiscoveryService B
    pdB = new PeerDiscoveryService(
      tmB,
      { getIdentity: () => ({ nodeId: 'node-B', publicKey: 'pkB', capabilities: {} as any }), getCapabilities: () => ({} as any) } as any,
      { upsert: jest.fn().mockResolvedValue(undefined), recordEncounter: jest.fn().mockResolvedValue(undefined) } as any,
      { create: jest.fn().mockResolvedValue(undefined) } as any,
      { create: jest.fn().mockResolvedValue(undefined), updateState: jest.fn().mockResolvedValue(undefined), getActiveSessions: jest.fn().mockResolvedValue([]) } as any,
      { log: jest.fn().mockResolvedValue(undefined) } as any
    );
  });

  it('should complete handshake across mock ether', async () => {
    await pdA.start();
    await pdB.start();

    const establishedA = jest.fn();
    const establishedB = jest.fn();
    pdA.onSessionEstablished(establishedA);
    pdB.onSessionEstablished(establishedB);

    // Node A discovers Node B's BLE address
    bleA.simulateDiscover({ peerAddress: 'ble-mac-B', transport: TransportType.BLE, discoveredAt: Date.now() });

    // Let async chain resolve
    await new Promise(r => setTimeout(r, 100));

    expect(establishedA).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'node-B' }));
    expect(establishedB).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'node-A' }));

    // Disconnect
    bleA.simulateLost('ble-mac-B');
    await new Promise(r => setTimeout(r, 10));
  });
});
