import { ConnectionState, Unsubscribe } from '../types';

export interface BleNativeModule {
  isBleSupported(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;

  startAdvertising(serviceUuid: string): Promise<void>;
  stopAdvertising(): Promise<void>;

  startScanning(serviceUuid: string): Promise<void>;
  stopScanning(): Promise<void>;

  connectGatt(deviceAddress: string): Promise<void>;
  disconnectGatt(deviceAddress: string): Promise<void>;

  writeCharacteristic(deviceAddress: string, bytes: Uint8Array): Promise<void>;
  requestMtu(deviceAddress: string, mtu: number): Promise<number>;

  onDeviceDiscovered(handler: (address: string, rssi: number) => void): Unsubscribe;
  onConnectionStateChanged(handler: (address: string, state: ConnectionState) => void): Unsubscribe;
  onDataReceived(handler: (address: string, bytes: Uint8Array) => void): Unsubscribe;
}
