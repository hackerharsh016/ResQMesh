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
  getAvailableTransports(nodeId: string): TransportType[];
  onPeerDiscovered(handler: (nodeId: string, transports: TransportType[]) => void): Unsubscribe;
  onPeerLost(handler: (nodeId: string) => void): Unsubscribe;
  onMessageReceived(handler: (nodeId: string, message: ProtocolMessage) => void): Unsubscribe;
  registerPeerIdentity(peerAddress: string, nodeId: string, transport: TransportType): void;
}

export class TransportManager implements TransportManagerInterface {
  private transports: Map<TransportType, MeshTransport> = new Map();
  private wireCodec = new WireCodec();
  
  // Maps transport-specific peerAddress to known nodeIds
  private addressToNodeId: Map<string, string> = new Map();
  
  // Maps nodeIds to the set of transport types they are currently available on
  private availableTransports: Map<string, Set<TransportType>> = new Map();

  // Maps nodeIds to sets of peerAddresses (we could have multiple addresses for a single node across transports)
  private nodeToAddresses: Map<string, Map<TransportType, string>> = new Map();

  private peerDiscoveredHandlers: Set<(nodeId: string, transports: TransportType[]) => void> = new Set();
  private peerLostHandlers: Set<(nodeId: string) => void> = new Set();
  private messageReceivedHandlers: Set<(nodeId: string, message: ProtocolMessage) => void> = new Set();

  constructor(private peerTransportRepo: PeerTransportRepository) {}

  registerTransport(transport: MeshTransport): void {
    this.transports.set(transport.type, transport);

    transport.onPeerDiscovered(async (peer) => {
      let nodeId = peer.nodeId || this.addressToNodeId.get(peer.peerAddress);
      if (nodeId) {
        // We know who this is, dedup and aggregate
        this.handlePeerAvailable(nodeId, peer.peerAddress, peer.transport, peer.signalStrength);
      } else {
        // Unknown identity yet. Wait for HELLO message to associate.
        // We don't bubble it up as onPeerDiscovered(nodeId) until we have the nodeId.
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
      try {
        const message = this.wireCodec.decode(payload);
        const nodeId = this.addressToNodeId.get(peerAddress);
        if (nodeId) {
          for (const h of this.messageReceivedHandlers) h(nodeId, message);
        } else {
          // If we receive a HELLO, this is where registerPeerIdentity should be called by the session layer.
          // But if we don't know the nodeId yet, we might emit it with an empty nodeId? No, the interface says `nodeId: string`.
          // The spec: "before a HelloMessage is exchanged and its nodeId learned, TransportManager only knows a transport-local peerAddress... populated by whatever module handles the HELLO exchange".
          // For now, if we don't know the nodeId, we can't route the message using the standard signature `onMessageReceived(nodeId, message)`.
          // Wait, how does the session layer receive the HELLO if we drop it?
          // Ah, we might need a way to pass unknown-identity messages or just assume the Session layer uses `peerAddress`?
          // Actually, `message.senderNodeId` is inside the envelope! We can use that.
          if (message.senderNodeId) {
            this.registerPeerIdentity(peerAddress, message.senderNodeId, transport.type);
            for (const h of this.messageReceivedHandlers) h(message.senderNodeId, message);
          }
        }
      } catch (e) {
        console.error(`Failed to decode incoming message from ${peerAddress}`, e);
        // Catch DecodeError locally, do not crash transport event loop
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
      
      // Persist in DB (don't await to block event loop)
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

    // Pick the transport with the largest max message size among available
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
      // connect() transparently handles already connected states internally in MeshTransport implementation
      await bestTransport.connect(peerAddress);
      await bestTransport.send(peerAddress, payload);
    } catch (e) {
      throw new TransportSendError(`Failed to send over ${bestTransport.type}: ${e}`);
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
}
