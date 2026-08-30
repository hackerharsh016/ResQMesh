
# Core Protocol Specification — v1.0

**Project:** Offline Disaster Communication & Delay-Tolerant Emergency Mesh Network  
**Protocol:** Emergency Mesh Protocol (EMP)  
**Version:** 1.0  
**Status:** Proposed Baseline / Implementation Specification  
**Primary Platform:** Android smartphones  
**Application:** React Native + TypeScript  
**Transports:** BLE, Wi-Fi Direct, Wi-Fi Aware  
**Backend:** Supabase/PostgreSQL

---

# 1. Protocol Purpose

The Emergency Mesh Protocol (EMP) defines how smartphones:

1. identify themselves,
2. discover neighboring nodes,
3. establish trust,
4. exchange capabilities,
5. exchange emergency bundles,
6. store bundles,
7. forward bundles,
8. prevent duplicates,
9. prioritize critical messages,
10. select forwarding nodes,
11. detect gateways,
12. synchronize with the backend,
13. propagate acknowledgements,
14. expire stale messages.

The protocol is intentionally **transport-independent**.

```text
                    EMP
                     │
              Transport Manager
                     │
       ┌─────────────┼─────────────┐
       │             │             │
      BLE       Wi-Fi Direct   Wi-Fi Aware
```

EMP itself does not know whether a packet travelled through Bluetooth or Wi-Fi.

---

# 2. Protocol Design Philosophy

The protocol is based on five principles.

### P1 — Local persistence before forwarding

```text
CREATE
  ↓
VALIDATE
  ↓
STORE
  ↓
FORWARD
```

A message must not be considered safely accepted until it has been persisted locally.

### P2 — Every node is potentially useful

A smartphone can act as:

```text
Origin
Relay
Gateway
Receiver
```

The role is dynamic.

### P3 — No permanent routes

EMP does not assume:

```text
A → B → C
```

will always exist.

Instead:

```text
Contact appears
     ↓
Exchange
     ↓
Contact disappears
     ↓
Carry
     ↓
New contact
     ↓
Forward
```

### P4 — Controlled flooding

EMP is **not unrestricted flooding**.

It uses:

- TTL
- deduplication
- hop limits
- replication budget
- priority
- routing scores

### P5 — Emergency priority

The protocol optimizes for:

> **Probability of emergency delivery rather than maximum network throughput.**

---

# 3. Protocol Terminology

| Term | Meaning |
|---|---|
| Node | Participating smartphone |
| Node ID | Application-level unique identifier |
| Origin | Node creating a bundle |
| Relay | Node forwarding a bundle |
| Gateway | Node capable of reaching backend |
| Bundle | EMP data unit |
| Contact | Temporary communication opportunity |
| Hop | One node-to-node forwarding |
| TTL | Bundle lifetime |
| ACK | Acknowledgement |
| Replication | Creating another valid copy of a bundle |
| Delivery | Backend successfully accepts bundle |
| Incident | Logical grouping of emergency reports |

---

# 4. Protocol Layers

EMP consists of six logical layers.

```text
┌─────────────────────────────┐
│ Emergency Application       │
├─────────────────────────────┤
│ Bundle Protocol             │
├─────────────────────────────┤
│ Routing & Replication       │
├─────────────────────────────┤
│ Peer Session Protocol       │
├─────────────────────────────┤
│ Transport Abstraction       │
├─────────────────────────────┤
│ BLE / Wi-Fi Direct / Aware  │
└─────────────────────────────┘
```

---

# 5. Node Identity

Every installation receives an application-level `nodeId`.

Example:

```text
nodeId =
EMP-01J9X8Q3K7M2...
```

The exact encoding can later be changed, but it must satisfy:

- globally unique with extremely high probability
- non-sensitive
- independent of MAC address
- persistent across normal application restarts
- not directly derived from phone number

---

# 6. Cryptographic Identity

Each node maintains a public/private key pair.

```text
Node
 │
 ├── nodeId
 ├── publicKey
 └── privateKey
```

The private key never leaves the device.

The public key may be exchanged during protocol negotiation.

---

# 7. Node Capability Descriptor

Each node advertises a compact capability record.

```json
{
  "nodeId": "EMP-...",
  "protocolVersion": "1.0",
  "transports": [
    "BLE",
    "WIFI_DIRECT"
  ],
  "gateway": false,
  "maxBundleSize": 8192,
  "batteryClass": "NORMAL"
}
```

The exact wire encoding should eventually use a compact binary representation rather than JSON for production radio exchange.

---

# 8. Node Roles

A node can dynamically possess multiple roles.

