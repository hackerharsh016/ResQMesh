import { PeerDiscoveryService } from '../../src/discovery/PeerDiscoveryService';
import { TransportType } from '../../src/transport/types';
import { MessageType } from '../../src/protocol/types/messages';
import { PROTOCOL_VERSION } from '../../src/protocol/constants';
import { SessionState } from '../../src/discovery/types';
import { WireCodec } from '../../src/transport/WireCodec';

describe('PeerDiscoveryService', () => {
  let service: PeerDiscoveryService;
  let tmMock: any;
  let identityMock: any;
  let peerRepo: any;
  let contactRepo: any;
  let sessionRepo: any;
  let eventRepo: any;
  let wireCodec: WireCodec;

  let rawDiscoverHandler: any;
  let rawMessageHandler: any;
  let peerLostHandler: any;

  beforeEach(() => {
    wireCodec = new WireCodec();
    tmMock = {
      onRawPeerDiscovered: jest.fn((h) => { rawDiscoverHandler = h; return () => {}; }),
      onRawMessageReceived: jest.fn((h) => { rawMessageHandler = h; return () => {}; }),
      onPeerLost: jest.fn((h) => { peerLostHandler = h; return () => {}; }),
      sendToAddress: jest.fn().mockResolvedValue(undefined),
      registerPeerIdentity: jest.fn(),
    };

    identityMock = {
      getIdentity: jest.fn().mockReturnValue({
        nodeId: 'local-node',
        publicKey: 'local-pk'
      }),
      getCapabilities: jest.fn().mockReturnValue({})
    };

    peerRepo = {
      upsert: jest.fn().mockResolvedValue(undefined),
      recordEncounter: jest.fn().mockResolvedValue(undefined),
    };

    contactRepo = {
      create: jest.fn().mockResolvedValue(undefined),
    };

    sessionRepo = {
      create: jest.fn().mockResolvedValue(undefined),
      updateState: jest.fn().mockResolvedValue(undefined),
      getActiveSessions: jest.fn().mockResolvedValue([]),
    };

    eventRepo = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    service = new PeerDiscoveryService(tmMock, identityMock, peerRepo, contactRepo, sessionRepo, eventRepo);
  });

  it('should send HELLO on raw discovery', async () => {
    await service.start();
    await rawDiscoverHandler('peer-1', TransportType.BLE, -50);

    expect(tmMock.sendToAddress).toHaveBeenCalledWith('peer-1', TransportType.BLE, expect.objectContaining({
      type: MessageType.HELLO,
      senderNodeId: 'local-node'
    }));
  });

  it('should ignore duplicate raw discovery if mid-handshake', async () => {
    await service.start();
    await rawDiscoverHandler('peer-1', TransportType.BLE, -50);
    await rawDiscoverHandler('peer-1', TransportType.WIFI_DIRECT, -60);

    expect(tmMock.sendToAddress).toHaveBeenCalledTimes(1);
  });

  it('should handle incoming HELLO_ACK and finalize session', async () => {
    await service.start();
    const onEstablished = jest.fn();
    service.onSessionEstablished(onEstablished);

    await rawDiscoverHandler('peer-1', TransportType.BLE, -50);

    const ackMsg = {
      version: PROTOCOL_VERSION,
      type: MessageType.HELLO_ACK,
      senderNodeId: 'remote-node',
      timestamp: Date.now(),
      payload: { accepted: true }
    };

    const payload = wireCodec.encode(ackMsg as any);
    await rawMessageHandler('peer-1', TransportType.BLE, payload);

    expect(tmMock.registerPeerIdentity).toHaveBeenCalledWith('peer-1', 'remote-node', TransportType.BLE);
    expect(peerRepo.upsert).toHaveBeenCalledWith({ nodeId: 'remote-node' });
    expect(contactRepo.create).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'remote-node' }));
    expect(sessionRepo.create).toHaveBeenCalled();
    expect(onEstablished).toHaveBeenCalled();
  });

  it('should reply with HELLO_ACK when receiving HELLO', async () => {
    await service.start();
    const helloMsg = {
      version: PROTOCOL_VERSION,
      type: MessageType.HELLO,
      senderNodeId: 'remote-node',
      timestamp: Date.now(),
      payload: { protocolVersion: PROTOCOL_VERSION, nodeId: 'remote-node' }
    };

    const payload = wireCodec.encode(helloMsg as any);
    await rawMessageHandler('peer-1', TransportType.BLE, payload);

    expect(tmMock.sendToAddress).toHaveBeenCalledWith('peer-1', TransportType.BLE, expect.objectContaining({
      type: MessageType.HELLO_ACK,
      payload: expect.objectContaining({ accepted: true })
    }));

    expect(tmMock.registerPeerIdentity).toHaveBeenCalledWith('peer-1', 'remote-node', TransportType.BLE);
  });

  it('should reply with negative HELLO_ACK if version mismatch', async () => {
    await service.start();
    const helloMsg = {
      version: PROTOCOL_VERSION,
      type: MessageType.HELLO,
      senderNodeId: 'remote-node',
      timestamp: Date.now(),
      payload: { protocolVersion: 999, nodeId: 'remote-node' } // mismatch
    };

    const payload = wireCodec.encode(helloMsg as any);
    await rawMessageHandler('peer-1', TransportType.BLE, payload);

    expect(tmMock.sendToAddress).toHaveBeenCalledWith('peer-1', TransportType.BLE, expect.objectContaining({
      type: MessageType.HELLO_ACK,
      payload: expect.objectContaining({ accepted: false })
    }));

    expect(tmMock.registerPeerIdentity).not.toHaveBeenCalled();
  });

  it('should teardown session on peer lost', async () => {
    await service.start();
    const onClosed = jest.fn();
    service.onSessionClosed(onClosed);

    // Setup active session
    await rawDiscoverHandler('peer-1', TransportType.BLE, -50);
    const ackMsg = {
      version: PROTOCOL_VERSION,
      type: MessageType.HELLO_ACK,
      senderNodeId: 'remote-node',
      timestamp: Date.now(),
      payload: { accepted: true }
    };
    const payload = wireCodec.encode(ackMsg as any);
    await rawMessageHandler('peer-1', TransportType.BLE, payload);

    // Peer lost
    await peerLostHandler('remote-node');

    expect(peerRepo.recordEncounter).toHaveBeenCalledWith('remote-node', expect.any(Number));
    expect(sessionRepo.updateState).toHaveBeenCalledWith(expect.any(String), SessionState.CLOSED);
    expect(onClosed).toHaveBeenCalled();
  });
});
