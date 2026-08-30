import { NodeCapabilities } from './node';
import { EmergencyBundle, BundleSummary } from './bundle';
import { AckType } from './ack';

export enum MessageType {
  HELLO = "HELLO",
  HELLO_ACK = "HELLO_ACK",
  SYNC_REQUEST = "SYNC_REQUEST",
  SYNC_RESPONSE = "SYNC_RESPONSE",
  BUNDLE_OFFER = "BUNDLE_OFFER",
  BUNDLE_ACCEPT = "BUNDLE_ACCEPT",
  BUNDLE_REJECT = "BUNDLE_REJECT",
  BUNDLE_DATA = "BUNDLE_DATA",
  BUNDLE_ACK = "BUNDLE_ACK",
  SESSION_CLOSE = "SESSION_CLOSE",
}

export interface ProtocolEnvelope<T> {
  version: string;
  type: MessageType;
  senderNodeId: string;
  timestamp: number;
  payload: T;
}

export interface HelloMessage {
  nodeId: string;
  publicKey: string;
  protocolVersion: string;
  capabilities: NodeCapabilities;
}

export interface HelloAckMessage {
  nodeId: string;
  publicKey: string;
  protocolVersion: string;
  accepted: boolean;
}

export interface SyncRequestMessage {
  bundleSummaries: BundleSummary[];
}

export interface SyncResponseMessage {
  wantedBundleIds: string[];
}

export interface BundleOfferMessage {
  bundleId: string;
  summary: BundleSummary;
}

export interface BundleAcceptMessage {
  bundleId: string;
}

export interface BundleRejectMessage {
  bundleId: string;
  reason: string;
}

export interface BundleDataMessage {
  bundle: EmergencyBundle;
}

export interface BundleAckMessage {
  bundleId: string;
  ackType: AckType;
}

export interface SessionCloseMessage {
  reason?: string;
}

export type ProtocolMessage =
  | ProtocolEnvelope<HelloMessage>
  | ProtocolEnvelope<HelloAckMessage>
  | ProtocolEnvelope<SyncRequestMessage>
  | ProtocolEnvelope<SyncResponseMessage>
  | ProtocolEnvelope<BundleOfferMessage>
  | ProtocolEnvelope<BundleAcceptMessage>
  | ProtocolEnvelope<BundleRejectMessage>
  | ProtocolEnvelope<BundleDataMessage>
  | ProtocolEnvelope<BundleAckMessage>
  | ProtocolEnvelope<SessionCloseMessage>;
