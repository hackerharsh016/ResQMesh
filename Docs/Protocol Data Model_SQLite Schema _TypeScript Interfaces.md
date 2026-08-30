
# Protocol Data Model + SQLite Schema + TypeScript Interfaces

**Project:** Offline Disaster Communication & DTN Emergency Mesh  
**Protocol:** EMP v1.0  
**Database:** SQLite  
**Application:** React Native + TypeScript  
**Persistence model:** Offline-first  
**Status:** Implementation Baseline

---

# 1. Data Architecture

The system has four major data domains:

```text
┌─────────────────────────────────────────────┐
│              IDENTITY DOMAIN                │
│ NodeIdentity / Keys / Local Configuration   │
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────▼──────────────────────┐
│               PEER DOMAIN                   │
│ Peers / Contacts / Transport capabilities   │
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────▼──────────────────────┐
│               BUNDLE DOMAIN                 │
│ Bundles / Payload / Routing / Signatures    │
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────▼──────────────────────┐
│             DELIVERY DOMAIN                 │
│ Transfers / ACKs / Gateway Sync / Attempts  │
└─────────────────────────────────────────────┘
```

---

# 2. Core Entity Relationship

```text
                       ┌──────────────┐
                       │   NODE       │
                       │ node_identity│
                       └──────┬───────┘
                              │
               ┌──────────────┼──────────────┐
               │              │              │
               ▼              ▼              ▼
          ┌─────────┐    ┌──────────┐   ┌──────────┐
          │ PEERS   │    │ CONTACTS │   │ BUNDLES  │
          └────┬────┘    └──────────┘   └────┬─────┘
               │                             │
               │                             │
               │                    ┌────────┼────────┐
               │                    │        │        │
               ▼                    ▼        ▼        ▼
          peer_transfers       bundle_hops ACKs   sync_queue
```

---

# 3. Entity Classification

| Entity | Purpose | Persistence |
|---|---|---|
| NodeIdentity | Local device identity | Permanent |
| LocalConfig | Protocol configuration | Permanent |
| Peer | Known mesh node | Persistent |
| Contact | Encounter history | Persistent |
| Bundle | Emergency message | Persistent |
| BundleHop | Forwarding history | Persistent |
| BundleAck | Delivery acknowledgements | Persistent |
| Transfer | Actual peer transfer | Persistent |
| SyncQueue | Internet gateway upload queue | Persistent |
| SecurityEvent | Invalid/malicious protocol activity | Persistent |
| ProtocolEvent | Debugging/observability | Optional |

---

# 4. UUID / Identifier Strategy

There are several different identifiers and they **must not be confused**.

```text
nodeId
    ↓
identifies smartphone

bundleId
    ↓
identifies emergency bundle

incidentId
    ↓
groups related emergency bundles

sessionId
    ↓
identifies peer communication session

transferId
    ↓
identifies one transfer attempt

ackId
    ↓
identifies acknowledgement
```

Example:

```text
Node A
nodeId = NODE-123

SOS
bundleId = BUNDLE-456
incidentId = INCIDENT-789

Connection
sessionId = SESSION-001

Transfer
transferId = TRANSFER-001
```

---

# 5. Local Node Identity

## `node_identity`

This table contains the identity of the current smartphone.

```sql
CREATE TABLE node_identity (
    node_id TEXT PRIMARY KEY NOT NULL,
    public_key TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,

    protocol_version TEXT NOT NULL DEFAULT '1.0',

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

### Important

The private key must **not** be stored as plaintext.

The actual implementation should preferably use:

```text
Android Keystore
      ↓
