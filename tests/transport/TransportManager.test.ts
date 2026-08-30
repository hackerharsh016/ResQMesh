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

    manager.registerPeerIdentity('peer1-ble', 'node1', TransportType.BLE);
    manager.registerPeerIdentity('peer1-wifi', 'node1', TransportType.WIFI_DIRECT);

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

    const wifiSpy = jest.spyOn(wifi, 'send');
    const bleSpy = jest.spyOn(ble, 'send');

    await manager.send('node1', msg);

    expect(wifiSpy).toHaveBeenCalled();
    expect(bleSpy).not.toHaveBeenCalled();
  });

  it('should throw PayloadTooLargeError if message exceeds best transport limit', async () => {
    manager.registerPeerIdentity('peer1-ble', 'node1', TransportType.BLE);

    const msg: any = {
      version: PROTOCOL_VERSION,
      type: MessageType.HELLO,
      senderNodeId: 'node-local',
      timestamp: Date.now(),
      payload: { data: 'x'.repeat(1000) }
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

  it('should route unknown peer discovery to raw handler', () => {
    const onRawDiscovered = jest.fn();
    manager.onRawPeerDiscovered(onRawDiscovered);
    ble.simulateDiscover({ peerAddress: 'unknown-1', transport: TransportType.BLE, discoveredAt: Date.now() });
    expect(onRawDiscovered).toHaveBeenCalledWith('unknown-1', TransportType.BLE, undefined);
  });

  it('should route unknown peer messages to raw handler', () => {
    const onRawMsg = jest.fn();
    manager.onRawMessageReceived(onRawMsg);
    ble.simulateReceive('unknown-1', new Uint8Array([1, 2, 3]));
    expect(onRawMsg).toHaveBeenCalledWith('unknown-1', TransportType.BLE, expect.any(Uint8Array));
  });

  it('should send to address before identity is known', async () => {
    const msg: any = {
      version: PROTOCOL_VERSION,
      type: MessageType.HELLO,
      senderNodeId: 'node-local',
      timestamp: Date.now(),
      payload: {} as any
    };
    const bleSpy = jest.spyOn(ble, 'send');
    await manager.sendToAddress('unknown-1', TransportType.BLE, msg);
    expect(bleSpy).toHaveBeenCalledWith('unknown-1', expect.any(Uint8Array));
  });
});
