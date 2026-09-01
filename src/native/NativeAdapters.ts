import { NativeEventEmitter } from 'react-native';
import * as base64 from 'base64-js';

import NativeBleModule from './specs/NativeBleModule';
import NativeWifiDirectModule from './specs/NativeWifiDirectModule';
import NativeWifiAwareModule from './specs/NativeWifiAwareModule';

import { BleNativeModule } from '../transport/ble/BleNativeModule';
import { WifiDirectNativeModule } from '../transport/wifi-direct/WifiDirectNativeModule';
import { WifiAwareNativeModule } from '../transport/wifi-aware/WifiAwareNativeModule';
import { ConnectionState, Unsubscribe } from '../transport/types';

// Depending on the RN version and TurboModule specifics, you might need to cast to any
const bleEmitter = new NativeEventEmitter(NativeBleModule as any);
const wifiDirectEmitter = new NativeEventEmitter(NativeWifiDirectModule as any);
const wifiAwareEmitter = new NativeEventEmitter(NativeWifiAwareModule as any);

export class BleAdapter implements BleNativeModule {
  async isBleSupported(): Promise<boolean> {
    return NativeBleModule.isSupported();
  }
  async requestPermissions(): Promise<boolean> {
    return NativeBleModule.requestPermissions();
  }
  async startAdvertising(serviceUuid: string): Promise<void> {
    return NativeBleModule.startAdvertising();
  }
  async stopAdvertising(): Promise<void> {
    return NativeBleModule.stopAdvertising();
  }
  async startScanning(serviceUuid: string): Promise<void> {
    return NativeBleModule.startScanning();
  }
  async stopScanning(): Promise<void> {
    return NativeBleModule.stopScanning();
  }
  async connectGatt(deviceAddress: string): Promise<void> {
    return NativeBleModule.connect(deviceAddress);
  }
  async disconnectGatt(deviceAddress: string): Promise<void> {
    return NativeBleModule.disconnect(deviceAddress);
  }
  async writeCharacteristic(deviceAddress: string, bytes: Uint8Array): Promise<void> {
    const b64 = base64.fromByteArray(bytes);
    return NativeBleModule.sendChunk(deviceAddress, b64);
  }
  async requestMtu(deviceAddress: string, mtu: number): Promise<number> {
    return mtu; // MTU negotiation stub
  }

  onDeviceDiscovered(handler: (address: string, rssi: number) => void): Unsubscribe {
    const sub = bleEmitter.addListener('BleDeviceDiscovered', (event) => handler(event.address, event.rssi || 0));
    return () => sub.remove();
  }
  onConnectionStateChanged(handler: (address: string, state: ConnectionState) => void): Unsubscribe {
    const sub = bleEmitter.addListener('BleConnectionStateChanged', (event) => handler(event.address, event.state));
    return () => sub.remove();
  }
  onDataReceived(handler: (address: string, bytes: Uint8Array) => void): Unsubscribe {
    const sub = bleEmitter.addListener('BleDataReceived', (event) => handler(event.address, base64.toByteArray(event.base64Data)));
    return () => sub.remove();
  }
}

export class WifiDirectAdapter implements WifiDirectNativeModule {
  async isSupported(): Promise<boolean> {
    return NativeWifiDirectModule.isSupported();
  }
  async requestPermissions(): Promise<boolean> {
    return NativeWifiDirectModule.requestPermissions();
  }
  async startDiscovery(): Promise<void> {
    return NativeWifiDirectModule.startDiscovery();
  }
  async stopDiscovery(): Promise<void> {
    return NativeWifiDirectModule.stopDiscovery();
  }
  async connect(deviceAddress: string): Promise<void> {
    return NativeWifiDirectModule.connect(deviceAddress);
  }
  async disconnect(): Promise<void> {
    return NativeWifiDirectModule.disconnect();
  }
  async sendBytes(bytes: Uint8Array): Promise<void> {
    const b64 = base64.fromByteArray(bytes);
    return NativeWifiDirectModule.sendBytes(b64);
  }

  onPeerDiscovered(handler: (address: string) => void): Unsubscribe {
    const sub = wifiDirectEmitter.addListener('WifiDirectPeerDiscovered', (event) => handler(event.address));
    return () => sub.remove();
  }
  onGroupFormed(handler: (isGroupOwner: boolean, peerAddress: string) => void): Unsubscribe {
    const sub = wifiDirectEmitter.addListener('WifiDirectGroupFormed', (event) => handler(event.isGroupOwner, event.peerAddress));
    return () => sub.remove();
  }
  onConnectionStateChanged(handler: (state: ConnectionState) => void): Unsubscribe {
    const sub = wifiDirectEmitter.addListener('WifiDirectConnectionStateChanged', (event) => handler(event.state));
    return () => sub.remove();
  }
  onDataReceived(handler: (bytes: Uint8Array) => void): Unsubscribe {
    const sub = wifiDirectEmitter.addListener('WifiDirectDataReceived', (event) => handler(base64.toByteArray(event.base64Data)));
    return () => sub.remove();
  }
}

export class WifiAwareAdapter implements WifiAwareNativeModule {
  async isSupported(): Promise<boolean> {
    return NativeWifiAwareModule.isSupported();
  }
  async requestPermissions(): Promise<boolean> {
    return NativeWifiAwareModule.requestPermissions();
  }
  async publish(serviceName: string): Promise<void> {
    return NativeWifiAwareModule.publish(serviceName);
  }
  async subscribe(serviceName: string): Promise<void> {
    return NativeWifiAwareModule.subscribe(serviceName);
  }
  async stopPublishSubscribe(): Promise<void> {
    return NativeWifiAwareModule.stopPublishSubscribe();
  }
  async openDataPath(peerHandle: string): Promise<void> {
    return NativeWifiAwareModule.openDataPath(peerHandle);
  }
  async closeDataPath(peerHandle: string): Promise<void> {
    return NativeWifiAwareModule.closeDataPath(peerHandle);
  }
  async sendBytes(peerHandle: string, bytes: Uint8Array): Promise<void> {
    const b64 = base64.fromByteArray(bytes);
    return NativeWifiAwareModule.sendBytes(peerHandle, b64);
  }

  onPeerDiscovered(handler: (peerHandle: string) => void): Unsubscribe {
    const sub = wifiAwareEmitter.addListener('WifiAwarePeerDiscovered', (event) => handler(event.peerHandle));
    return () => sub.remove();
  }
  onDataPathEstablished(handler: (peerHandle: string) => void): Unsubscribe {
    const sub = wifiAwareEmitter.addListener('WifiAwareDataPathEstablished', (event) => handler(event.peerHandle));
    return () => sub.remove();
  }
  onConnectionStateChanged(handler: (peerHandle: string, state: ConnectionState) => void): Unsubscribe {
    const sub = wifiAwareEmitter.addListener('WifiAwareConnectionStateChanged', (event) => handler(event.peerHandle, event.state));
    return () => sub.remove();
  }
  onDataReceived(handler: (peerHandle: string, bytes: Uint8Array) => void): Unsubscribe {
    const sub = wifiAwareEmitter.addListener('WifiAwareDataReceived', (event) => handler(event.peerHandle, base64.toByteArray(event.base64Data)));
    return () => sub.remove();
  }
}
