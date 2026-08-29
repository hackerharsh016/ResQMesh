export enum Priority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3
}

export enum BundleState {
  CREATED = 'CREATED',
  PERSISTED = 'PERSISTED',
  QUEUED = 'QUEUED',
  OFFERED = 'OFFERED',
  TRANSFERRED = 'TRANSFERRED',
  RELAYED = 'RELAYED',
  DELIVERED = 'DELIVERED',
  EXPIRED = 'EXPIRED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED'
}

export enum DestinationType {
  DIRECT = 'DIRECT',
  BROADCAST = 'BROADCAST',
  AUTHORITY = 'AUTHORITY',
  INCIDENT = 'INCIDENT'
}

export enum EmergencyType {
  MEDICAL = 'MEDICAL',
  FIRE = 'FIRE',
  TRAPPED = 'TRAPPED',
  BUILDING_COLLAPSE = 'BUILDING_COLLAPSE',
  FLOOD = 'FLOOD',
  EARTHQUAKE = 'EARTHQUAKE',
  MISSING_PERSON = 'MISSING_PERSON',
  SECURITY = 'SECURITY',
  GENERAL = 'GENERAL'
}

export enum Severity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface SenderMetadata {
  [key: string]: any;
}

export interface EmergencyPayload {
  emergencyType: EmergencyType | string;
  severity: Severity | string;
  description: string;
  location?: GeoLocation;
  senderMetadata?: SenderMetadata;
}

export interface RoutingMetadata {
  priority: Priority;
  ttlSeconds: number;
  hopCount: number;
  maxHopCount: number;
  replicationBudget: number;
  destinationType: DestinationType;
  destinationNodeId?: string;
}

export interface SecurityMetadata {
  keyId?: string;
  signature: string;
  integrityHash: string;
}

export interface EmergencyBundle {
  bundleId: string;
  incidentId?: string;
  protocolVersion: string;
  originNodeId: string;
  creationTimestamp: number;
  payloadType: string;
  payload: EmergencyPayload;
  routing: RoutingMetadata;
  security: SecurityMetadata;
  state: BundleState;
  createdLocally: boolean;
  receivedAt?: number;
  deliveredAt?: number;
}

export interface BundleSummary {
  bundleId: string;
  incidentId?: string;
  priority: Priority;
  state: BundleState;
  creationTimestamp: number;
  expiresAt: number;
}
