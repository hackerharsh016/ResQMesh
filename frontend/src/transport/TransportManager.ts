import { MeshTransport } from './MeshTransport';
import { TransportType, ConnectionState, Unsubscribe } from './types';
import { ProtocolMessage } from '../protocol/types/messages';
import { WireCodec } from './WireCodec';
import { PeerTransportRepository } from '../storage/repositories/PeerTransportRepository';
import { NoTransportAvailableError, PayloadTooLargeError, TransportSendError } from './errors';

export interface TransportManagerInterface {
  registerTransport(transport: MeshTransport): void;
  startAll(): Promise<void>;
  stopAll(): Promise<void>;
  send(nodeId: string, message: ProtocolMessage): Promise<void>;
  sendToAddress(peerAddress: string, transport: TransportType, message: ProtocolMessage): Promise<void>;
  getAvailableTransports(nodeId: string): TransportType[];
  onPeerDiscovered(handler: (nodeId: string, transports: TransportType[]) => void): Unsubscribe;
  onPeerLost(handler: (nodeId: string) => void): Unsubscribe;
  onMessageReceived(handler: (nodeId: string, message: ProtocolMessage) => void): Unsubscribe;
  onRawPeerDiscovered(handler: (peerAddress: string, transport: TransportType, signalStrength?: number) => void): Unsubscribe;
  onRawMessageReceived(handler: (peerAddress: string, transport: TransportType, payload: Uint8Array) => void): Unsubscribe;
  registerPeerIdentity(peerAddress: string, nodeId: string, transport: TransportType): void;
}

export class TransportManager implements TransportManagerInterface {
  private transports: Map<TransportType, MeshTransport> = new Map();
  private wireCodec = new WireCodec();
  
  // Maps transport-specific peerAddress to known nodeIds
  private addressToNodeId: Map<string, string> = new Map();
  
  // Maps nodeIds to the set of transport types they are currently available on
  private availableTransports: Map<string, Set<TransportType>> = new Map();

  // Maps nodeIds to sets of peerAddresses
  private nodeToAddresses: Map<string, Map<TransportType, string>> = new Map();

  private peerDiscoveredHandlers: Set<(nodeId: string, transports: TransportType[]) => void> = new Set();
  private peerLostHandlers: Set<(nodeId: string) => void> = new Set();
  private messageReceivedHandlers: Set<(nodeId: string, message: ProtocolMessage) => void> = new Set();

  private rawPeerDiscoveredHandlers: Set<(peerAddress: string, transport: TransportType, signalStrength?: number) => void> = new Set();
  private rawMessageReceivedHandlers: Set<(peerAddress: string, transport: TransportType, payload: Uint8Array) => void> = new Set();

  constructor(private peerTransportRepo: PeerTransportRepository) {}

  registerTransport(transport: MeshTransport): void {
    this.transports.set(transport.type, transport);

    transport.onPeerDiscovered(async (peer) => {
      const nodeId = peer.nodeId || this.addressToNodeId.get(peer.peerAddress);
      if (nodeId) {
        // We know who this is, dedup and aggregate
        this.handlePeerAvailable(nodeId, peer.peerAddress, peer.transport, peer.signalStrength);
      } else {
        // Unknown identity yet. Fire raw event for PeerDiscoveryService.
        for (const h of this.rawPeerDiscoveredHandlers) {
          h(peer.peerAddress, peer.transport, peer.signalStrength);
        }
      }
    });

    transport.onPeerLost((peerAddress) => {
      const nodeId = this.addressToNodeId.get(peerAddress);
      if (nodeId) {
        const transports = this.availableTransports.get(nodeId);
        if (transports) {
          transports.delete(transport.type);
          if (transports.size === 0) {
            this.availableTransports.delete(nodeId);
            for (const h of this.peerLostHandlers) h(nodeId);
          }
        }
      }
    });

    transport.onMessageReceived((peerAddress, payload) => {
      const nodeId = this.addressToNodeId.get(peerAddress);
      if (nodeId) {
        // Known peer
        try {
          const message = this.wireCodec.decode(payload);
          for (const h of this.messageReceivedHandlers) h(nodeId, message);
        } catch (e) {
          console.error(`Failed to decode incoming message from known peer ${peerAddress}`, e);
        }
      } else {
        // Unknown peer, route to raw channel for handshake
        for (const h of this.rawMessageReceivedHandlers) {
          h(peerAddress, transport.type, payload);
        }
      }
    });
  }