Key reference / protected key material
```

rather than treating SQLite as a secure keystore.

---

# 6. Local Configuration

## `local_config`

```sql
CREATE TABLE local_config (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
```

Example:

```text
protocol_version = 1.0
max_bundle_size = 8192
max_hop_count = 20
```

However, protocol-critical constants should ideally be compiled into the protocol layer and only experimentally tunable parameters should be configurable.

---

# 7. Peer Model

A peer is another smartphone encountered by the current node.

## `peers`

```sql
CREATE TABLE peers (
    node_id TEXT PRIMARY KEY NOT NULL,

    public_key TEXT,

    protocol_version TEXT,

    is_gateway INTEGER NOT NULL DEFAULT 0,

    battery_class TEXT,

    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,

    encounter_count INTEGER NOT NULL DEFAULT 0,

    successful_transfers INTEGER NOT NULL DEFAULT 0,
    failed_transfers INTEGER NOT NULL DEFAULT 0,

    average_contact_duration_ms INTEGER DEFAULT 0,

    last_signal_strength INTEGER,

    updated_at INTEGER NOT NULL
);
```

---

# 8. Peer Transport Capability

One peer can support multiple transports.

Therefore don't store:

```text
transport = BLE
```

directly as the only transport field.

Instead:

## `peer_transports`

```sql
CREATE TABLE peer_transports (
    node_id TEXT NOT NULL,

    transport TEXT NOT NULL,

    supported INTEGER NOT NULL DEFAULT 1,

    last_seen_at INTEGER NOT NULL,

    signal_strength INTEGER,

    PRIMARY KEY (node_id, transport),

    FOREIGN KEY (node_id)
        REFERENCES peers(node_id)
        ON DELETE CASCADE
);
```

Possible values:

```text
BLE
WIFI_DIRECT
WIFI_AWARE
```

---

# 9. Contact History

The routing engine needs lightweight historical information.

## `contacts`

```sql
CREATE TABLE contacts (
    contact_id TEXT PRIMARY KEY NOT NULL,

    peer_node_id TEXT NOT NULL,

    transport TEXT NOT NULL,

    started_at INTEGER NOT NULL,
    ended_at INTEGER,

    duration_ms INTEGER,

    signal_strength INTEGER,

    bundles_offered INTEGER DEFAULT 0,
    bundles_transferred INTEGER DEFAULT 0,

    status TEXT NOT NULL,

    FOREIGN KEY (peer_node_id)
        REFERENCES peers(node_id)
        ON DELETE CASCADE
);
```

Example:

```text
contact_id = C001
peer = NODE-B
transport = BLE
duration = 42000 ms
```

---

# 10. Emergency Bundle

This is the most important table.

## `bundles`

```sql
CREATE TABLE bundles (
    bundle_id TEXT PRIMARY KEY NOT NULL,

    incident_id TEXT,

    origin_node_id TEXT NOT NULL,

    destination_type TEXT NOT NULL,

    destination_node_id TEXT,

    payload_type TEXT NOT NULL,

    priority INTEGER NOT NULL,

    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,

    hop_count INTEGER NOT NULL DEFAULT 0,
    max_hop_count INTEGER NOT NULL,

    replication_budget INTEGER NOT NULL,

    state TEXT NOT NULL,

    payload TEXT NOT NULL,

    signature TEXT NOT NULL,

    integrity_hash TEXT NOT NULL,

    created_locally INTEGER NOT NULL DEFAULT 0,

    received_at INTEGER,

    delivered_at INTEGER,

    updated_at INTEGER NOT NULL
);
```

---

# 11. Bundle State

Use an enum-like TypeScript type:

```text
CREATED
PERSISTED
QUEUED
OFFERED
TRANSFERRED
RELAYED
DELIVERED
EXPIRED
REJECTED
CANCELLED
```

Database stores the string.

Example:

```text
state = QUEUED
```

---

# 12. Why `created_locally` Exists

Suppose:

```text
Phone A creates bundle
```

Then:

```text
created_locally = true
```

Phone B receives it:

```text
created_locally = false
```

This allows analytics and routing logic to distinguish:

```text
originated here
```

from:

```text
relayed here
```

---

# 13. Emergency Payload

Do **not** put every payload field directly into the `bundles` table.

Instead store a serialized payload.

Logical structure:

```json
{
  "emergencyType": "MEDICAL",
  "severity": "CRITICAL",
  "description": "Person injured",
  "location": {
    "latitude": 19.0760,
    "longitude": 72.8777,
    "accuracy": 10
  }
}
```

SQLite:

```text
payload TEXT
```

This gives the protocol flexibility to evolve payload structures without constant database migrations.

---

# 14. Bundle Hop History

Every successful forwarding event can optionally be recorded.

## `bundle_hops`

```sql
CREATE TABLE bundle_hops (
    hop_id TEXT PRIMARY KEY NOT NULL,

    bundle_id TEXT NOT NULL,

    from_node_id TEXT NOT NULL,
    to_node_id TEXT NOT NULL,

    transport TEXT NOT NULL,

    hop_number INTEGER NOT NULL,

    transferred_at INTEGER NOT NULL,

    status TEXT NOT NULL,

    FOREIGN KEY (bundle_id)
        REFERENCES bundles(bundle_id)
        ON DELETE CASCADE
);
```

Example:

```text
A → B
hop = 1

B → C
hop = 2

C → Gateway
hop = 3
```

---

# 15. Why Hop History Matters

It gives you extremely useful SIH demo metrics:

```text
SOS generated
     ↓
A → B
     ↓
B → C
     ↓
C → Gateway
     ↓
Authority
```

You can visually show:

> **Delivered in 3 hops**

This is much more compelling than simply displaying "message sent."

---

# 16. Acknowledgement Model

## `bundle_acks`

```sql
CREATE TABLE bundle_acks (
    ack_id TEXT PRIMARY KEY NOT NULL,

    bundle_id TEXT NOT NULL,

    ack_type TEXT NOT NULL,

    source_node_id TEXT NOT NULL,

    target_node_id TEXT,

    created_at INTEGER NOT NULL,

    received_at INTEGER,

    FOREIGN KEY (bundle_id)
        REFERENCES bundles(bundle_id)
        ON DELETE CASCADE
);
```

---

# 17. ACK Types

```text
RECEIVED
FORWARDED
DELIVERED
```

Mapping:

```text
RECEIVED
→ next node stored it

FORWARDED
→ next node transmitted it

DELIVERED
→ backend/authority accepted it
```

---

# 18. Transfer Model

An ACK tells us about the outcome, but the actual transmission attempt should also be tracked.

## `transfers`

```sql
CREATE TABLE transfers (
    transfer_id TEXT PRIMARY KEY NOT NULL,

    session_id TEXT NOT NULL,

    bundle_id TEXT NOT NULL,

    sender_node_id TEXT NOT NULL,
    receiver_node_id TEXT NOT NULL,

    transport TEXT NOT NULL,

    started_at INTEGER NOT NULL,
    completed_at INTEGER,

    bytes_sent INTEGER DEFAULT 0,

    status TEXT NOT NULL,

    error_code TEXT,

    FOREIGN KEY (bundle_id)
        REFERENCES bundles(bundle_id)
        ON DELETE CASCADE
);
```

---

# 19. Transfer Status

```text
PENDING
IN_PROGRESS
COMPLETED
FAILED
CANCELLED
TIMEOUT
```

---

# 20. Gateway Sync Queue

This is critical for store-carry-forward to the Internet.

## `sync_queue`

```sql
CREATE TABLE sync_queue (
    bundle_id TEXT PRIMARY KEY NOT NULL,

    gateway_node_id TEXT,

    attempts INTEGER NOT NULL DEFAULT 0,

    last_attempt_at INTEGER,

    next_attempt_at INTEGER,

    status TEXT NOT NULL,

    server_receipt_id TEXT,

    last_error TEXT,

    updated_at INTEGER NOT NULL,

    FOREIGN KEY (bundle_id)
        REFERENCES bundles(bundle_id)
        ON DELETE CASCADE
);
```

---

# 21. Sync Queue States

```text
WAITING
UPLOADING
RETRY_PENDING
DELIVERED
FAILED
EXPIRED
```

---

# 22. Session Model

## `sessions`

```sql
CREATE TABLE sessions (
    session_id TEXT PRIMARY KEY NOT NULL,

    local_node_id TEXT NOT NULL,
    peer_node_id TEXT NOT NULL,

    transport TEXT NOT NULL,

    started_at INTEGER NOT NULL,
    ended_at INTEGER,

    state TEXT NOT NULL,

    protocol_version TEXT,

    created_at INTEGER NOT NULL
);
```

---

# 23. Session State

```text
DISCOVERED
CONNECTING
CONNECTED
NEGOTIATING
SYNCING
TRANSFERRING
IDLE
DISCONNECTED
TIMEOUT
FAILED
```

---

# 24. Security Events

For protocol debugging and abuse detection:

## `security_events`

```sql
CREATE TABLE security_events (
    event_id TEXT PRIMARY KEY NOT NULL,

    peer_node_id TEXT,

    bundle_id TEXT,

    event_type TEXT NOT NULL,

    details TEXT,

    created_at INTEGER NOT NULL
);
```

Examples:

```text
INVALID_SIGNATURE
REPLAY_DETECTED
INVALID_MESSAGE
RATE_LIMITED
INVALID_VERSION
```

---

# 25. Protocol Event Log

This should be optional because logs can become large.

## `protocol_events`

```sql
CREATE TABLE protocol_events (
    event_id TEXT PRIMARY KEY NOT NULL,

    event_type TEXT NOT NULL,

    node_id TEXT,

    bundle_id TEXT,

    session_id TEXT,

    details TEXT,

    created_at INTEGER NOT NULL
);
```

Useful during development:

```text
DISCOVERY_STARTED
PEER_FOUND
SESSION_STARTED
SYNC_STARTED
BUNDLE_RECEIVED
BUNDLE_FORWARDED
GATEWAY_FOUND
DELIVERY_CONFIRMED
```

---

# 26. Complete SQLite Schema

For the first implementation, the database should therefore contain:

```text
node_identity
local_config

peers
peer_transports
contacts

sessions

bundles
bundle_hops
bundle_acks
transfers

sync_queue

security_events
protocol_events
```

Relationship:

```text
                    node_identity
                         │
                         │
                 ┌───────┴────────┐
                 │                │
               peers          bundles
                 │                │
          ┌──────┴─────┐     ┌────┼────────────┐
          │            │     │    │            │
     transports    contacts  hops ACKs      transfers
                                     
                              sync_queue
```

---

# 27. Recommended SQLite Indexes

These are important for performance.

```sql
CREATE INDEX idx_bundles_state
ON bundles(state);

CREATE INDEX idx_bundles_priority
ON bundles(priority);

CREATE INDEX idx_bundles_expiry
ON bundles(expires_at);

CREATE INDEX idx_bundles_origin
ON bundles(origin_node_id);

CREATE INDEX idx_bundles_incident
ON bundles(incident_id);

CREATE INDEX idx_hops_bundle
ON bundle_hops(bundle_id);

CREATE INDEX idx_acks_bundle
ON bundle_acks(bundle_id);

CREATE INDEX idx_transfers_bundle
ON transfers(bundle_id);

CREATE INDEX idx_transfers_session
ON transfers(session_id);

CREATE INDEX idx_contacts_peer
ON contacts(peer_node_id);

CREATE INDEX idx_contacts_last_seen
ON peers(last_seen_at);

CREATE INDEX idx_sync_status
ON sync_queue(status);
```

---

# 28. TypeScript Type System

Now we translate the protocol into TypeScript.

The most important rule:

> **TypeScript interfaces should represent protocol concepts, not database rows.**

Database models and domain models should remain separable.

---

# 29. Protocol Enums

```ts
export enum TransportType {
  BLE = "BLE",
  WIFI_DIRECT = "WIFI_DIRECT",
  WIFI_AWARE = "WIFI_AWARE",
}

export enum Priority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
}

