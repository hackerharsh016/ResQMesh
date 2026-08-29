import { MeshTransport } from '../MeshTransport';
import { TransportType, ConnectionState, DiscoveredPeer, Unsubscribe } from '../types';

export class MockTransport implements MeshTransport {
  public type: TransportType;
  public maxMessageSize: number;
  
  public supported: boolean = true;
  public connectedPeers: Set<string> = new Set();

  private discoverHandlers: Set<(peer: DiscoveredPeer) => void> = new Set();
  private lostHandlers: Set<(peerAddress: string) => void> = new Set();
  private stateHandlers: Set<(peerAddress: string, state: ConnectionState) => void> = new Set();
  private messageHandlers: Set<(peerAddress: string, payload: Uint8Array) => void> = new Set();

  // Test double references to simulate "ether"
  public etherPeers: Map<string, MockTransport> = new Map();
  
  // Need a way for the mock to know its own address so it can tell the target who is sending
  public mockAddress: string;

  constructor(type: TransportType = TransportType.BLE, maxMessageSize: number = 512, mockAddress: string = 'local-mock') {
    this.type = type;
    this.maxMessageSize = maxMessageSize;
    this.mockAddress = mockAddress;
  }

  async isSupported(): Promise<boolean> {
    return this.supported;
  }

  async requestPermissions(): Promise<boolean> {
    return true;
  }

  async startAdvertising(): Promise<void> {}
  async stopAdvertising(): Promise<void> {}
  async startDiscovery(): Promise<void> {}
  async stopDiscovery(): Promise<void> {}

  async connect(peerAddress: string): Promise<void> {
    this.connectedPeers.add(peerAddress);
    for (const h of this.stateHandlers) {
      h(peerAddress, ConnectionState.CONNECTED);
    }
  }

  async disconnect(peerAddress: string): Promise<void> {
    this.connectedPeers.delete(peerAddress);
    for (const h of this.stateHandlers) {
      h(peerAddress, ConnectionState.DISCONNECTED);
    }
  }

  async send(peerAddress: string, payload: Uint8Array): Promise<void> {
    if (!this.connectedPeers.has(peerAddress)) {
      throw new Error(`Not connected to ${peerAddress}`);
    }
    const target = this.etherPeers.get(peerAddress);
    if (target) {
      // Simulate sending by calling the target's receive handlers asynchronously
      setTimeout(() => {
        target.simulateReceive(this.mockAddress, payload);
      }, 10);
    }
  }

  onPeerDiscovered(handler: (peer: DiscoveredPeer) => void): Unsubscribe {
    this.discoverHandlers.add(handler);
    return () => this.discoverHandlers.delete(handler);
  }

  onPeerLost(handler: (peerAddress: string) => void): Unsubscribe {
    this.lostHandlers.add(handler);
    return () => this.lostHandlers.delete(handler);
  }

  onConnectionStateChanged(handler: (peerAddress: string, state: ConnectionState) => void): Unsubscribe {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  onMessageReceived(handler: (peerAddress: string, payload: Uint8Array) => void): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  getMaxMessageSize(): number {
    return this.maxMessageSize;
  }

  // Test helpers
  simulateDiscover(peer: DiscoveredPeer) {
    for (const h of this.discoverHandlers) h(peer);
  }

  simulateLost(peerAddress: string) {
    for (const h of this.lostHandlers) h(peerAddress);
  }

  simulateReceive(peerAddress: string, payload: Uint8Array) {
    for (const h of this.messageHandlers) h(peerAddress, payload);
  }
}