```text
NODE
 ├── ORIGIN
 ├── RELAY
 ├── RECEIVER
 └── GATEWAY
```

These are **logical roles**, not mutually exclusive device states.

For example:

```text
Phone A
Origin + Relay

Phone B
Relay

Phone C
Relay + Gateway
```

---

# 9. Protocol Session

Every communication opportunity creates a temporary EMP session.

```text
DISCOVERY
    ↓
HELLO
    ↓
CAPABILITY EXCHANGE
    ↓
SECURITY HANDSHAKE
    ↓
SYNC SUMMARY
    ↓
BUNDLE EXCHANGE
    ↓
ACK EXCHANGE
    ↓
SESSION CLOSE
```

---

# 10. Discovery

Discovery is transport-specific.

For example:

```text
BLE → BLE advertisement
Wi-Fi Direct → peer discovery
Wi-Fi Aware → service discovery
```

But the resulting logical object is always:

```text
PeerDiscoveredEvent
```

Example:

```text
{
  nodeId,
  transport,
  signalStrength,
  discoveredAt
}
```

---

# 11. HELLO Message

Once two nodes establish a transport-level contact:

```text
A → B : HELLO
B → A : HELLO_ACK
```

The HELLO contains:

```text
protocolVersion
nodeId
publicKey
capabilities
timestamp
nonce
```

---

# 12. Protocol Version Negotiation

If:

```text
A = EMP 1.0
B = EMP 1.0
```

communication proceeds.

If incompatible:

```text
A = EMP 1.x
B = unknown
```

the session is terminated safely.

Future versions should support:

```text
major.minor
```

semantics.

---

# 13. Clock Handling

EMP must not assume perfectly synchronized clocks.

Timestamp validation should therefore use:

- local receipt time
- bounded clock skew
- TTL
- monotonic timers for local session measurements

Absolute timestamps are primarily metadata; TTL enforcement must not depend exclusively on synchronized clocks.

---

# 14. Bundle Definition

The **Emergency Bundle** is the fundamental EMP data unit.

Logical structure:

```text
EmergencyBundle
│
├── BundleHeader
│
├── EmergencyPayload
│
├── RoutingMetadata
│
└── SecurityMetadata
```

---

# 15. Bundle Header

```text
BundleHeader
├── bundleId
├── protocolVersion
├── originNodeId
├── incidentId
├── creationTimestamp
└── payloadType
```

---

# 16. Bundle ID

Every bundle receives a globally unique identifier.

```text
bundleId
```

must remain unchanged during forwarding.

Important:

> **A relay must never generate a new bundle ID for a forwarded bundle.**

Otherwise deduplication breaks.

---

# 17. Incident ID

Multiple bundles can belong to one incident.

Example:

```text
bundle A → incident X
bundle B → incident X
bundle C → incident X
```

The `incidentId` is therefore distinct from `bundleId`.

---

# 18. Emergency Payload

Initial payload:

```text
EmergencyPayload
├── emergencyType
├── severity
├── description
├── latitude
├── longitude
├── locationAccuracy
└── senderMetadata
```

---

# 19. Emergency Types

Initial enumeration:

```text
MEDICAL
FIRE
TRAPPED
BUILDING_COLLAPSE
FLOOD
EARTHQUAKE
MISSING_PERSON
SECURITY
GENERAL
```

The protocol must allow future categories.

---

# 20. Severity

Four levels:

```text
CRITICAL
HIGH
MEDIUM
LOW
```

Recommended mapping:

```text
CRITICAL → P0
HIGH     → P1
MEDIUM   → P2
LOW      → P3
```

---

# 21. Routing Metadata

```text
RoutingMetadata
├── priority
├── ttl
├── expiryTimestamp
├── hopCount
├── maxHopCount
├── replicationBudget
└── destinationType
```

---

# 22. Destination Types

EMP initially supports:

```text
DIRECT
BROADCAST
AUTHORITY
INCIDENT
```

### DIRECT

Specific destination.

### BROADCAST

Eligible nearby nodes.

### AUTHORITY

Any suitable gateway leading to authority infrastructure.

### INCIDENT

Nodes participating in a specific incident context.

---

# 23. Bundle Security Metadata

```text
SecurityMetadata
├── keyId
├── signature
└── integrityHash
```

The origin signs the bundle.

Relays do **not** replace the origin signature.

---

# 24. Bundle Signature

Conceptually:

```text
signature =
Sign(
    canonicalBundleHeader +
    canonicalPayload +
    routingMetadata
)
```

A relay modifies only mutable routing fields according to protocol rules.

The design must therefore distinguish:

### Immutable fields

```text
bundleId
originNodeId
creationTimestamp
payload
origin signature
```

