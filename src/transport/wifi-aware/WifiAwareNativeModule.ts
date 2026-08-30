import { ConnectionState, Unsubscribe } from '../types';

export interface WifiAwareNativeModule {
  isSupported(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  publish(serviceName: string): Promise<void>;
  subscribe(serviceName: string): Promise<void>;
  stopPublishSubscribe(): Promise<void>;
  openDataPath(peerHandle: string): Promise<void>;
  closeDataPath(peerHandle: string): Promise<void>;
  sendBytes(peerHandle: string, bytes: Uint8Array): Promise<void>;
  onPeerDiscovered(handler: (peerHandle: string) => void): Unsubscribe;
  onDataPathEstablished(handler: (peerHandle: string) => void): Unsubscribe;
  onConnectionStateChanged(handler: (peerHandle: string, state: ConnectionState) => void): Unsubscribe;
  onDataReceived(handler: (peerHandle: string, bytes: Uint8Array) => void): Unsubscribe;
}