export enum DestinationType {
  DIRECT = "DIRECT",
  BROADCAST = "BROADCAST",
  AUTHORITY = "AUTHORITY",
  INCIDENT = "INCIDENT",
}

export enum EmergencyType {
  MEDICAL = "MEDICAL",
  FIRE = "FIRE",
  TRAPPED = "TRAPPED",
  BUILDING_COLLAPSE = "BUILDING_COLLAPSE",
  FLOOD = "FLOOD",
  EARTHQUAKE = "EARTHQUAKE",
  MISSING_PERSON = "MISSING_PERSON",
  SECURITY = "SECURITY",
  GENERAL = "GENERAL",
}

export enum Severity {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}
```

---

# 30. Bundle State

```ts
export enum BundleState {
  CREATED = "CREATED",
  PERSISTED = "PERSISTED",
  QUEUED = "QUEUED",
  OFFERED = "OFFERED",
  TRANSFERRED = "TRANSFERRED",
  RELAYED = "RELAYED",
  DELIVERED = "DELIVERED",
  EXPIRED = "EXPIRED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
}
```

---

# 31. Node Identity

```ts
export interface NodeIdentity {
  nodeId: string;
  publicKey: string;

  /**
   * Reference to the protected private key.
   * Do not expose raw private key material to JS.
   */
  privateKeyRef: string;

