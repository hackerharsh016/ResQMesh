import { WifiDirectTransport } from '../../../src/transport/wifi-direct/WifiDirectTransport';
import { ConnectionState } from '../../../src/transport/types';
import { TransportBusyError, TransportSendError } from '../../../src/transport/errors';

describe('WifiDirectTransport', () => {
  let native: any;
  let configRepo: any;
  let transport: WifiDirectTransport;

  beforeEach(async () => {
    native = {
      isSupported: jest.fn().mockResolvedValue(true),
      requestPermissions: jest.fn().mockResolvedValue(true),
      startDiscovery: jest.fn().mockResolvedValue(undefined),
      stopDiscovery: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      sendBytes: jest.fn().mockResolvedValue(undefined),
      onPeerDiscovered: jest.fn(() => () => {}),
      onGroupFormed: jest.fn(() => () => {}),
      onConnectionStateChanged: jest.fn(() => () => {}),
      onDataReceived: jest.fn(() => () => {})
    };
    
    configRepo = {
      get: jest.fn().mockResolvedValue('8192')
    };

    transport = new WifiDirectTransport(native, configRepo);
    await transport.initialize();
  });

  it('enforces single-group constraint', async () => {
    // First connection
    await transport.connect('peer1');
    expect(native.connect).toHaveBeenCalledWith('peer1');

    // Attempting second connection while first is active
    await expect(transport.connect('peer2')).rejects.toThrow(TransportBusyError);
  });

  it('handles group formation timeout', async () => {
    native.connect.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 30000)));
    
    // Run with fake timers or just a fast timeout override. 
    // Wait, testing actual GROUP_FORMATION_TIMEOUT_MS takes 20s. 
    // We should probably mock it or mock setTimeout.
    jest.useFakeTimers();
    const connectPromise = transport.connect('peer1');
    jest.advanceTimersByTime(25000);
    
    await expect(connectPromise).rejects.toThrow(TransportSendError);
    jest.useRealTimers();
  });

  it('sends data correctly framed', async () => {
    await transport.connect('peer1');
    const payload = new Uint8Array([1, 2, 3]);
    await transport.send('peer1', payload);
    
    expect(native.sendBytes).toHaveBeenCalled();
    const sentBytes = native.sendBytes.mock.calls[0][0];
    expect(sentBytes.length).toBe(7); // 4 header + 3 payload
    expect(sentBytes[6]).toBe(3);
  });

  it('receives data correctly framed', async () => {
    // Setup handlers
    let dataHandler: any;
    native.onDataReceived.mockImplementation((cb: any) => {
      dataHandler = cb;
      return () => {};
    });
    
    const t2 = new WifiDirectTransport(native, configRepo);
    await t2.initialize();
    
    await t2.connect('peer1');

    const receivedPayloads: Uint8Array[] = [];
    t2.onMessageReceived((peer, payload) => receivedPayloads.push(payload));

    const rawBytes = new Uint8Array([0, 0, 0, 3, 1, 2, 3]); // Length 3, payload [1, 2, 3]
    dataHandler(rawBytes);

    expect(receivedPayloads.length).toBe(1);
    expect(receivedPayloads[0]).toEqual(new Uint8Array([1, 2, 3]));
  });
});
