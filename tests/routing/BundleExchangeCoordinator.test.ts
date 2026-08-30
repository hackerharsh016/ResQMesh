import { BundleExchangeCoordinator } from '../../src/routing/BundleExchangeCoordinator';
import { MessageType } from '../../src/protocol/types/messages';
import { PROTOCOL_VERSION } from '../../src/protocol/constants';
import { Priority, BundleState } from '../../src/protocol/types/bundle';

describe('BundleExchangeCoordinator', () => {
  let coordinator: BundleExchangeCoordinator;
  let tm: any, dtn: any, pd: any, peerRepo: any, configRepo: any, ackRepo: any, bundleRepo: any, identityMock: any, eventRepo: any;

  beforeEach(() => {
    tm = {
      send: jest.fn().mockResolvedValue(undefined),
      onMessageReceived: jest.fn(),
    };
    
    dtn = {
      getForwardingCandidates: jest.fn().mockResolvedValue([]),
      hasBundle: jest.fn().mockResolvedValue(false),
      markOffered: jest.fn().mockResolvedValue(undefined),
      markTransferred: jest.fn().mockResolvedValue(undefined),
      markRejectedByPeer: jest.fn().mockResolvedValue(undefined),
      receiveBundle: jest.fn().mockResolvedValue({ accepted: true }),
    };
    
    pd = {
      onSessionEstablished: jest.fn(),
      onSessionClosed: jest.fn(),
      closeSession: jest.fn().mockResolvedValue(undefined),
    };
    
    peerRepo = {
      getById: jest.fn().mockResolvedValue({ publicKey: 'pk-remote', encounterCount: 1, successfulTransfers: 1 }),
    };
    
    configRepo = {
      getNumber: jest.fn().mockResolvedValue(0), // simplify weights
    };
    
    ackRepo = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    
    bundleRepo = {
      getById: jest.fn().mockResolvedValue({
        bundleId: 'b-1',
        routing: { priority: Priority.MEDIUM, hopCount: 0, maxHopCount: 10, replicationBudget: 5 }
      })
    };
    
    identityMock = {
      getIdentity: jest.fn().mockReturnValue({ nodeId: 'local-node' }),
    };

    eventRepo = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    coordinator = new BundleExchangeCoordinator(pd, tm, dtn, peerRepo, configRepo, ackRepo, bundleRepo, identityMock, eventRepo);
  });

  it('should start sync on session established', async () => {
    dtn.getForwardingCandidates.mockResolvedValue([{ bundleId: 'b-1' }]);

    let onEstablishedHandler: any;
    pd.onSessionEstablished.mockImplementation((h: any) => onEstablishedHandler = h);
    await coordinator.start();

    await onEstablishedHandler({ nodeId: 'remote-node', sessionId: 's-1' });

    expect(tm.send).toHaveBeenCalledWith('remote-node', expect.objectContaining({
      type: MessageType.SYNC_REQUEST,
      payload: expect.objectContaining({
        bundleSummaries: [{ bundleId: 'b-1' }]
      })
    }));
  });
});
