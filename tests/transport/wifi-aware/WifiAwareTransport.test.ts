import { WifiAwareTransport } from '../../../src/transport/wifi-aware/WifiAwareTransport';
import { ConnectionState } from '../../../src/transport/types';
import { TransportSendError } from '../../../src/transport/errors';

describe('WifiAwareTransport', () => {
  let native: any;
  let configRepo: any;
  let transport: WifiAwareTransport;

  beforeEach(async () => {
    native = {
      isSupported: jest.fn().mockResolvedValue(true),
      requestPermissions: jest.fn().mockResolvedValue(true),
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      stopPublishSubscribe: jest.fn().mockResolvedValue(undefined),
      openDataPath: jest.fn().mockResolvedValue(undefined),
      closeDataPath: jest.fn().mockResolvedValue(undefined),
      sendBytes: jest.fn().mockResolvedValue(undefined),
      onPeerDiscovered: jest.fn(() => () => {}),
      onDataPathEstablished: jest.fn(() => () => {}),
      onConnectionStateChanged: jest.fn(() => () => {}),
      onDataReceived: jest.fn(() => () => {})
    };
    
    configRepo = {
      get: jest.fn().mockResolvedValue('8192')
    };

    transport = new WifiAwareTransport(native, configRepo);
    await transport.initialize();
  });

  it('allows multiple concurrent connections (no single-group constraint)', async () => {
    let stateHandler: any;
    native.onDataPathEstablished.mockImplementation((cb: any) => {
      stateHandler = cb;
      return () => {};
    });
    
    const t2 = new WifiAwareTransport(native, configRepo);
    await t2.initialize();

    await t2.connect('peer1');
    if (stateHandler) stateHandler('peer1'); // Establish data path for peer1
    
    await expect(t2.connect('peer2')).resolves.toBeUndefined(); // Should not throw TransportBusyError
  });

  it('handles openDataPath timeout', async () => {
    native.openDataPath.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 30000)));
    
    jest.useFakeTimers();
    const connectPromise = transport.connect('peer1');
    jest.advanceTimersByTime(25000);
    
    await expect(connectPromise).rejects.toThrow(TransportSendError);
    jest.useRealTimers();
  });

  it('sends data correctly framed for specific peerHandle', async () => {
    let stateHandler: any;
    native.onDataPathEstablished.mockImplementation((cb: any) => {
      stateHandler = cb;
      return () => {};
    });
    
    const t2 = new WifiAwareTransport(native, configRepo);
    await t2.initialize();

    await t2.connect('peer1');
    if (stateHandler) stateHandler('peer1');

    const payload = new Uint8Array([1, 2, 3]);
    await t2.send('peer1', payload);
    
    expect(native.sendBytes).toHaveBeenCalled();
    const callArgs = native.sendBytes.mock.calls[0];
    expect(callArgs[0]).toBe('peer1');
    expect(callArgs[1].length).toBe(7);
  });
});
