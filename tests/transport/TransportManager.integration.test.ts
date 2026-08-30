import { TransportManager } from '../../src/transport/TransportManager';
import { MockTransport } from '../../src/transport/mocks/MockTransport';
import { TransportType } from '../../src/transport/types';
import { MessageType, ProtocolEnvelope, HelloMessage } from '../../src/protocol/types/messages';
import { PROTOCOL_VERSION } from '../../src/protocol/constants';

describe('TransportManager Integration (Mock Ether)', () => {
  let managerA: TransportManager;
  let managerB: TransportManager;
  let mockRepoA: any, mockRepoB: any;
  let transportA: MockTransport;
  let transportB: MockTransport;

  beforeEach(() => {
    mockRepoA = { upsert: jest.fn().mockResolvedValue(undefined), getByNode: jest.fn().mockResolvedValue([]) };
    mockRepoB = { upsert: jest.fn().mockResolvedValue(undefined), getByNode: jest.fn().mockResolvedValue([]) };

    managerA = new TransportManager(mockRepoA);
    managerB = new TransportManager(mockRepoB);

    transportA = new MockTransport(TransportType.BLE, 1024, 'addressA');
    transportB = new MockTransport(TransportType.BLE, 1024, 'addressB');

    // Wire them together in a mock ether
    transportA.etherPeers.set('addressB', transportB);
    transportB.etherPeers.set('addressA', transportA);

    managerA.registerTransport(transportA);
    managerB.registerTransport(transportB);
  });

  it('should successfully send and receive a message across the mock ether', (done) => {
    // Node A sends to Node B
    const msg: ProtocolEnvelope<HelloMessage> = {
      version: PROTOCOL_VERSION,
      type: MessageType.HELLO,
      senderNodeId: 'node-A',
      timestamp: Date.now(),
      payload: { nodeId: 'node-A', publicKey: 'pkA', protocolVersion: PROTOCOL_VERSION, capabilities: {} as any }
    };

    managerA.registerPeerIdentity('addressB', 'node-B', TransportType.BLE);
    managerB.registerPeerIdentity('addressA', 'node-A', TransportType.BLE);

    managerB.onMessageReceived((nodeId, receivedMsg) => {
      expect(nodeId).toBe('node-A');
      expect(receivedMsg.type).toBe(MessageType.HELLO);
      expect(receivedMsg.senderNodeId).toBe('node-A');
      done();
    });

    managerA.send('node-B', msg).catch(done);
  });
});