  protocolVersion: string;

  createdAt: number;
  updatedAt: number;
}
```

---

# 32. Node Capabilities

```ts
export interface NodeCapabilities {
  transports: TransportType[];

  gateway: boolean;

  maxBundleSize: number;

  batteryClass: BatteryClass;
}

export enum BatteryClass {
  LOW = "LOW",
  NORMAL = "NORMAL",
  HIGH = "HIGH",
}
```

---

# 33. Peer

```ts
export interface Peer {
  nodeId: string;

  publicKey?: string;

  protocolVersion?: string;

  isGateway: boolean;

  batteryClass?: BatteryClass;

  firstSeenAt: number;
  lastSeenAt: number;

  encounterCount: number;

  successfulTransfers: number;
  failedTransfers: number;

  averageContactDurationMs: number;

  lastSignalStrength?: number;

  transports: PeerTransport[];
}
```

---

# 34. Peer Transport

```ts
export interface PeerTransport {
  transport: TransportType;

  supported: boolean;

  lastSeenAt: number;

  signalStrength?: number;
}
```

---

# 35. Location

```ts
export interface GeoLocation {
  latitude: number;
  longitude: number;

  accuracyMeters?: number;

  altitudeMeters?: number;

  timestamp: number;
}
```

---

# 36. Emergency Payload

```ts
export interface EmergencyPayload {
  emergencyType: EmergencyType;

  severity: Severity;

  description: string;

  location?: GeoLocation;

  senderMetadata?: SenderMetadata;
}
```

---

# 37. Sender Metadata

Keep this deliberately minimal.

```ts
export interface SenderMetadata {
  displayName?: string;

  contactPreference?: "NONE" | "CALL" | "SMS";
}
```

Do not put unnecessary personal information into mesh packets.

---

# 38. Routing Metadata

```ts
export interface RoutingMetadata {
  priority: Priority;

  ttlSeconds: number;

  expiresAt: number;

  hopCount: number;

  maxHopCount: number;

  replicationBudget: number;
}
```

---

# 39. Security Metadata

```ts
export interface SecurityMetadata {
  keyId?: string;

  signature: string;

  integrityHash: string;
}
```

---

# 40. Emergency Bundle

This is the central domain interface.

```ts
export interface EmergencyBundle {
  bundleId: string;

  incidentId?: string;

  originNodeId: string;

  destinationType: DestinationType;

  destinationNodeId?: string;

  payloadType: string;

  payload: EmergencyPayload;

  routing: RoutingMetadata;

  security: SecurityMetadata;

  createdAt: number;

  receivedAt?: number;

  deliveredAt?: number;

  state: BundleState;

  createdLocally: boolean;
}
```

---

# 41. Bundle Summary

Never exchange the complete bundle when only metadata is required.

```ts
export interface BundleSummary {
  bundleId: string;

  priority: Priority;

  expiresAt: number;

  hopCount: number;

  destinationType: DestinationType;

  payloadType: string;
}
```

This is used by:

```text
SYNC_REQUEST
SYNC_RESPONSE
BUNDLE_OFFER
```

---

# 42. Bundle Offer

```ts
export interface BundleOffer {
  sessionId: string;

  senderNodeId: string;

  receiverNodeId: string;

  bundles: BundleSummary[];
}
```

---

# 43. Bundle Accept

```ts
export interface BundleAccept {
  sessionId: string;

  receiverNodeId: string;

