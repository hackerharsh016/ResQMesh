import { DtnEngine } from '../../src/dtn/DtnEngine';
import { BundleState, DestinationType, EmergencyBundle } from '../../src/protocol/types/bundle';

describe('DtnEngine Events', () => {
  let dtn: DtnEngine;
  let bundleRepo: any;
  let protocolRepo: any;
  let securityRepo: any;
  let configRepo: any;
  let identityManager: any;

  beforeEach(() => {
    bundleRepo = {
      create: jest.fn().mockResolvedValue(undefined),
      markState: jest.fn().mockResolvedValue(undefined),
      getById: jest.fn().mockResolvedValue({}),
      decrementReplicationBudget: jest.fn().mockResolvedValue(undefined)
    };
    protocolRepo = { log: jest.fn() };
    securityRepo = { log: jest.fn() };
    configRepo = { getNumber: jest.fn().mockResolvedValue(100) };
    identityManager = {
      getIdentity: jest.fn().mockReturnValue({
        nodeId: 'node1',
        publicKey: 'pub1',
        privateKeyRef: 'ref1'
      })
    };

    dtn = new DtnEngine(bundleRepo, securityRepo, protocolRepo, configRepo, identityManager);
  });

  it('should emit onBundleAccepted and onBundleStateChanged when creating local bundle', async () => {
    const acceptedCb = jest.fn();
    const stateCb = jest.fn();

    dtn.onBundleAccepted(acceptedCb);
    dtn.onBundleStateChanged(stateCb);

    await dtn.createLocalBundle({
      payload: { 
        emergencyType: 'GENERAL', 
        severity: 'LOW', 
        description: 'test' 
      },
      destinationType: DestinationType.AUTHORITY,
      priority: 1
    });

    expect(acceptedCb).toHaveBeenCalledTimes(1);
    expect(stateCb).toHaveBeenCalledWith(expect.any(String), BundleState.QUEUED);
  });

  it('should emit state changes when marking relayed, offered, delivered', async () => {
    const stateCb = jest.fn();
    dtn.onBundleStateChanged(stateCb);

    await dtn.markOffered('b1', 'peer1');
    expect(stateCb).toHaveBeenCalledWith('b1', BundleState.OFFERED);

    await dtn.markRelayed('b1');
    expect(stateCb).toHaveBeenCalledWith('b1', BundleState.RELAYED);

    await dtn.markDelivered('b1');
    expect(stateCb).toHaveBeenCalledWith('b1', BundleState.DELIVERED);
  });
});
