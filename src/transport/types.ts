export enum TransportType {
  BLE = "BLE",
  WIFI_DIRECT = "WIFI_DIRECT",
  WIFI_AWARE = "WIFI_AWARE",
}

export enum ConnectionState {
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  FAILED = "FAILED",
}

export interface DiscoveredPeer {
  nodeId?: string; // if known
  peerAddress: string;
  transport: TransportType;
  signalStrength?: number;
  discoveredAt: number;
}

export type Unsubscribe = () => void;
