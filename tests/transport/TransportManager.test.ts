import { TransportManager } from '../../src/transport/TransportManager';
import { MockTransport } from '../../src/transport/mocks/MockTransport';
import { TransportType } from '../../src/transport/types';
import { NoTransportAvailableError, PayloadTooLargeError } from '../../src/transport/errors';
import { MessageType, ProtocolEnvelope, HelloMessage } from '../../src/protocol/types/messages';
import { PROTOCOL_VERSION } from '../../src/protocol/constants';

describe('TransportManager', () => {
  let manager: TransportManager;
  let mockRepo: any;
  let ble: MockTransport;
  let wifi: MockTransport;

  beforeEach(() => {
    mockRepo = {
      upsert: jest.fn().mockResolvedValue(undefined),
      getByNode: jest.fn().mockResolvedValue([])
    };
    manager = new TransportManager(mockRepo);
    ble = new MockTransport(TransportType.BLE, 512);
    wifi = new MockTransport(TransportType.WIFI_DIRECT, 4096);

    manager.registerTransport(ble);
    manager.registerTransport(wifi);
  });

  it('should dedup peer discovery and aggregate transports', () => {
    const onDiscovered = jest.fn();
    manager.onPeerDiscovered(onDiscovered);

    // Register the identity so transport manager knows peer1-ble corresponds to node1
    manager.registerPeerIdentity('peer1-ble', 'node1', TransportType.BLE);
    manager.registerPeerIdentity('peer1-wifi', 'node1', TransportType.WIFI_DIRECT);

    // Both transports should trigger discovery events
    expect(onDiscovered).toHaveBeenCalledWith('node1', [TransportType.BLE]);
    expect(onDiscovered).toHaveBeenCalledWith('node1', [TransportType.BLE, TransportType.WIFI_DIRECT]);
  });

  it('should select transport with largest maxMessageSize', async () => {
    manager.registerPeerIdentity('peer1-ble', 'node1', TransportType.BLE);
    manager.registerPeerIdentity('peer1-wifi', 'node1', TransportType.WIFI_DIRECT);

    const msg: ProtocolEnvelope<HelloMessage> = {
      version: PROTOCOL_VERSION,
      type: MessageType.HELLO,
      senderNodeId: 'node-local',
      timestamp: Date.now(),
      payload: { nodeId: 'node-local', publicKey: 'pk', protocolVersion: PROTOCOL_VERSION, capabilities: {} as any }
    };

    // Send should pick WIFI_DIRECT because 4096 > 512
    // Mock connect doesn't actually verify what gets called, but we can spy on connect/send
    const wifiSpy = jest.spyOn(wifi, 'send');
    const bleSpy = jest.spyOn(ble, 'send');

    await manager.send('node1', msg);

    expect(wifiSpy).toHaveBeenCalled();
    expect(bleSpy).not.toHaveBeenCalled();
  });

  it('should throw PayloadTooLargeError if message exceeds best transport limit', async () => {
    // Only BLE available, limit 512
    manager.registerPeerIdentity('peer1-ble', 'node1', TransportType.BLE);

    const msg: any = {
      version: PROTOCOL_VERSION,
      type: MessageType.HELLO,
      senderNodeId: 'node-local',
      timestamp: Date.now(),
      payload: { data: 'x'.repeat(1000) } // Large payload
    };

    await expect(manager.send('node1', msg)).rejects.toThrow(PayloadTooLargeError);
  });

  it('should throw NoTransportAvailableError if node has no transports', async () => {
    const msg: any = {
      version: PROTOCOL_VERSION,
      type: MessageType.HELLO,
      senderNodeId: 'node-local',
      timestamp: Date.now(),
      payload: {}
    };

    await expect(manager.send('unknown-node', msg)).rejects.toThrow(NoTransportAvailableError);
  });
});