  acceptedBundleIds: string[];
}
```

---

# 44. Bundle Reject

```ts
export interface BundleReject {
  sessionId: string;

  receiverNodeId: string;

  rejected: Array<{
    bundleId: string;
    reason: string;
  }>;
}
```

---

# 45. Bundle ACK

```ts
export enum AckType {
  RECEIVED = "RECEIVED",
  FORWARDED = "FORWARDED",
  DELIVERED = "DELIVERED",
}

export interface BundleAck {
  ackId: string;

  bundleId: string;

  ackType: AckType;

  sourceNodeId: string;

  targetNodeId?: string;

  createdAt: number;

  receivedAt?: number;
}
```

---

# 46. HELLO

```ts
export interface HelloMessage {
  type: "HELLO";

  protocolVersion: string;

  nodeId: string;

  publicKey: string;

  capabilities: NodeCapabilities;

  timestamp: number;

  nonce: string;
}
```

---

# 47. HELLO ACK

```ts
export interface HelloAckMessage {
  type: "HELLO_ACK";

  protocolVersion: string;

  nodeId: string;

  publicKey: string;

  capabilities: NodeCapabilities;

  timestamp: number;

  nonce: string;

  responseToNonce: string;
}
```

---

# 48. Sync Request

```ts
export interface SyncRequestMessage {
  type: "SYNC_REQUEST";

  sessionId: string;

  senderNodeId: string;

  timestamp: number;

  bundleIds: string[];
}
```

For optimization, this can eventually be replaced with a Bloom filter or compact digest.

---

# 49. Sync Response

```ts
export interface SyncResponseMessage {
  type: "SYNC_RESPONSE";

  sessionId: string;

  senderNodeId: string;

  requestedBundleIds: string[];

  timestamp: number;
}
```

---

# 50. Gateway Announcement

```ts
export interface GatewayAnnouncement {
  type: "GATEWAY_ANNOUNCE";

  nodeId: string;

  gatewaySessionId: string;

  backendReachable: boolean;

  lastSuccessfulSync?: number;

  timestamp: number;
}
```

---

# 51. Session

```ts
export interface ProtocolSession {
  sessionId: string;

  localNodeId: string;

  peerNodeId: string;

  transport: TransportType;

  startedAt: number;

  endedAt?: number;

  state: SessionState;

  protocolVersion?: string;
}

export enum SessionState {
  DISCOVERED = "DISCOVERED",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  NEGOTIATING = "NEGOTIATING",
  SYNCING = "SYNCING",
  TRANSFERRING = "TRANSFERRING",
  IDLE = "IDLE",
  DISCONNECTED = "DISCONNECTED",
  TIMEOUT = "TIMEOUT",
  FAILED = "FAILED",
}
```

---

# 52. Contact

```ts
export interface Contact {
  contactId: string;

  peerNodeId: string;

  transport: TransportType;

  startedAt: number;

  endedAt?: number;

  durationMs?: number;

  signalStrength?: number;

  bundlesOffered: number;

  bundlesTransferred: number;

  status: ContactStatus;
}

export enum ContactStatus {
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}
```

---

# 53. Transfer

```ts
export interface BundleTransfer {
  transferId: string;

  sessionId: string;

  bundleId: string;

  senderNodeId: string;

  receiverNodeId: string;

  transport: TransportType;

  startedAt: number;

  completedAt?: number;

  bytesSent: number;

  status: TransferStatus;

  errorCode?: string;
}

export enum TransferStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  TIMEOUT = "TIMEOUT",
}
```

---

# 54. Bundle Hop

```ts
export interface BundleHop {
  hopId: string;

  bundleId: string;

  fromNodeId: string;

  toNodeId: string;

  transport: TransportType;

  hopNumber: number;

  transferredAt: number;

  status: "SUCCESS" | "FAILED";
}
```

---

# 55. Gateway Sync

```ts
export interface GatewaySyncItem {
  bundleId: string;

  gatewayNodeId?: string;

  attempts: number;

  lastAttemptAt?: number;

  nextAttemptAt?: number;

  status: SyncStatus;

  serverReceiptId?: string;

  lastError?: string;
}

export enum SyncStatus {
  WAITING = "WAITING",
  UPLOADING = "UPLOADING",
  RETRY_PENDING = "RETRY_PENDING",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
}
```

---

# 56. Protocol Message Union

This is particularly useful.

Instead of:

```ts
message: any
```

use a discriminated union.

```ts
export type ProtocolMessage =
  | HelloMessage
  | HelloAckMessage
  | SyncRequestMessage
  | SyncResponseMessage
  | BundleOffer
  | BundleAccept
  | BundleReject
  | BundleAck
  | GatewayAnnouncement;
```

Then TypeScript can automatically determine message type.

---

# 57. Message Envelope

Every wire message should have an envelope.

```ts
export interface ProtocolEnvelope<T = unknown> {
  protocol: "EMP";

  version: string;

  messageId: string;

  type: ProtocolMessageType;

  sessionId: string;

  senderNodeId: string;

  timestamp: number;

  payload: T;
}
```

---

# 58. Protocol Message Type

```ts
export enum ProtocolMessageType {
  HELLO = "HELLO",
  HELLO_ACK = "HELLO_ACK",

