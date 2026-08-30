import { ConnectionState, Unsubscribe } from '../types';

export interface WifiDirectNativeModule {
  isSupported(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(deviceAddress: string): Promise<void>;
  disconnect(): Promise<void>;
  sendBytes(bytes: Uint8Array): Promise<void>;
  onPeerDiscovered(handler: (address: string) => void): Unsubscribe;
  onGroupFormed(handler: (isGroupOwner: boolean, peerAddress: string) => void): Unsubscribe;
  onConnectionStateChanged(handler: (state: ConnectionState) => void): Unsubscribe;
  onDataReceived(handler: (bytes: Uint8Array) => void): Unsubscribe;
}
