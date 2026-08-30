import { MeshTransport } from '../MeshTransport';
import { TransportType, ConnectionState, DiscoveredPeer, Unsubscribe } from '../types';
import { WifiDirectNativeModule } from './WifiDirectNativeModule';
import { LengthPrefixedStreamFramer } from '../shared/StreamFramer';
import { LocalConfigRepository } from '../../identity/LocalConfigRepository';
import { TransportBusyError, TransportSendError } from '../errors';
import { GROUP_FORMATION_TIMEOUT_MS } from '../shared/constants';

export class WifiDirectTransport implements MeshTransport {
  public type: TransportType = TransportType.WIFI_DIRECT;
  public maxMessageSize: number = 0;
  private activePeer: string | null = null;
  private framer: LengthPrefixedStreamFramer;
  private unsubscribes: Unsubscribe[] = [];

  private discoverHandlers = new Set<(peer: DiscoveredPeer) => void>();
  private lostHandlers = new Set<(peerAddress: string) => void>();
  private stateHandlers = new Set<(peerAddress: string, state: ConnectionState) => void>();
  private messageHandlers = new Set<(peerAddress: string, payload: Uint8Array) => void>();

  constructor(
    private native: WifiDirectNativeModule,
    private configRepo: LocalConfigRepository
  ) {
    this.framer = new LengthPrefixedStreamFramer(8192); // initial stub
  }

  async initialize(): Promise<void> {
    const sizeStr = await this.configRepo.get('max_bundle_size');
    this.maxMessageSize = sizeStr ? parseInt(sizeStr, 10) : 8192;
    this.framer = new LengthPrefixedStreamFramer(this.maxMessageSize);

    this.unsubscribes.push(
      this.native.onPeerDiscovered((address) => {
        for (const h of this.discoverHandlers) {
          h({
            peerAddress: address,
            transport: this.type,
            discoveredAt: Date.now()
          });
        }
      }),
      this.native.onConnectionStateChanged((state) => {
        if (!this.activePeer) return;
        if (state === ConnectionState.DISCONNECTED || state === ConnectionState.FAILED) {
          this.framer.reset(this.activePeer);
          const peer = this.activePeer;
          this.activePeer = null;
          for (const h of this.stateHandlers) h(peer, state);
        } else {
          for (const h of this.stateHandlers) h(this.activePeer, state);
        }
      }),
      this.native.onDataReceived((bytes) => {
        if (!this.activePeer) return;
        try {
          const payloads = this.framer.addData(this.activePeer, bytes);
          for (const p of payloads) {
            for (const h of this.messageHandlers) h(this.activePeer, p);
          }
        } catch (e) {
          // Framing error (e.g. payload too large). Disconnect or reset.
          this.framer.reset(this.activePeer);
        }
      }),
      this.native.onGroupFormed((isOwner, peerAddress) => {
        if (this.activePeer === peerAddress) {
          for (const h of this.stateHandlers) h(this.activePeer, ConnectionState.CONNECTED);
        }
      })
    );
  }

  async destroy(): Promise<void> {
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes = [];
  }

  async isSupported(): Promise<boolean> {
    return this.native.isSupported();
  }

  async requestPermissions(): Promise<boolean> {
    return this.native.requestPermissions();
  }

  async startAdvertising(): Promise<void> {
    // Wi-Fi direct discovery is symmetrical
    await this.native.startDiscovery();
  }

  async stopAdvertising(): Promise<void> {
    await this.native.stopDiscovery();
  }

  async startDiscovery(): Promise<void> {
    await this.native.startDiscovery();
  }

  async stopDiscovery(): Promise<void> {
    await this.native.stopDiscovery();
  }

  async connect(peerAddress: string): Promise<void> {
    if (this.activePeer && this.activePeer !== peerAddress) {
      throw new TransportBusyError(`Wi-Fi Direct already connected to ${this.activePeer}`);
    }
    
    this.activePeer = peerAddress;
    for (const h of this.stateHandlers) h(peerAddress, ConnectionState.CONNECTING);

    try {
      const connectPromise = this.native.connect(peerAddress);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), GROUP_FORMATION_TIMEOUT_MS);
      });

      await Promise.race([connectPromise, timeoutPromise]);
    } catch (e: any) {
      this.activePeer = null;
      for (const h of this.stateHandlers) h(peerAddress, ConnectionState.FAILED);
      throw new TransportSendError(`WifiDirect connect failed: ${e.message}`);
    }
  }

  async disconnect(peerAddress: string): Promise<void> {
    if (this.activePeer === peerAddress) {
      await this.native.disconnect();
      this.framer.reset(peerAddress);
      this.activePeer = null;
      for (const h of this.stateHandlers) h(peerAddress, ConnectionState.DISCONNECTED);
    }
  }

  async send(peerAddress: string, payload: Uint8Array): Promise<void> {
    if (this.activePeer !== peerAddress) {
      throw new TransportSendError(`Not connected to ${peerAddress}`);
    }

    const framed = this.framer.frame(payload);
    await this.native.sendBytes(framed);
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
}