### Mutable fields

```text
hopCount
routing observations
replication metadata
forwarding history
```

---

# 25. Canonical Encoding

Before production implementation, EMP must define one canonical serialization format.

For the prototype/core implementation:

```text
TypeScript object
        ↓
canonical serialization
        ↓
hash
        ↓
signature
```

For production radio transfer, use a compact binary format such as CBOR/MessagePack rather than verbose JSON.

The exact choice should be benchmarked before being frozen.

---

# 26. Bundle State Machine

Every local bundle follows:

```text
CREATED
   ↓
PERSISTED
   ↓
QUEUED
   ↓
OFFERED
   ↓
TRANSFERRED
   ↓
RELAYED
```

Possible terminal states:

```text
DELIVERED
EXPIRED
REJECTED
CANCELLED
```

---

# 27. Bundle Creation

When the user presses SOS:

```text
SOS
 ↓
Validate input
 ↓
Acquire location
 ↓
Generate bundleId
 ↓
Generate incidentId
 ↓
Assign priority
 ↓
Assign TTL
 ↓
Sign
 ↓
Persist
 ↓
Queue
```

Only after persistence:

```text
READY_FOR_FORWARDING
```

---

# 28. Bundle Reception

When node B receives a bundle from A:

```text
Receive
 ↓
Decode
 ↓
Validate structure
 ↓
Verify signature
 ↓
Check bundle ID
 ↓
Check TTL
 ↓
Check hop count
 ↓
Persist
 ↓
ACK
 ↓
Queue
```

---

# 29. Duplicate Detection

The receiver checks:

```text
bundleId
```

against its local database.

If present:

```text
DUPLICATE
```

The node does not create another copy.

However, it may still send an ACK so the sender knows that the bundle already exists on the receiving node.

---

# 30. TTL

Each bundle has a lifetime.

Example:

```text
creation = 10:00
TTL = 60 min

expiry = 11:00
```

At expiry:

```text
FORWARD = NO
```

TTL should be configurable by priority.

Example baseline:

```text
P0 → 6 hours
P1 → 12 hours
P2 → 24 hours
P3 → 48 hours
```

These are initial engineering defaults and should be validated through simulation.

---

# 31. Maximum Hop Count

Each bundle contains:

```text
maxHopCount
```

Example:

```text
maxHopCount = 20
```

Every forwarding operation:

```text
hopCount += 1
```

If:

```text
hopCount >= maxHopCount
```

the bundle must not be forwarded further.

---

# 32. Replication Budget

Replication controls network overhead.

Example:

```text
P0 → 8 replicas
P1 → 5 replicas
P2 → 3 replicas
P3 → 1 replica
```

These are initial defaults, not final values.

A replica is a valid copy held by another node.

---

# 33. Why Replication Matters

Consider:

```text
A → B
```

If B's phone leaves the disaster zone:

```text
Message lost from practical network path
```

With controlled replication:

```text
       ┌→ B
A ─────┼→ C
       └→ D
```

delivery probability increases.

But unrestricted flooding:

```text
A → everyone → everyone → everyone
```

creates network congestion.

Therefore:

> **EMP uses bounded epidemic forwarding.**

---

# 34. Contact Summary

Before transferring full bundles, nodes exchange summaries.

Example:

```text
Node A has:
B1
B2
B3
B4
```

Node B has:

```text
B2
B4
```

A can infer that B may need:

```text
B1
B3
```

This minimizes unnecessary transmission.

---

# 35. Bundle Exchange Protocol

```text
A → B : SYNC_REQUEST

B → A : SYNC_RESPONSE
         [B2, B4]

A → B : BUNDLE_OFFER
         [B1, B3]

B → A : BUNDLE_ACCEPT
         [B1, B3]

A → B : BUNDLE_DATA B1
A → B : BUNDLE_DATA B3

B → A : BUNDLE_ACK
         [B1, B3]
```

---

# 36. Bundle Offer

The sender should not blindly transmit everything.

It first asks:

```text
Which bundles are useful to you?
```

The receiver determines which bundle IDs it does not possess and is willing to accept.

---

# 37. Bundle Selection

The receiver should rank requested bundles based on:

```text
priority
+
destination relevance
+
TTL urgency
+
network utility
```

---

# 38. Priority Queue

The local forwarding queue is:

```text
P0
 ↓
P1
 ↓
P2
 ↓
P3
```

Within the same priority:

```text
earliest expiry first
```

can be used.

Thus:

```text
Priority → Expiry
```

rather than simply FIFO.

---

# 39. Routing Decision

When A sees B:

