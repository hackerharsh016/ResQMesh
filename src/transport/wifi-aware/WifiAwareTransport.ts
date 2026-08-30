import { MeshTransport } from '../MeshTransport';
import { TransportType, ConnectionState, DiscoveredPeer, Unsubscribe } from '../types';
import { WifiAwareNativeModule } from './WifiAwareNativeModule';
import { LengthPrefixedStreamFramer } from '../shared/StreamFramer';
import { LocalConfigRepository } from '../../identity/LocalConfigRepository';
import { TransportSendError } from '../errors';
import { GROUP_FORMATION_TIMEOUT_MS } from '../shared/constants';
import { WIFI_AWARE_SERVICE_NAME } from './constants';

export class WifiAwareTransport implements MeshTransport {
  public type: TransportType = TransportType.WIFI_AWARE;
  public maxMessageSize: number = 0;
  private activePeers = new Set<string>();
  private framer: LengthPrefixedStreamFramer;
  private unsubscribes: Unsubscribe[] = [];

  private discoverHandlers = new Set<(peer: DiscoveredPeer) => void>();
  private lostHandlers = new Set<(peerAddress: string) => void>();
  private stateHandlers = new Set<(peerAddress: string, state: ConnectionState) => void>();
  private messageHandlers = new Set<(peerAddress: string, payload: Uint8Array) => void>();

  constructor(
    private native: WifiAwareNativeModule,
    private configRepo: LocalConfigRepository
  ) {
    this.framer = new LengthPrefixedStreamFramer(8192);
  }

  async initialize(): Promise<void> {
    const sizeStr = await this.configRepo.get('max_bundle_size');
    this.maxMessageSize = sizeStr ? parseInt(sizeStr, 10) : 8192;
    this.framer = new LengthPrefixedStreamFramer(this.maxMessageSize);

    this.unsubscribes.push(
      this.native.onPeerDiscovered((peerHandle) => {
        for (const h of this.discoverHandlers) {
          h({
            peerAddress: peerHandle,
            transport: this.type,
            discoveredAt: Date.now()
          });
        }
      }),
      this.native.onConnectionStateChanged((peerHandle, state) => {
        if (state === ConnectionState.DISCONNECTED || state === ConnectionState.FAILED) {
          this.framer.reset(peerHandle);
          this.activePeers.delete(peerHandle);
        }
        for (const h of this.stateHandlers) h(peerHandle, state);
      }),
      this.native.onDataReceived((peerHandle, bytes) => {
        try {
          const payloads = this.framer.addData(peerHandle, bytes);
          for (const p of payloads) {
            for (const h of this.messageHandlers) h(peerHandle, p);
          }
        } catch (e) {
          this.framer.reset(peerHandle);
        }
      }),
      this.native.onDataPathEstablished((peerHandle) => {
        this.activePeers.add(peerHandle);
        for (const h of this.stateHandlers) h(peerHandle, ConnectionState.CONNECTED);
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
    await this.native.publish(WIFI_AWARE_SERVICE_NAME);
  }

  async stopAdvertising(): Promise<void> {
    await this.native.stopPublishSubscribe();
  }

  async startDiscovery(): Promise<void> {
    await this.native.subscribe(WIFI_AWARE_SERVICE_NAME);
  }

  async stopDiscovery(): Promise<void> {
    await this.native.stopPublishSubscribe();
  }

  async connect(peerAddress: string): Promise<void> {
    for (const h of this.stateHandlers) h(peerAddress, ConnectionState.CONNECTING);

    try {
      const connectPromise = this.native.openDataPath(peerAddress);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), GROUP_FORMATION_TIMEOUT_MS);
      });

      await Promise.race([connectPromise, timeoutPromise]);
    } catch (e: any) {
      for (const h of this.stateHandlers) h(peerAddress, ConnectionState.FAILED);
      throw new TransportSendError(`WifiAware connect failed: ${e.message}`);
    }
  }

  async disconnect(peerAddress: string): Promise<void> {
    await this.native.closeDataPath(peerAddress);
    this.framer.reset(peerAddress);
    this.activePeers.delete(peerAddress);
    for (const h of this.stateHandlers) h(peerAddress, ConnectionState.DISCONNECTED);
  }

  async send(peerAddress: string, payload: Uint8Array): Promise<void> {
    if (!this.activePeers.has(peerAddress)) {
      throw new TransportSendError(`Not connected to ${peerAddress}`);
    }

    const framed = this.framer.frame(payload);
    await this.native.sendBytes(peerAddress, framed);
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
