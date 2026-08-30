export const PROTOCOL_VERSION = '1.0';

export interface NodeIdentity {
  nodeId: string;
  publicKey: string;

  /**
   * Opaque reference to Android Keystore-protected key material.
   * Never contains raw private key bytes. Not decryptable in JS.
   */
  privateKeyRef: string;

  protocolVersion: string;

  createdAt: number;
  updatedAt: number;
}

export enum BatteryClass {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
}

export enum TransportType {
  BLE = 'BLE',
  WIFI_DIRECT = 'WIFI_DIRECT',
  WIFI_AWARE = 'WIFI_AWARE',
}

export interface NodeCapabilities {
  transports: TransportType[];
  gateway: boolean;
  maxBundleSize: number;
  batteryClass: BatteryClass;
}