```text
A
│
├── What bundles does B need?
├── Is B a gateway?
├── How stable is B?
├── What is link quality?
├── How much battery does B have?
└── Does B improve delivery probability?
```

Then calculate:

```text
forwardingScore(A → B, bundle)
```

---

# 40. Routing Score

Baseline model:

```text
Score =
    Wp × PriorityScore
  + Wg × GatewayScore
  + Wc × ContactScore
  + Wl × LinkScore
  + Wb × BatteryScore
  - Wh × HopPenalty
  - Wq × QueuePenalty
```

Where:

```text
Wp, Wg, Wc, Wl, Wb, Wh, Wq
```

are configurable weights.

---

# 41. Gateway Score

A node receives a high gateway score when:

```text
Internet available
AND
backend reachable
```

Additional factors:

```text
connection stability
upload success history
signal quality
```

---

# 42. Contact Score

The system maintains local contact history.

Example:

```text
Node B encountered:
8 times
Average contact duration:
45 seconds
```

B becomes more attractive than:

```text
Node C:
1 encounter
3 seconds
```

This enables lightweight opportunistic routing.

---

# 43. Battery Score

Battery should influence routing but **must not become a hard requirement**.

For example:

```text
battery > 50% → high suitability
20–50%        → normal
<20%          → lower relay preference
```

A critical P0 message may override battery preferences.

---

# 44. Hop Penalty

All else equal:

```text
fewer hops
```

should generally be preferred.

But:

> fewer hops must not automatically beat a high-probability gateway.

Example:

```text
B → 1 hop but no gateway
C → 2 hops but strong gateway probability
```

C may be preferable.

---

# 45. Routing Example

```text
             B
            / \
           /   \
Origin A ──     ── Gateway
           \
            \
             C
```

Suppose:

```text
B = strong connection, no gateway
C = moderate connection, gateway candidate
```

The routing engine may select:

```text
A → C
```

because gateway probability dominates.

---

# 46. Forwarding Modes

EMP supports three logical forwarding strategies.

### 46.1 Direct

```text
A → B
```

### 46.2 Controlled Epidemic

```text
A → B
A → C
A → D
```

within replication limits.

### 46.3 Opportunistic DTN

```text
A → B
      ...
      B → C
           ...
           C → Gateway
```

The routing engine can choose between them based on bundle priority and network conditions.

---

# 47. Gateway Election

There is no permanent gateway.

A node becomes a gateway candidate if:

```text
Internet available
+
backend reachable
+
protocol compatible
+
user/device permits gateway operation
```

Gateway status can therefore change dynamically.

---

# 48. Gateway Advertisement

During HELLO:

```text
gateway = true
```

The node can also advertise:

```text
gatewaySessionId
backendReachability
lastSuccessfulSync
```

Do not advertise sensitive network information.

---

# 49. Gateway Synchronization

Gateway workflow:

```text
Mesh
 ↓
Gateway
 ↓
Validate bundle
 ↓
Queue upload
 ↓
Authenticate
 ↓
Supabase
 ↓
Server validation
 ↓
Server ACK
 ↓
Local delivery state
```

---

# 50. Backend Bundle Submission

Conceptual request:

```text
POST /bundles
```

Payload:

```text
bundleId
originNodeId
incidentId
payload
creationTimestamp
signature
routingMetadata
gatewayNodeId
```

The backend must treat `bundleId` as an idempotency key.

---

# 51. Backend Deduplication

If:

```text
bundleId = X
```

already exists:

```text
DO NOT create another emergency report
```

Instead:

```text
return existing delivery state
```

---

# 52. Delivery ACK

The backend returns:

```text
DELIVERY_ACK
```

containing:

```text
bundleId
serverReceiptId
serverTimestamp
status
```

The gateway then stores this acknowledgement.

---

# 53. ACK Propagation

Gateway:

```text
Gateway
 ↓
Nearby nodes
 ↓
Other nodes
 ↓
Origin
```

The ACK itself should be treated as a small control bundle.

---

# 54. ACK Types

EMP defines:

```text
RECEIVED_ACK
FORWARDED_ACK
DELIVERY_ACK
```

### RECEIVED_ACK

Node received and persisted the bundle.

### FORWARDED_ACK

Node successfully transmitted it onward.

### DELIVERY_ACK

Authority/backend accepted it.

The user-facing application should primarily expose:

```text
Stored
Relayed
Authority Received
```

rather than overwhelming users with protocol details.

---

# 55. Broadcast Protocol

Broadcast messages require special treatment.

Example:

```text
AUTHORITY → Gateway → Mesh
```

The bundle contains:

```text
destinationType = BROADCAST
```

Every node:

```text
verify
 ↓
deduplicate
 ↓
display if relevant
 ↓
replicate within limits
```