  SYNC_REQUEST = "SYNC_REQUEST",
  SYNC_RESPONSE = "SYNC_RESPONSE",

  BUNDLE_OFFER = "BUNDLE_OFFER",
  BUNDLE_ACCEPT = "BUNDLE_ACCEPT",
  BUNDLE_REJECT = "BUNDLE_REJECT",

  BUNDLE_DATA = "BUNDLE_DATA",
  BUNDLE_ACK = "BUNDLE_ACK",

  DELIVERY_ACK = "DELIVERY_ACK",

  GATEWAY_ANNOUNCE = "GATEWAY_ANNOUNCE",

  SESSION_CLOSE = "SESSION_CLOSE",
}
```

---

# 59. Routing Decision

The routing engine should return a structured result.

```ts
export interface RoutingDecision {
  bundleId: string;

  candidateNodeId: string;

  score: number;

  reasons: RoutingReason[];

  shouldForward: boolean;
}
```

---

# 60. Routing Reason

```ts
export interface RoutingReason {
  factor:
    | "PRIORITY"
    | "GATEWAY"
    | "CONTACT"
    | "LINK"
    | "BATTERY"
    | "HOP"
    | "QUEUE";

  contribution: number;

  explanation?: string;
}
```

This is useful because your demo can eventually show:

```text
Why was this node selected?

Gateway probability   +0.42
Contact stability     +0.21
Link quality          +0.13
Battery               +0.08
Hop penalty           -0.04

Final score: 0.80
```

That gives the routing algorithm explainability.

---

# 61. Routing Engine Interface

```ts
export interface RoutingEngine {
  calculateScore(
    bundle: EmergencyBundle,
    peer: Peer,
    context: RoutingContext
  ): number;

  decide(
    bundle: EmergencyBundle,
    candidates: Peer[],
    context: RoutingContext
  ): RoutingDecision[];

  selectNextHop(
    bundle: EmergencyBundle,
    candidates: Peer[],
    context: RoutingContext
  ): Peer | null;
}
```

---

# 62. Routing Context

```ts
export interface RoutingContext {
  now: number;

  localNodeId: string;

  availableTransports: TransportType[];

  networkCongestion: number;

  localBatteryLevel?: number;

  gatewayAvailable: boolean;
}
```

---

# 63. Bundle Repository

The protocol engine should not directly execute SQL.

Use a repository abstraction.

```ts
export interface BundleRepository {
  create(bundle: EmergencyBundle): Promise<void>;

  getById(bundleId: string): Promise<EmergencyBundle | null>;

  getPending(limit?: number): Promise<EmergencyBundle[]>;

  getSummaries(): Promise<BundleSummary[]>;

  markState(
    bundleId: string,
    state: BundleState
  ): Promise<void>;

  incrementHop(
    bundleId: string
  ): Promise<void>;

  decrementReplicationBudget(
    bundleId: string
  ): Promise<void>;

  deleteExpired(): Promise<number>;
}
```

---

# 64. Peer Repository

```ts
export interface PeerRepository {
  upsert(peer: Peer): Promise<void>;

  getById(nodeId: string): Promise<Peer | null>;

  getRecentPeers(limit?: number): Promise<Peer[]>;

  recordEncounter(
    peerNodeId: string,
    durationMs: number
  ): Promise<void>;

  recordTransferSuccess(
    peerNodeId: string
  ): Promise<void>;

  recordTransferFailure(
    peerNodeId: string
  ): Promise<void>;
}
```

---

# 65. Transport Interface

This is one of the most important abstractions in the architecture.

```ts
export interface MeshTransport {
  readonly type: TransportType;

  initialize(): Promise<void>;

  startDiscovery(): Promise<void>;

  stopDiscovery(): Promise<void>;

  advertise(
    nodeInfo: NodeCapabilities
  ): Promise<void>;

  connect(
    peer: Peer
  ): Promise<TransportConnection>;

  disconnect(
    connectionId: string
  ): Promise<void>;
}
```

---

# 66. Transport Connection

```ts
export interface TransportConnection {
  connectionId: string;

  peerNodeId: string;

  transport: TransportType;

  send(
    data: Uint8Array
  ): Promise<void>;

  receive(
    callback: (data: Uint8Array) => void
  ): void;

  close(): Promise<void>;

  getMetrics(): LinkMetrics;
}
```

---

# 67. Link Metrics

```ts
export interface LinkMetrics {
  signalStrength?: number;

  estimatedBandwidth?: number;

  latencyMs?: number;

  connectionDurationMs: number;
}
```

---

# 68. Transport Manager

```ts
export interface TransportManager {
  initialize(): Promise<void>;

  getAvailableTransports(): TransportType[];

  discoverPeers(): Promise<Peer[]>;

  connectToPeer(
    peer: Peer
  ): Promise<TransportConnection>;

  selectTransport(
    peer: Peer,
    bundle: EmergencyBundle
  ): TransportType | null;
}
```

---

# 69. DTN Engine

This becomes the central protocol coordinator.

```ts
export interface DtnEngine {
  initialize(): Promise<void>;

