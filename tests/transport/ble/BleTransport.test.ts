import { BleTransport } from '../../../src/transport/ble/BleTransport';
import { BleNativeModule } from '../../../src/transport/ble/BleNativeModule';
import { ConnectionState } from '../../../src/transport/types';
import { TransportSendError, PayloadTooLargeError } from '../../../src/transport/errors';

describe('BleTransport', () => {
  let nativeMock: jest.Mocked<BleNativeModule>;
  let configMock: any;
  let transport: BleTransport;

  beforeEach(() => {
    nativeMock = {
      isBleSupported: jest.fn().mockResolvedValue(true),
      requestPermissions: jest.fn().mockResolvedValue(true),
      startAdvertising: jest.fn().mockResolvedValue(undefined),
      stopAdvertising: jest.fn().mockResolvedValue(undefined),
      startScanning: jest.fn().mockResolvedValue(undefined),
      stopScanning: jest.fn().mockResolvedValue(undefined),
      connectGatt: jest.fn().mockResolvedValue(undefined),
      disconnectGatt: jest.fn().mockResolvedValue(undefined),
      writeCharacteristic: jest.fn().mockResolvedValue(undefined),
      requestMtu: jest.fn().mockResolvedValue(512),
      onDeviceDiscovered: jest.fn(),
      onConnectionStateChanged: jest.fn(),
      onDataReceived: jest.fn(),
    };

    configMock = {
      getNumber: jest.fn().mockResolvedValue(1024 * 1024)
    };

    transport = new BleTransport(nativeMock, configMock);
  });

  it('should chunk and send payload correctly', async () => {
    await transport.connect('peer-1');
    expect(nativeMock.connectGatt).toHaveBeenCalledWith('peer-1');
    expect(nativeMock.requestMtu).toHaveBeenCalledWith('peer-1', 512);

    const payload = new Uint8Array(1000);
    await transport.send('peer-1', payload);

    // MTU is 512, header is 12, max chunk payload is 500
    // 1000 bytes / 500 = 2 chunks
    expect(nativeMock.writeCharacteristic).toHaveBeenCalledTimes(2);
  });

  it('should throw PayloadTooLargeError if payload exceeds config limit', async () => {
    configMock.getNumber.mockResolvedValue(500); // Set small max limit
    transport = new BleTransport(nativeMock, configMock);
    await new Promise(r => setTimeout(r, 0)); // let initConfig finish

    const payload = new Uint8Array(1000);
    await expect(transport.send('peer-1', payload)).rejects.toThrow(PayloadTooLargeError);
  });

  it('should throw TransportSendError if write fails', async () => {
    await transport.connect('peer-1');
    nativeMock.writeCharacteristic.mockRejectedValue(new Error('Write failed'));

    const payload = new Uint8Array(10);
    await expect(transport.send('peer-1', payload)).rejects.toThrow(TransportSendError);
  });
});