---

# 56. Broadcast Storm Prevention

EMP prevents uncontrolled broadcast through:

```text
bundleId
TTL
maxHopCount
replicationBudget
seen-cache
priority
```

Optional future enhancement:

```text
geographical scope
```

---

# 57. Geographic Broadcast

Future protocol extension:

```text
targetArea
```

Example:

```text
radius = 2 km
```

A node outside the target region should not continue propagating the message unless it is an important forwarding path.

---

# 58. Direct Message Routing

For:

```text
destinationType = DIRECT
```

the bundle contains:

```text
destinationNodeId
```

Intermediate nodes forward only if routing policy allows.

---

# 59. Security Handshake

Initial handshake:

```text
A → B : HELLO + publicKey + nonceA

B → A : HELLO_ACK + publicKey + nonceB

A → B : AUTH_PROOF

B → A : SESSION_ESTABLISHED
```

The exact cryptographic handshake should use established primitives rather than a custom cryptographic construction.

---

# 60. Replay Protection

Each bundle contains:

```text
bundleId
creationTimestamp
origin signature
```

A node maintains a record of processed bundle IDs.

Therefore:

```text
Old bundle replayed
       ↓
bundleId already known
       ↓
reject / ACK duplicate
```

---

# 61. Malicious Bundle

If signature verification fails:

```text
INVALID_SIGNATURE
```

The bundle must not be forwarded.

The node should record a security event locally.

---

# 62. Flooding Protection

A malicious node could generate thousands of fake bundles.

Mitigation:

```text
per-origin rate limit
+
bundle size limit
+
replication budget
+
priority quotas
+
signature validation
```

Authority-side anomaly detection can identify abusive origins.

---

# 63. Bundle Size

The emergency protocol should optimize for small messages.

Initial target:

```text
≤ 8 KB
```

for normal emergency bundles.

Large payloads should use a separate non-critical transfer mechanism.

---

# 64. Media

Photos/audio/video are **not part of the P0 emergency path**.

If later implemented:

```text
Emergency Bundle
      │
      ├── critical metadata
      │
      └── optional attachment reference
```

This prevents large files from blocking SOS delivery.

---

# 65. Local Storage Policy

Every node maintains:

```text
Bundle Store
```

with:

```text
bundleId
state
priority
expiry
destination
replicationBudget
lastForwarded
hopCount
```

---

# 66. Storage Eviction

If storage becomes constrained:

```text
Expired bundles → delete
        ↓
P3 old bundles
        ↓
P2
        ↓
P1
```

P0 bundles receive maximum protection.

The system must never blindly delete active P0 bundles merely because storage is approaching a limit.

---

# 67. Contact Lifecycle

```text
DISCOVERED
    ↓
CONNECTING
    ↓
CONNECTED
    ↓
NEGOTIATING
    ↓
SYNCING
    ↓
TRANSFERRING
    ↓
IDLE
    ↓
DISCONNECTED
```

---

# 68. Session Timeout

If a node becomes unresponsive:

```text
SESSION_TIMEOUT
```

The bundle remains locally stored.

It can be offered during the next contact.

---

# 69. Partial Transfer

If a connection drops during transfer:

```text
Transfer interrupted
       ↓
Partial data discarded
       ↓
Original bundle remains
       ↓
Retry later
```

For larger future payloads, resumable chunks can be introduced.

---

# 70. Transport Abstraction

EMP sees only:

```text
TransportManager
```

Interface:

```text
discover()
advertise()
connect()
disconnect()
send()
receive()
getPeers()
getMetrics()
getCapabilities()
```

Transport implementations:

```text
BLETransport
WiFiDirectTransport
WiFiAwareTransport
```

---

# 71. BLE Protocol Mapping

BLE should primarily be responsible for:

```text
Discovery
Handshake
Control messages
Small bundle transfer
```

A custom GATT service can expose EMP characteristics.

Conceptually:

```text
EMP BLE Service
│
├── Discovery
├── Control
├── Bundle Metadata
├── Bundle Data
└── ACK
```

The exact GATT UUID scheme should be frozen during implementation.

---

# 72. Wi-Fi Direct Mapping

Wi-Fi Direct can provide a higher-bandwidth transport.

Logical flow:

```text
EMP Discovery
     ↓
Wi-Fi Direct connection
     ↓
EMP Session
     ↓
Bundle exchange
```

EMP remains unchanged.

Only the transport implementation changes.

---

# 73. Wi-Fi Aware Mapping

Similarly:

```text
Wi-Fi Aware discovery
       ↓
EMP peer identification
       ↓
EMP session
       ↓
Bundle exchange
```