  createBundle(
    payload: EmergencyPayload,
    options: CreateBundleOptions
  ): Promise<EmergencyBundle>;

  receiveBundle(
    bundle: EmergencyBundle,
    fromPeer: Peer
  ): Promise<void>;

  processContact(
    peer: Peer,
    connection: TransportConnection
  ): Promise<void>;

  expireBundles(): Promise<void>;

  processGatewaySync(): Promise<void>;
}
```

---

# 70. Bundle Creation Options

```ts
export interface CreateBundleOptions {
  incidentId?: string;

  destinationType: DestinationType;

  destinationNodeId?: string;

  priority: Priority;

  ttlSeconds: number;

  maxHopCount: number;

  replicationBudget: number;
}
```

---

# 71. Security Service

```ts
export interface SecurityService {
  generateIdentity(): Promise<NodeIdentity>;

  signBundle(
    bundle: EmergencyBundle
  ): Promise<string>;

  verifyBundle(
    bundle: EmergencyBundle
  ): Promise<boolean>;

  generateNonce(): string;

  verifyPeer(
    publicKey: string
  ): Promise<boolean>;
}
```

---

# 72. Gateway Service

```ts
export interface GatewayService {
  isInternetAvailable(): Promise<boolean>;

  isBackendReachable(): Promise<boolean>;

  uploadBundle(
    bundle: EmergencyBundle
  ): Promise<DeliveryResult>;

  processPendingBundles(): Promise<void>;
}
```

---

# 73. Delivery Result

```ts
export interface DeliveryResult {
  success: boolean;

  bundleId: string;

  serverReceiptId?: string;

  serverTimestamp?: number;

  error?: string;
}
```

---

# 74. Protocol Manager

At the highest level:

```ts
export interface ProtocolManager {
  initialize(): Promise<void>;

  start(): Promise<void>;

  stop(): Promise<void>;

  createEmergency(
    payload: EmergencyPayload,
    options: CreateBundleOptions
  ): Promise<EmergencyBundle>;

  getNetworkStatus(): Promise<NetworkStatus>;

  getBundleStatus(
    bundleId: string
  ): Promise<BundleStatus>;
}
```

---

# 75. Network Status

```ts
export interface NetworkStatus {
  online: boolean;

  meshActive: boolean;

  connectedPeers: number;

  availableGateways: number;

  pendingBundles: number;

  lastSuccessfulDelivery?: number;
}
```

---

# 76. Bundle Status for UI

Don't expose the entire protocol object to React components.

Create a UI-safe status model:

```ts
export interface BundleStatus {
  bundleId: string;

  state: BundleState;

  hopCount: number;

  createdAt: number;

  expiresAt: number;

  relayCount: number;

  authorityConfirmed: boolean;
}
```

The UI can therefore display:

```text
SOS ACTIVE

✓ Saved locally
✓ Relayed through 3 devices
✓ Internet gateway found
✓ Authority received
```

---

# 77. Recommended Project Structure

This data model maps cleanly into:

```text
src/
│
├── protocol/
│   │
│   ├── types/
│   │   ├── bundle.ts
│   │   ├── node.ts
│   │   ├── peer.ts
│   │   ├── session.ts
│   │   ├── routing.ts
│   │   └── messages.ts
│   │
│   ├── dtn/
│   │   ├── DtnEngine.ts
│   │   ├── BundleManager.ts
│   │   ├── Deduplication.ts
│   │   └── ExpiryManager.ts
│   │
│   ├── routing/
│   │   ├── RoutingEngine.ts
│   │   ├── RoutingScore.ts
│   │   └── GatewaySelector.ts
│   │
│   ├── security/
│   │   ├── SecurityService.ts
│   │   ├── SignatureService.ts
│   │   └── IdentityManager.ts
│   │
│   └── transport/
│       ├── TransportManager.ts
│       ├── MeshTransport.ts
│       ├── BLETransport.ts
│       ├── WiFiDirectTransport.ts
│       └── WiFiAwareTransport.ts
│
├── storage/
│   ├── database.ts
│   ├── migrations/
│   ├── repositories/
│   │   ├── BundleRepository.ts
│   │   ├── PeerRepository.ts
│   │   ├── SessionRepository.ts
│   │   └── TransferRepository.ts
│   └── sqlite/
│
├── services/
│   ├── GatewayService.ts
│   ├── LocationService.ts
│   └── NetworkService.ts
│
└── app/
    ├── screens/
    ├── components/
    └── hooks/
```

---

# 78. Critical Separation of Responsibilities

Do **not** allow this:

```text
React Screen
   ↓
BLE API
   ↓
SQLite
   ↓
Routing
```

Instead:

```text
                 React UI
                    │
                    ▼
             Protocol Manager
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
      DTN        Routing     Gateway
      Engine      Engine      Service
        │           │
        └─────┬─────┘
              ▼
       Repository Layer
              │
              ▼
           SQLite
```

And:

```text
DTN Engine
    │
    ▼
Transport Manager
    │
 ┌──┼──────────────┐
 ▼  ▼              ▼
BLE WiFi Direct WiFi Aware
```

This separation is extremely important for your project.

---

# 79. Data Flow: SOS

```text
User
 │
 ▼