  async startAll(): Promise<void> {
    for (const [_, t] of this.transports) {
      try {
        if (await t.isSupported()) {
          await t.requestPermissions();
          await t.startAdvertising();
          await t.startDiscovery();
        }
      } catch (e) {
        console.error(`Failed to start transport ${t.type}`, e);
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const [_, t] of this.transports) {
      try {
        await t.stopDiscovery();
        await t.stopAdvertising();
      } catch (e) {
        console.error(`Failed to stop transport ${t.type}`, e);
      }
    }
  }

  registerPeerIdentity(peerAddress: string, nodeId: string, transport: TransportType): void {
    this.addressToNodeId.set(peerAddress, nodeId);
    let map = this.nodeToAddresses.get(nodeId);
    if (!map) {
      map = new Map();
      this.nodeToAddresses.set(nodeId, map);
    }
    map.set(transport, peerAddress);
    
    // Trigger discovery event if not already tracked
    this.handlePeerAvailable(nodeId, peerAddress, transport);
  }

  private handlePeerAvailable(nodeId: string, peerAddress: string, transportType: TransportType, signalStrength?: number) {
    let transports = this.availableTransports.get(nodeId);
    if (!transports) {
      transports = new Set();
      this.availableTransports.set(nodeId, transports);
    }

    if (!transports.has(transportType)) {
      transports.add(transportType);
      
      // Fire discovery event
      for (const h of this.peerDiscoveredHandlers) {
        h(nodeId, Array.from(transports));
      }
      
      // Persist in DB
      this.peerTransportRepo.upsert(nodeId, transportType, signalStrength).catch(e => console.error(e));
    }
  }

  async send(nodeId: string, message: ProtocolMessage): Promise<void> {
    const available = this.availableTransports.get(nodeId);
    if (!available || available.size === 0) {
      throw new NoTransportAvailableError(`No transports available for ${nodeId}`);
    }

    const addresses = this.nodeToAddresses.get(nodeId);
    if (!addresses) {
      throw new NoTransportAvailableError(`No addresses mapped for ${nodeId}`);
    }

    const payload = this.wireCodec.encode(message);

    let bestTransport: MeshTransport | null = null;
    for (const type of available) {
      const t = this.transports.get(type);
      if (t) {
        if (!bestTransport || t.getMaxMessageSize() > bestTransport.getMaxMessageSize()) {
          bestTransport = t;
        }
      }
    }

    if (!bestTransport) {
      throw new NoTransportAvailableError(`No valid transport instance found for ${nodeId}`);
    }

    if (payload.length > bestTransport.getMaxMessageSize()) {
      throw new PayloadTooLargeError(`Payload size ${payload.length} exceeds transport max ${bestTransport.getMaxMessageSize()}`);
    }

    const peerAddress = addresses.get(bestTransport.type);
    if (!peerAddress) {
      throw new NoTransportAvailableError(`Missing peer address for transport ${bestTransport.type}`);
    }

    try {
      await bestTransport.connect(peerAddress);
      await bestTransport.send(peerAddress, payload);
    } catch (e) {
      throw new TransportSendError(`Failed to send over ${bestTransport.type}: ${e}`);
    }
  }

  async sendToAddress(peerAddress: string, transport: TransportType, message: ProtocolMessage): Promise<void> {
    const t = this.transports.get(transport);
    if (!t) {
      throw new NoTransportAvailableError(`Transport ${transport} not registered`);
    }

    const payload = this.wireCodec.encode(message);
    if (payload.length > t.getMaxMessageSize()) {
      throw new PayloadTooLargeError(`Payload size ${payload.length} exceeds transport max ${t.getMaxMessageSize()}`);
    }

    try {
      await t.connect(peerAddress);
      await t.send(peerAddress, payload);
    } catch (e) {
      throw new TransportSendError(`Failed to sendToAddress over ${transport}: ${e}`);
    }
  }

  getAvailableTransports(nodeId: string): TransportType[] {
    return Array.from(this.availableTransports.get(nodeId) || []);
  }

  onPeerDiscovered(handler: (nodeId: string, transports: TransportType[]) => void): Unsubscribe {
    this.peerDiscoveredHandlers.add(handler);
    return () => this.peerDiscoveredHandlers.delete(handler);
  }

  onPeerLost(handler: (nodeId: string) => void): Unsubscribe {
    this.peerLostHandlers.add(handler);
    return () => this.peerLostHandlers.delete(handler);
  }

  onMessageReceived(handler: (nodeId: string, message: ProtocolMessage) => void): Unsubscribe {
    this.messageReceivedHandlers.add(handler);
    return () => this.messageReceivedHandlers.delete(handler);
  }

  onRawPeerDiscovered(handler: (peerAddress: string, transport: TransportType, signalStrength?: number) => void): Unsubscribe {
    this.rawPeerDiscoveredHandlers.add(handler);
    return () => this.rawPeerDiscoveredHandlers.delete(handler);
  }

  onRawMessageReceived(handler: (peerAddress: string, transport: TransportType, payload: Uint8Array) => void): Unsubscribe {
    this.rawMessageReceivedHandlers.add(handler);
    return () => this.rawMessageReceivedHandlers.delete(handler);
  }
}