If unavailable:

```text
fallback
```

to another supported transport.

---

# 74. Transport Selection Algorithm

Conceptually:

```text
if suitable Wi-Fi Aware:
    use Wi-Fi Aware

else if suitable Wi-Fi Direct:
    use Wi-Fi Direct

else if BLE available:
    use BLE

else:
    wait for contact
```

However, the final algorithm should consider:

```text
payload size
energy cost
link quality
connection establishment time
device capability
emergency priority
```

rather than using a rigid preference list.

---

# 75. Emergency Priority vs Transport

For P0:

```text
Best available transport
```

For P3:

```text
Energy-efficient transport
```

This enables energy-aware emergency networking.

---

# 76. Protocol Message Types

EMP v1.0 defines:

```text
HELLO
HELLO_ACK

SYNC_REQUEST
SYNC_RESPONSE

BUNDLE_OFFER
BUNDLE_ACCEPT
BUNDLE_REJECT

BUNDLE_DATA
BUNDLE_ACK

DELIVERY_ACK

GATEWAY_ANNOUNCE

SESSION_CLOSE
```

---

# 77. Control Message Format

Conceptually:

```json
{
  "type": "SYNC_REQUEST",
  "protocolVersion": "1.0",
  "sessionId": "...",
  "senderNodeId": "...",
  "timestamp": 123456789
}
```

Production implementation should use compact serialization.

---

# 78. Session ID

Every peer session receives:

```text
sessionId
```

It is different from:

```text
nodeId
bundleId
incidentId
```

This prevents confusing communication sessions with data objects.

---

# 79. Protocol Error Codes

Initial codes:

```text
E001 INVALID_VERSION
E002 INVALID_MESSAGE
E003 INVALID_SIGNATURE
E004 DUPLICATE_BUNDLE
E005 EXPIRED_BUNDLE
E006 HOP_LIMIT_REACHED
E007 BUNDLE_TOO_LARGE
E008 STORAGE_FULL
E009 UNSUPPORTED_TRANSPORT
E010 AUTHENTICATION_FAILED
E011 SESSION_TIMEOUT
E012 RATE_LIMITED
```

---

# 80. Error Handling Philosophy

A protocol error must never cause loss of an already valid local emergency bundle.

Example:

```text
Wi-Fi transfer failed
       ↓
bundle remains local
       ↓
retry via another contact
```

---

# 81. Network Partition

Suppose:

```text
Zone A          Zone B

A ─ B           C ─ D
```

No connection exists.

Messages in A remain stored.

When:

```text
B ↔ C
```

becomes available:

```text
A → B → C → D
```

communication resumes automatically.

This is a core DTN property.

---

# 82. Node Mobility

The routing algorithm assumes nodes may move.

Examples:

```text
person walking
vehicle moving
responder moving
```

Therefore routing uses **opportunistic contacts**, not fixed topology.

---

# 83. Contact Graph

Each node maintains lightweight local observations:

```text
Peer B
 ├── encounters: 8
 ├── avg duration: 41 sec
 ├── successful transfers: 92%
 └── last seen: 32 sec ago
```

This information remains local initially.

---

# 84. Routing Intelligence Evolution

### Version 1

Rule-based scoring.

### Version 2

Adaptive weights based on observed delivery success.

### Version 3

Simulation-trained routing model.

### Version 4

Optional ML-assisted routing.

The emergency protocol itself must continue functioning without ML.

---

# 85. Incident Correlation

The backend receives:

```text
Bundle A
Bundle B
Bundle C
```

It can correlate:

```text
distance
+
time
+
emergency type
```

into:

```text
Incident X
```

This is outside the minimum mesh forwarding protocol but is part of the complete system.

---

# 86. Authority Response Bundle

Authority responses use the same protocol.

```text
Authority
 ↓
Backend
 ↓
Gateway
 ↓
Mesh
 ↓
Users
```

Example:

```text
EVACUATION_ALERT
```

can propagate through the same DTN mechanism.

---

# 87. Authority Broadcast Scope

Future bundle fields:

```text
geographicRadius
targetRegion
targetIncident
severity
```

This allows:

```text
"Evacuate this 2 km zone"
```

rather than broadcasting to every node.

---

# 88. Protocol State Machine — Node

```text
┌───────────┐
│   IDLE    │
└─────┬─────┘
      │
      ▼
 DISCOVERING
      │
      ▼
   CONNECTED
      │
      ▼
 NEGOTIATING
      │
      ▼
   SYNCING
      │
      ▼
 TRANSFERRING
      │
      ├─────────────┐
      ▼             ▼
    IDLE       DISCONNECTED
                    │
                    ▼
                 IDLE
```