createEmergency()
 │
 ▼
EmergencyPayload
 │
 ▼
BundleFactory
 │
 ├── bundleId
 ├── incidentId
 ├── routing
 └── signature
 │
 ▼
BundleRepository.create()
 │
 ▼
SQLite
 │
 ▼
DTN Queue
 │
 ▼
Routing Engine
 │
 ▼
Transport Manager
```

---

# 80. Data Flow: Receiving

```text
BLE/WiFi
    │
    ▼
TransportConnection
    │
    ▼
Protocol Decoder
    │
    ▼
Protocol Message
    │
    ▼
Signature Verification
    │
    ▼
Deduplication
    │
    ▼
BundleRepository
    │
    ▼
SQLite
    │
    ▼
ACK
    │
    ▼
Routing Queue
```

---

# 81. Data Flow: Gateway

```text
Bundle Queue
      │
      ▼
Gateway Detector
      │
      ▼
Internet Available?
      │
   ┌──┴──┐
   │     │
  NO    YES
   │     │
 Store   ▼
        Upload
          │
          ▼
       Backend
          │
          ▼
     DELIVERY_ACK
          │
          ▼
      SQLite
          │
          ▼
      ACK Relay
```

---

# 82. Data Integrity Rules

These should be enforced at repository/protocol level.

### Rule 1

```text
bundleId MUST be unique.
```

### Rule 2

```text
originNodeId MUST NOT change.
```

### Rule 3

```text
hopCount MUST only increase.
```

### Rule 4

```text
replicationBudget MUST only decrease.
```

### Rule 5

```text
expiresAt MUST NOT be extended by relays.
```

### Rule 6

```text
payload MUST remain immutable after signing.
```

### Rule 7

```text
invalid signature → reject.
```

### Rule 8

```text
duplicate bundle → don't create second copy.
```

### Rule 9

```text
failed transfer → retain original bundle.
```

### Rule 10

```text
backend upload MUST be idempotent.
```

---

# 83. Most Important Design Decision

I strongly recommend that you **do not allow Gemini to independently design these interfaces while implementing individual features**.

Give Gemini this protocol model as a **frozen contract**.

The implementation hierarchy should be:

```text
                    CORE PROTOCOL SPEC
                           │
                           ▼
                   DATA MODEL CONTRACT
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
        TypeScript                  SQLite Schema
        Interfaces                     │
             │                         │
             └──────────┬──────────────┘
                        ▼
                    DTN ENGINE
                        │
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
       Routing       Security       Transport
          │             │              │
          └─────────────┼──────────────┘
                        ▼
                 React Native App
```

This prevents the classic AI-development problem where one generated module expects:

```ts
bundle.id
```

another expects:

```ts
bundle.bundleId
```

and another stores:

```text
message_id
```

for the same concept.

---

# 84. Recommended Implementation Order

Do **not** implement all of this simultaneously.

### Phase 1 — Foundation

```text
Node Identity
SQLite
Bundle model
Bundle repository
Protocol types
```

### Phase 2 — DTN Core

```text
Bundle creation
Persistence
Deduplication
TTL
Hop count
Replication budget
Priority queue
```

### Phase 3 — Transport

```text
BLE
   ↓
Transport abstraction
   ↓
Real peer-to-peer transfer
```

### Phase 4 — Routing

```text
Peer discovery
Contact history
Routing score
Next-hop selection
```

### Phase 5 — Gateway

```text
Internet detection
Gateway election
Sync queue
Backend upload
Delivery ACK
```

### Phase 6 — Advanced Transport

```text
Wi-Fi Direct
Wi-Fi Aware
transport selection
```

### Phase 7 — Optimization

```text
Congestion control
adaptive replication
battery optimization
routing experiments
```

---

# 85. One Important Correction to the Previous Protocol Specification

I would make one refinement before you freeze the implementation:

**Don't make the application layer directly dependent on raw `EmergencyBundle` serialization.**

Use:

```text
Domain Object
     ↓
Protocol Serializer
     ↓
Binary Wire Object
     ↓
Transport
```

rather than:

```text
EmergencyBundle
     ↓
JSON.stringify()
     ↓
BLE
```

The architecture should eventually be:

```text
EmergencyBundle
       │
       ▼
CanonicalSerializer
       │
       ▼
Uint8Array
       │
       ▼
Transport
```

This allows you to start development with JSON during debugging and later switch to **CBOR or another compact binary representation** without rewriting the DTN engine.

---

## Final contract

At this point, your core stack becomes:

```text
React Native
     │
     │ TypeScript
     ▼
┌──────────────────────────┐
│      Application Layer   │
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│     Protocol Manager     │
└────────────┬─────────────┘
             │
     ┌───────┼────────┐
     ▼       ▼        ▼
    DTN   Routing  Security
     │       │        │
     └───────┼────────┘
             ▼
     Repository Layer
             │
       ┌─────┴─────┐
       ▼           ▼
    SQLite      Serializer
                   │
                   ▼
            Transport Manager
             │      │      │
             ▼      ▼      ▼
            BLE    WiFi   Aware
```



