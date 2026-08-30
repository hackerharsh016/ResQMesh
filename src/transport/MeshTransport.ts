import { TransportType, ConnectionState, DiscoveredPeer, Unsubscribe } from './types';

export interface MeshTransport {
  readonly type: TransportType;

  isSupported(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;

  startAdvertising(): Promise<void>;
  stopAdvertising(): Promise<void>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;

  connect(peerAddress: string): Promise<void>;
  disconnect(peerAddress: string): Promise<void>;

  send(peerAddress: string, payload: Uint8Array): Promise<void>;

  onPeerDiscovered(handler: (peer: DiscoveredPeer) => void): Unsubscribe;
  onPeerLost(handler: (peerAddress: string) => void): Unsubscribe;
  onConnectionStateChanged(handler: (peerAddress: string, state: ConnectionState) => void): Unsubscribe;
  onMessageReceived(handler: (peerAddress: string, payload: Uint8Array) => void): Unsubscribe;

  getMaxMessageSize(): number;
}