---

# 89. Protocol State Machine — Bundle

```text
             CREATE
                │
                ▼
            PERSISTED
                │
                ▼
              QUEUED
                │
                ▼
             OFFERED
                │
          ┌─────┴─────┐
          ▼           ▼
       ACCEPT       REJECT
          │
          ▼
      TRANSFERRED
          │
          ▼
       RELAYED
          │
     ┌────┴─────┐
     ▼          ▼
 DELIVERED    EXPIRED
```

---

# 90. End-to-End SOS Example

### Step 1

User A activates SOS.

```text
A creates BUNDLE-001
```

### Step 2

A stores it locally.

```text
BUNDLE-001 → PERSISTED
```

### Step 3

A discovers B.

```text
A ↔ B
```

### Step 4

Handshake.

```text
HELLO
HELLO_ACK
```

### Step 5

Synchronization.

```text
SYNC_REQUEST
SYNC_RESPONSE
```

### Step 6

B doesn't have BUNDLE-001.

```text
BUNDLE_OFFER
```

### Step 7

B accepts.

```text
BUNDLE_ACCEPT
```

### Step 8

A transfers.

```text
BUNDLE_DATA
```

### Step 9

B verifies and stores.

```text
BUNDLE_ACK
```

### Step 10

A records:

```text
RELAYED_TO_B
```

### Step 11

B later meets C.

```text
B → C
```

### Step 12

C is Internet-connected.

```text
C = GATEWAY
```

### Step 13

C synchronizes.

```text
C → Supabase
```

### Step 14

Backend accepts.

```text
DELIVERY_ACK
```

### Step 15

ACK propagates.

```text
C → B → A
```

### Step 16

User A sees:

> **Emergency received by authority.**

---

# 91. Complete Protocol Flow

```text
                   USER
                     │
                    SOS
                     │
                     ▼
             CREATE BUNDLE
                     │
                     ▼
              SIGN + STORE
                     │
                     ▼
               PRIORITY QUEUE
                     │
                     ▼
               PEER DISCOVERY
                     │
                     ▼
               EMP HANDSHAKE
                     │
                     ▼
              SYNC SUMMARIES
                     │
                     ▼
             ROUTING DECISION
                     │
                     ▼
              BUNDLE TRANSFER
                     │
                     ▼
                RELAY NODE
                     │
                  STORE
                     │
                CARRY
                     │
               NEW CONTACT
                     │
                     ▼
              ROUTING DECISION
                     │
                     ▼
                 GATEWAY
                     │
                     ▼
                SUPABASE
                     │
                     ▼
              AUTHORITY SYSTEM
                     │
                     ▼
               DELIVERY ACK
                     │
                     ▼
                  MESH
                     │
                     ▼
                 ORIGIN
```

---

# 92. SQLite Core Tables

The protocol requires at minimum:

### `bundles`

```text
bundle_id
incident_id
origin_node_id
destination_type
priority
created_at
expires_at
hop_count
max_hop_count
replication_budget
state
payload
signature
```

### `peers`

```text
node_id
public_key
last_seen
transport
signal_strength
gateway
battery_class
```

### `bundle_hops`

```text
id
bundle_id
from_node
to_node
transport
timestamp
status
```

### `acknowledgements`

```text
ack_id
bundle_id
ack_type
source_node
timestamp
```

### `sync_queue`

```text
bundle_id
gateway_id
attempts
last_attempt
status
```

---

# 93. Database Indexes

Critical indexes:

```text
bundles(bundle_id)
bundles(priority)
bundles(expires_at)
bundles(state)
bundles(origin_node_id)

peers(node_id)
peers(last_seen)

acknowledgements(bundle_id)
```

The most important lookup is:

```text
bundle_id → existing?
```

because it powers deduplication.

---

# 94. TypeScript Domain Interfaces

The implementation should conceptually expose:

```text
NodeIdentity
EmergencyBundle
EmergencyPayload
RoutingMetadata
SecurityMetadata
Peer
Contact
BundleOffer
BundleAck
GatewaySession
RoutingDecision
```

These should be shared across the mobile application and simulator wherever practical.

---

# 95. Protocol Constants

Centralize:

```text
PROTOCOL_VERSION
MAX_BUNDLE_SIZE
DEFAULT_TTL
MAX_HOP_COUNT
REPLICATION_LIMITS
SESSION_TIMEOUT
BUNDLE_QUEUE_LIMIT
```

Do not scatter these numbers throughout the application.

---

# 96. Protocol Invariants

These are particularly important.

### Invariant 1

```text
bundleId never changes.
```

### Invariant 2

```text
Origin signature remains verifiable.
```

### Invariant 3

```text
A bundle is persisted before it is considered received.
```

### Invariant 4

```text
Expired bundles are never forwarded.
```

### Invariant 5

```text
Hop count never decreases.
```

### Invariant 6

```text
Replication budget never increases.
```

### Invariant 7

```text
Backend submission is idempotent.
```

### Invariant 8

```text
Transport failure never deletes the original bundle.
```

These invariants should become automated tests.

---

# 97. Core Protocol Security Model

```text
              Origin
                 │
          signs bundle
                 │
                 ▼
             Bundle
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
    Relay B              Relay C
       │                   │
   verify sig          verify sig
       │                   │
       ▼                   ▼
    forward             forward
       │                   │
       └─────────┬─────────┘
                 ▼
              Gateway
                 │
           verify again
                 │
                 ▼
              Backend
```

Every trust boundary performs validation.

---

# 98. What We Should NOT Implement

For the first version, avoid:

- custom encryption algorithms
- custom radio protocols
- unlimited broadcast
- unlimited message replication
- large file transfer
- ML-dependent routing
- blockchain
- cryptocurrency
- complex consensus
- centralized real-time routing
- dependence on Internet connectivity

These would increase complexity without strengthening the core DRM03 solution.

---

# 99. Version 1 Core Feature Set

The **MVP protocol** should therefore be:

```text
✓ Device identity
✓ Peer discovery
✓ HELLO
✓ Capability exchange
✓ Secure bundle
✓ SQLite persistence
✓ Bundle deduplication
✓ TTL
✓ Hop count
✓ Priority
✓ Replication budget
✓ Bundle exchange
✓ Store-carry-forward
✓ Basic routing score
✓ Gateway detection
✓ Backend synchronization
✓ Delivery ACK
✓ ACK propagation
```

This is already a technically substantial SIH solution.

---

# 100. Version 2

After the core works:

```text
+ Wi-Fi Direct optimization
+ Wi-Fi Aware
+ adaptive routing
+ geographic broadcast
+ incident clustering
+ authority broadcasts
+ better battery optimization
+ network simulation
+ congestion control
```

---

# 101. Version 3 — Advanced Innovation

Potential differentiators:

```text
Adaptive DTN routing
        +
Predictive contact probability
        +
Incident-aware replication
        +
Dynamic gateway selection
        +
Network congestion prediction
```

The goal becomes:

> **Don't simply forward a message to the nearest phone. Forward it to the phone that maximizes the probability that the emergency will eventually reach the authority.**

That is a substantially stronger technical story than "we made a Bluetooth mesh chat application."

---

# 102. Final Protocol Architecture

```text
┌───────────────────────────────────────────────┐
│             EMERGENCY APPLICATION             │
│        SOS / Alerts / Messages / UI           │
└───────────────────────┬───────────────────────┘
                        │
┌───────────────────────▼───────────────────────┐
│               BUNDLE PROTOCOL                 │
│ Identity / Payload / TTL / Priority / ACK     │
└───────────────────────┬───────────────────────┘
                        │
┌───────────────────────▼───────────────────────┐
│                 DTN ENGINE                    │
│ Store / Carry / Forward / Dedup / Expiry      │
└───────────────────────┬───────────────────────┘
                        │
┌───────────────────────▼───────────────────────┐
│              ROUTING ENGINE                   │
│ Contact / Gateway / Battery / Link / Priority │
└───────────────────────┬───────────────────────┘
                        │
┌───────────────────────▼───────────────────────┐
│             TRANSPORT MANAGER                 │
│       Capability / Selection / Fallback       │
└───────────────┬─────────────┬─────────────────┘
                │             │
              BLE        Wi-Fi Direct
                │             │
                └──────┬──────┘
                       │
                  Wi-Fi Aware
                       │
┌──────────────────────▼────────────────────────┐
│                  ANDROID                      │
│      Native APIs via React Native Modules     │
└───────────────────────────────────────────────┘
```

## The key architectural insight

The strongest version of this project is **not**:

> "A React Native app that sends messages through Bluetooth."

It is:

> **"A transport-agnostic, offline-first Delay-Tolerant Emergency Communication Protocol implemented on commodity smartphones, where every device can dynamically become an origin, relay, or gateway and messages autonomously survive intermittent connectivity through controlled store-carry-forward routing."**

That is the technical narrative I would take to the SIH judges.

**One thing should remain deliberately unfrozen:** the precise routing weights, TTL values, replication budgets, BLE GATT layout, and binary serialization format should be treated as **experimentally tunable parameters**. We should not pretend those values are optimal before running the simulator and real multi-device tests.
