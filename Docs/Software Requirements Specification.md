
# Software Requirements Specification
## Offline Disaster Communication & Delay-Tolerant Emergency Mesh Network

**Document Version:** 1.0  
**Status:** Baseline / Architecture Frozen  
**Target Platform:** Android  
**Primary Application:** React Native  
**Problem Statement:** DRM03 - Offline Disaster Communication Application

---

# 1. Executive Summary

The system is an **offline-first emergency communication platform** that enables smartphones to exchange essential emergency information when conventional Internet or cellular connectivity is unavailable or unreliable.

The core innovation is not merely "Bluetooth messaging."

The system combines:

- smartphone-to-smartphone communication
- delay-tolerant networking
- store-carry-forward delivery
- multi-hop relay
- dynamic gateway selection
- message prioritization
- controlled replication
- emergency acknowledgements
- local persistent storage
- incident aggregation
- authority synchronization

into a single emergency communication architecture.

The supplied DRM03 problem statement specifically calls for a mobile application capable of exchanging essential emergency messages under unavailable or unreliable Internet connectivity. `PS Data for Internal Hackathon(1).pdf`

The system therefore treats the **physical transport and the emergency communication protocol as separate layers**.

---

# 2. Product Vision

### Vision

> **Enable emergency information to survive network failure by turning ordinary smartphones into cooperative, delay-tolerant communication nodes.**

Instead of requiring:

```text
Victim → Cellular Tower → Internet → Server
```

the system supports:

```text
Victim
  ↓
Nearby Smartphone
  ↓
Another Smartphone
  ↓
Another Smartphone
  ↓
Internet-capable Gateway
  ↓
Authority
```

The message can remain stored on intermediate devices until a suitable communication opportunity appears.

---

# 3. Problem Definition

During disasters, conventional communication infrastructure can become:

- unavailable
- overloaded
- intermittent
- geographically inaccessible
- unreliable

A conventional application that depends entirely on:

```text
Internet → API → Server
```

fails precisely when emergency communication is most important.

DRM03 explicitly targets communication when Internet connectivity is unavailable or unreliable. `PS Data for Internal Hackathon(1).pdf`

The proposed system addresses this by moving the communication dependency from **central connectivity** to a **distributed network of participating smartphones**.

---

# 4. Goals

## 4.1 Primary Goals

The system shall:

1. Allow users to create emergency messages without Internet.
2. Store emergency messages locally.
3. Discover nearby compatible devices.
4. Exchange messages between nearby nodes.
5. Forward messages through multiple nodes.
6. Continue carrying messages during network partitions.
7. Prioritize critical emergency messages.
8. Prevent uncontrolled message duplication.
9. Detect Internet-capable nodes.
10. Use such nodes as gateways.
11. Synchronize emergency information with the backend.
12. propagate delivery acknowledgements through the mesh.
13. Aggregate related emergency reports into incidents.
14. provide authorities with actionable emergency information.

---

# 5. Non-Goals

The first production architecture will **not** attempt to:

- replace cellular networks
- replace satellite communication
- provide unrestricted general-purpose Internet
- guarantee communication under every Android hardware configuration
- transmit arbitrary large files as the primary use case
- operate invisibly without user consent
- bypass Android security restrictions
- create a proprietary radio protocol

The system is an **emergency data communication system**, not an Internet replacement.

---

# 6. Core Design Principles

## 6.1 Offline First

Critical functionality must work without Internet.

## 6.2 Local First

Messages are persisted locally before transmission.

## 6.3 Transport Agnostic

The DTN layer must not depend directly on BLE or Wi-Fi.

## 6.4 Store-Carry-Forward

A node may store a message until another forwarding opportunity appears.

## 6.5 Priority Driven

Critical emergency messages receive preferential forwarding.

## 6.6 Controlled Replication

Messages may be replicated, but replication must be bounded.

## 6.7 Capability Aware

A device must advertise its capabilities rather than being assumed to support every transport.

## 6.8 Graceful Degradation

If Wi-Fi Aware is unavailable:

```text
Wi-Fi Aware
    ↓
Wi-Fi Direct
    ↓
BLE
```

The actual selection policy will be determined by the Transport Manager.

---

# 7. System Actors

## 7.1 Emergency User

A person who creates or receives an emergency report.

## 7.2 Relay Node

A smartphone that receives and forwards emergency bundles.

## 7.3 Gateway Node

A node capable of reaching the backend through an available Internet connection.

## 7.4 Authority

An authorized emergency-response operator.

## 7.5 Backend

The cloud system responsible for synchronization, persistence, incident management and authority services.

## 7.6 Mesh Network

The temporary network formed by participating smartphones.

---

# 8. Terminology

### Node

Any participating smartphone.

### Origin Node

The device that initially creates a bundle.

### Relay

A node that forwards a bundle toward another node.

### Gateway

A node that can synchronize bundles with the backend.

### Bundle

The fundamental DTN message object.

### Contact

A communication opportunity between two nodes.

### Hop

One successful node-to-node forwarding step.

### TTL

Time-to-live after which a bundle expires.

### ACK

Acknowledgement indicating successful receipt or delivery.

### Incident

A logical aggregation of multiple related emergency reports.

---

# 9. High-Level System Architecture

```text
                         ┌──────────────────────┐
                         │ AUTHORITY PLATFORM   │
                         │ Next.js + TypeScript │
                         └──────────┬───────────┘
                                    │
                              Supabase
                                    │
                              ┌─────▼─────┐
                              │ PostgreSQL│
                              └─────┬─────┘
                                    │
                               INTERNET
                                    │
                     ┌──────────────┴──────────────┐
                     │                             │
                  Gateway                       Gateway
                     ▲                             ▲
                     │                             │
              ┌──────┴─────────────────────────────┐
              │          OFFLINE MESH              │
              │                                    │
              │ A ─── B ─── C ─── D ─── E         │
              │ │           │       │              │
              │ F ──────────G───────H              │
              │                                    │
              └────────────────────────────────────┘
                     ▲
                     │
              React Native App
                     │
          ┌──────────┴───────────┐
          │                      │
       Domain Core          Transport Layer
          │                      │
    ┌─────┴─────┐        ┌──────┼──────┐
    │           │        │      │      │
   DTN       Routing     BLE   Wi-Fi   Wi-Fi
   Engine     Engine          Direct   Aware
```

---

# 10. Mobile Application Architecture

The mobile application follows a layered architecture.

```text
┌─────────────────────────────────────┐
│ Presentation Layer                  │
│ React Native UI                     │
├─────────────────────────────────────┤
│ Application Layer                  │
│ Emergency / Mesh / Gateway / Sync  │
├─────────────────────────────────────┤
│ Domain Layer                        │
│ DTN / Routing / Protocol / Security│
├─────────────────────────────────────┤
│ Data Layer                          │
│ SQLite / Local Persistence         │
├─────────────────────────────────────┤
│ Infrastructure Layer               │
│ Transport / Supabase / Native APIs │
├─────────────────────────────────────┤
│ Android Platform                   │
└─────────────────────────────────────┘
```

---

# 11. Final Technology Stack

| Layer | Technology |
|---|---|
| Mobile framework | **React Native** |
| Primary language | **TypeScript** |
| React Native architecture | **New Architecture / Turbo Native Modules** |
| UI | React Native |
| Navigation | React Navigation |
| Animation | React Native Reanimated |
| State | Zustand |
| Validation | Zod |
| Local database | SQLite |
| DTN engine | TypeScript |
| Routing engine | TypeScript |
| Emergency protocol | Custom application-layer protocol |
| Mesh transport abstraction | TypeScript |
| BLE transport | Android BLE APIs |
| Wi-Fi P2P transport | Android `WifiP2pManager` |
| Wi-Fi Aware transport | Android `WifiAwareManager` |
| Native bridge | React Native Turbo Native Modules |
| Native implementation | Minimal Android-native adapter |
| Background operation | Android Foreground Service where permitted |
| Connectivity | Android Connectivity APIs |
| Location | Android Location APIs |
| Cryptography | Android/platform cryptography + standard primitives |
| Backend | Supabase |
| Database | PostgreSQL |
| Realtime | Supabase Realtime |
| Authority dashboard | Next.js + TypeScript |
| Map | MapLibre |
| Simulation | Python |
| Unit testing | Jest |
| Mobile testing | React Native Testing Library + Android device testing |
| Version control | GitHub |
| AI development | Gemini |

React Native's current architecture supports typed TypeScript specifications that are converted through Codegen into native interfaces, making Turbo Native Modules the appropriate boundary for the unavoidable Android APIs. ([React Native](https://reactnative.dev/docs/turbo-native-modules-introduction?utm_source=chatgpt.com))

---

# 12. Why BLE + Wi-Fi Direct + Wi-Fi Aware

The system should not depend on a single transport.

### BLE

Advantages:

- low power
- broad smartphone support
- useful for discovery/control
- useful when higher-bandwidth transports aren't available

Android exposes BLE communication through its Bluetooth/GATT APIs. ([Android Developers](https://developer.android.com/reference/android/bluetooth/BluetoothGatt?utm_source=chatgpt.com))

### Wi-Fi Direct

Advantages:

- higher throughput
- direct peer-to-peer connection
- longer practical range than Bluetooth in many scenarios

Android provides peer discovery and connection through `WifiP2pManager`. ([Android Developers](https://developer.android.com/develop/connectivity/wifi/wifip2p?utm_source=chatgpt.com))

### Wi-Fi Aware

Advantages:

- infrastructure-independent
- peer discovery
- peer-to-peer data paths

Android provides this through `WifiAwareManager`. Device support must be checked at runtime. ([Android Developers](https://developer.android.com/reference/android/net/wifi/aware/package-summary?utm_source=chatgpt.com))

---

# 13. Transport Abstraction

The application will expose a common interface:

```text
MeshTransport
│
├── discoverPeers()
├── advertise()
├── connect(peer)
├── disconnect(peer)
├── send(bundle)
├── receive()
├── getPeers()
├── getCapabilities()
└── getConnectionMetrics()
```

Implementations:

```text
BLETransport
WiFiDirectTransport
WiFiAwareTransport
```

The DTN engine never directly invokes:

```text
BluetoothGatt
WifiP2pManager
WifiAwareManager
```

Instead:

```text
DTN Engine
    ↓
Transport Manager
    ↓
Selected Transport
```

---

# 14. Native Integration Boundary

The architecture is deliberately:

```text
TypeScript
    │
    ▼
Turbo Native Module
    │
    ▼
Android API
```

rather than:

```text
React Native
    ↓
Kotlin business logic
    ↓
Kotlin application
```

React Native explicitly supports native modules for platform capabilities not exposed directly by React Native. ([React Native](https://reactnative.dev/docs/native-platform?utm_source=chatgpt.com))

The native layer will therefore contain only:

- Bluetooth adapter
- Wi-Fi Direct adapter
- Wi-Fi Aware adapter
- connectivity adapter
- background service adapter
- location adapter
- selected platform-security operations

Business logic remains TypeScript.

---

# 15. Emergency Bundle

The emergency bundle is the fundamental protocol object.

```text
EmergencyBundle
│
├── Header
│   ├── bundleId
│   ├── protocolVersion
│   ├── originId
│   ├── incidentId
│   └── creationTime
│
├── Emergency
│   ├── type
│   ├── severity
│   ├── description
│   ├── latitude
│   ├── longitude
│   └── locationAccuracy
│
├── Routing
│   ├── priority
│   ├── ttl
│   ├── hopCount
│   ├── replicationBudget
│   └── destination
│
└── Security
    ├── keyId
    ├── signature
    └── integrityHash
```

---

# 16. Emergency Types

Initial supported categories:

```text
MEDICAL
FIRE
TRAPPED
BUILDING_COLLAPSE
FLOOD
EARTHQUAKE
MISSING_PERSON
SECURITY
GENERAL_EMERGENCY
```

The system must allow future categories without protocol redesign.

---

# 17. Priority Model

Priority levels:

```text
P0 - CRITICAL
P1 - HIGH
P2 - MEDIUM
P3 - LOW
```

Example:

```text
P0
Life-threatening emergency

P1
Serious emergency

P2
Important information

P3
General information
```

The routing queue must always prefer higher-priority bundles when resources are constrained.

---

# 18. DTN Engine

The DTN Engine performs:

- bundle creation
- validation
- storage
- queueing
- TTL processing
- deduplication
- replication
- forwarding
- delivery tracking
- acknowledgement handling

Architecture:

```text
Incoming Bundle
      ↓
Parse
      ↓
Validate
      ↓
Security Check
      ↓
Duplicate Check
      ↓
TTL Check
      ↓
Store
      ↓
Priority Queue
      ↓
Routing Engine
      ↓
Transport Manager
```

---

# 19. Store-Carry-Forward

The fundamental forwarding mechanism is:

```text
Receive
   ↓
Store
   ↓
Carry
   ↓
Discover Contact
   ↓
Evaluate Candidate
   ↓
Forward
```

A node does not need a continuous end-to-end connection.

This is the defining property of the proposed delay-tolerant architecture.

---

# 20. Deduplication

Every bundle must contain a globally unique `bundleId`.

The receiving node must check:

```text
bundleId exists?
```

If yes:

```text
DROP DUPLICATE
```

If no:

```text
ACCEPT
STORE
PROCESS
```

This prevents uncontrolled propagation.

---

# 21. TTL

Every bundle has an expiry timestamp.

```text
creationTime + TTL = expiryTime
```

Expired bundles must not be forwarded.

They may be retained temporarily for diagnostics depending on storage policy.

---

# 22. Hop Count

Every forwarding operation increments:

```text
hopCount += 1
```

A configurable maximum hop count may prevent pathological circulation.

---

# 23. Replication Budget

Each bundle can contain:

```text
replicationBudget
```

Example:

```text
P0 → high replication budget
P1 → moderate
P2 → limited
P3 → minimal
```

This prevents critical messages from overwhelming the network while still improving delivery probability.

---

# 24. Routing Engine

The Routing Engine calculates a forwarding score.

Conceptually:

```text
Score =
    Priority
  + GatewayProbability
  + LinkQuality
  + ContactHistory
  + NodeAvailability
  + BatterySuitability
  - QueueCongestion
  - HopPenalty
```

The exact weights must be determined through simulation and testing rather than arbitrarily fixed in the SRS.

---

# 25. Gateway Selection

A gateway candidate is a node that has:

```text
Internet = available
AND
Backend = reachable
AND
Node = willing/capable
```

The gateway then:

```text
receives bundle
      ↓
validates
      ↓
uploads
      ↓
receives backend ACK
      ↓
marks delivered
      ↓
propagates ACK
```

Android's Wi-Fi P2P APIs can maintain a peer-to-peer connection while a supported device also maintains an Internet uplink, which is particularly useful for the gateway concept. ([Android Developers](https://developer.android.com/about/versions/12/behavior-changes-12?utm_source=chatgpt.com))

---

# 26. Gateway Failure

If a gateway disappears:

```text
Gateway lost
     ↓
Bundle remains locally stored
     ↓
Routing engine resumes
     ↓
Search for another gateway
```

No emergency bundle should be deleted solely because its current gateway disappeared.

---

# 27. ACK Architecture

Two acknowledgement concepts should be distinguished.

### Mesh ACK

Indicates:

> The next relay successfully received the bundle.

### Delivery ACK

Indicates:

> The authority/backend successfully received the bundle.

Flow:

```text
A → B
   ACK

B → C
   ACK

C → Gateway
   ACK

Gateway → Server
   DELIVERY ACK

Server → Gateway
   ACK

Gateway → Mesh
   DELIVERY ACK
```

---

# 28. User Workflow

```text
Open application
      ↓
Network status displayed
      ↓
Press SOS
      ↓
Select emergency type
      ↓
Confirm severity
      ↓
Capture location
      ↓
Create bundle
      ↓
Local persistence
      ↓
Mesh forwarding
      ↓
Gateway
      ↓
Authority
      ↓
Acknowledgement
```

---

# 29. SOS UX

The SOS interface should minimize interaction.

Recommended:

```text
┌───────────────────────┐
│                       │
│       EMERGENCY       │
│                       │
│         SOS           │
│                       │
│   Hold for 2 seconds  │
│                       │
└───────────────────────┘
```

The hold-to-confirm interaction reduces accidental activation.

---

# 30. Emergency Status

The user must see:

```text
SOS CREATED
     ↓
STORED LOCALLY
     ↓
RELAYED
     ↓
GATEWAY FOUND
     ↓
AUTHORITY RECEIVED
     ↓
ACKNOWLEDGED
```

If no gateway exists:

```text
STORED - WAITING FOR CONNECTIVITY
```

---

# 31. Broadcast

Broadcast should not mean uncontrolled infinite flooding.

Instead:

```text
Origin
 ↓
Eligible nearby nodes
 ↓
Controlled replication
 ↓
TTL
 ↓
Deduplication
```

The protocol must support broadcast classes such as:

- emergency alert
- evacuation warning
- authority message
- public safety information

---

# 32. Direct Messaging

Direct communication is supported as:

```text
Origin → Target
```

if a suitable direct contact exists.

If direct delivery isn't available, the system may optionally fall back to DTN forwarding when the message policy permits.

---

# 33. Local Messaging

Messages remain available in local storage.

The user should be able to view:

- sent
- received
- pending
- forwarded
- acknowledged
- expired

---

# 34. Incident Aggregation

Multiple emergency bundles can represent the same physical incident.

Example:

```text
SOS A
SOS B
SOS C
SOS D
```

becomes:

```text
INCIDENT #1042
Building Collapse
4 reports
3 critical
```

Initial clustering factors:

```text
geographic proximity
+
temporal proximity
+
emergency category
```

Later enhancements:

```text
semantic similarity
+
ML classification
```

---

# 35. Authority Dashboard

The authority platform shall provide:

### Dashboard

- active incidents
- severity counts
- unresolved emergencies
- gateway status
- delivery statistics

### Incident Map

Display:

```text
Victim
Incident
Relay
Gateway
Authority
```

### Incident Detail

```text
Incident ID
Category
Severity
Location
Report count
First report
Latest report
Confidence
Status
```

---

# 36. Incident Lifecycle

```text
DETECTED
   ↓
AGGREGATING
   ↓
VERIFIED
   ↓
DISPATCHED
   ↓
RESPONDING
   ↓
RESOLVED
```

---

# 37. Authority Acknowledgement

Authority can send:

```text
ACKNOWLEDGED
HELP DISPATCHED
EVACUATE
STAY IN PLACE
AREA CLEARED
```

These messages become emergency bundles and can propagate through the mesh.

---

# 38. Local Database

Minimum logical entities:

```text
devices
bundles
bundle_recipients
bundle_hops
peers
contacts
incidents
acknowledgements
routing_metrics
gateway_sessions
security_keys
sync_queue
```

---

# 39. Local Database Requirements

The database must support:

- transactions
- indexed bundle IDs
- TTL queries
- priority queue queries
- delivery status
- crash recovery
- offline operation

Critical messages must be persisted before transmission is considered successful.

---

# 40. Backend Database

Supabase/PostgreSQL logical entities:

```text
users
devices
incidents
emergency_reports
bundles
deliveries
acknowledgements
gateways
authority_actions
audit_logs
```

The backend is **not the source of truth for the offline mesh**.

The local node is authoritative for its locally stored undelivered bundles until successful synchronization.

---

# 41. Synchronization

When Internet becomes available:

```text
Local Sync Queue
      ↓
Authentication
      ↓
Bundle Validation
      ↓
Upload
      ↓
Server ACK
      ↓
Mark Delivered
      ↓
Retain local audit record
```

Synchronization must be idempotent.

If a bundle is uploaded twice:

```text
same bundleId
     ↓
server deduplication
```

---

# 42. Device Identity

Every device requires a stable application identity.

Conceptually:

```text
Device Identity
     │
     ├── nodeId
     ├── publicKey
     └── key metadata
```

The system should avoid using raw hardware identifiers as the application's identity.

---

# 43. Security Requirements

Every bundle must provide:

### Integrity

Detect modification.

### Authenticity

Identify the origin.

### Replay protection

Prevent old emergency bundles from being injected repeatedly.

### Deduplication

Prevent repeated copies from causing uncontrolled processing.

### Access control

Authority operations must require authentication and authorization.

---

# 44. Threat Model

The system must consider:

```text
Malicious node
     │
     ├── fake SOS
     ├── altered bundle
     ├── replayed bundle
     ├── flooding
     ├── impersonation
     └── ACK forgery
```

Security architecture should therefore include:

```text
Digital signatures
+
identity
+
TTL
+
nonce/bundle ID
+
rate limits
+
replication limits
```

---

# 45. Privacy

The system handles potentially sensitive:

- location
- emergency status
- identity
- incident information

Therefore:

1. Collect minimum necessary data.
2. Avoid exposing precise location unnecessarily.
3. Encrypt sensitive payloads where appropriate.
4. Restrict authority access.
5. Define retention policies.
6. Provide user-visible privacy controls.

---

# 46. Network Discovery

Nodes should advertise a compact capability descriptor.

Example:

```text
nodeId
protocolVersion
supportedTransports
gatewayAvailable
batteryClass
softwareVersion
```

Avoid transmitting unnecessary personal information during discovery.

---

# 47. Capability Negotiation

Two devices first determine:

```text
Protocol compatible?
       ↓
Transport compatible?
       ↓
Security compatible?
       ↓
Connection allowed?
```

Only then should bundle exchange occur.

---

# 48. Transport Selection

The Transport Manager evaluates:

```text
Available transport
        ↓
Capability
        ↓
Connection quality
        ↓
Power cost
        ↓
Throughput
        ↓
Emergency priority
```

Then selects the best available channel.

---

# 49. Android Permission Requirements

The implementation must account for current Android permissions.

For Android 12+, Bluetooth scanning, advertising and connection use the runtime permissions:

```text
BLUETOOTH_SCAN
BLUETOOTH_ADVERTISE
BLUETOOTH_CONNECT
```

depending on the operation. ([Android Developers](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions?authuser=683989221&utm_source=chatgpt.com))

Wi-Fi operations may require `NEARBY_WIFI_DEVICES`, and location requirements vary depending on API/usage. ([Android Developers](https://developer.android.com/develop/connectivity/wifi/wifi-permissions?utm_source=chatgpt.com))

Therefore the application must have a **Permission Manager**, rather than requesting all permissions blindly at startup.

---

# 50. Background Operation

This is a critical requirement.

The mesh cannot be designed assuming the React UI is permanently visible.

Android foreground services have specific restrictions, permissions and service-type requirements on modern Android versions. ([Android Developers](https://developer.android.com/develop/background-work/services/fgs/launch?utm_source=chatgpt.com))

Therefore:

```text
React Native UI
      │
      ▼
Mesh Control
      │
      ▼
Native Background Adapter
      │
      ▼
Android Foreground Service
      │
      ▼
Transport Manager
```

The application must comply with Android's background execution policies rather than attempting to bypass them.

---

# 51. Background Service Responsibilities

Only critical persistent operations should run here:

- mesh discovery
- active transport sessions
- bundle receiving
- bundle queue processing
- gateway synchronization
- acknowledgement processing

The service should not contain business logic duplicated from the TypeScript domain layer.

---

# 52. Network State Machine

The node can have states:

```text
OFFLINE
   ↓
MESH_ONLY
   ↓
MESH_CONNECTED
   ↓
INTERNET_AVAILABLE
   ↓
GATEWAY
```

Transitions are dynamic.

Example:

```text
Internet lost

GATEWAY
   ↓
MESH_ONLY
```

The node must continue processing locally.

---

# 53. Node State

Each node should maintain:

```text
ONLINE
OFFLINE
DISCOVERING
CONNECTED
RELAYING
GATEWAY
LOW_POWER
RESTRICTED
```

---

# 54. Battery Strategy

Emergency networking must not continuously consume maximum radio power.

The system should dynamically adjust:

- discovery frequency
- scan duration
- connection duration
- replication
- payload size
- synchronization frequency

Critical emergency mode may increase networking activity.

---

# 55. Data Constraints

Emergency messages should be:

- compact
- structured
- text-first
- bandwidth-aware

Large media should not be part of the initial critical path.

For example:

```text
P0 SOS
```

must take precedence over:

```text
large image
```

---

# 56. Performance Requirements

Initial engineering targets:

| Metric | Target |
|---|---:|
| SOS local persistence | < 1 sec |
| Bundle validation | < 500 ms |
| Duplicate detection | < 100 ms |
| Routing decision | < 500 ms |
| UI emergency creation | < 2 sec |
| Local database transaction | < 200 ms |
| Mesh forwarding overhead | Minimal |
| Critical message priority | Immediate queue promotion |

These are **engineering targets**, not guarantees. They must be validated through device testing.

---

# 57. Reliability Requirements

The system should tolerate:

- intermittent connectivity
- node disappearance
- gateway failure
- application restart
- network partition
- duplicate delivery
- temporary radio failure

A node restart must not cause undelivered bundles to disappear.

---

# 58. Scalability

The architecture should support:

```text
10 nodes
     ↓
100 nodes
     ↓
1,000 nodes
     ↓
large incident zones
```

without requiring a centralized routing server.

The routing decision should primarily occur locally.

---

# 59. Failure Scenarios

### Scenario 1

```text
No Internet
No nearby node
```

Result:

```text
SOS stored locally.
```

### Scenario 2

```text
A → B
```

Result:

```text
B receives and stores bundle.
```

### Scenario 3

```text
A → B → C
```

Result:

```text
C receives bundle through B.
```

### Scenario 4

```text
A → B → C → Gateway
```

Result:

```text
Authority receives emergency.
```

### Scenario 5

Gateway disappears:

```text
Bundle retained.
```

### Scenario 6

Duplicate bundle:

```text
Rejected by bundle ID.
```

---

# 60. Core Functional Requirements

## FR-001 - Device Registration

The system shall create a unique application-level device identity.

## FR-002 - Emergency Creation

The system shall allow a user to create an emergency report without Internet.

## FR-003 - Local Persistence

The system shall persist the emergency bundle locally before forwarding.

## FR-004 - Peer Discovery

The system shall discover compatible nearby nodes through supported transports.

## FR-005 - Bundle Exchange

The system shall exchange emergency bundles with compatible nodes.

## FR-006 - Multi-Hop Forwarding

The system shall forward bundles across multiple nodes.

## FR-007 - Store-Carry-Forward

The system shall retain undelivered bundles until a forwarding opportunity becomes available.

## FR-008 - Priority

The system shall prioritize critical bundles.

## FR-009 - Deduplication

The system shall reject already processed bundle IDs.

## FR-010 - TTL

The system shall prevent forwarding expired bundles.

## FR-011 - Gateway Detection

The system shall identify nodes with backend connectivity.

## FR-012 - Synchronization

Gateway nodes shall synchronize eligible bundles with the backend.

## FR-013 - ACK

The system shall process delivery acknowledgements.

## FR-014 - Incident Aggregation

The backend shall aggregate related emergency reports.

## FR-015 - Authority Dashboard

The system shall present active incidents to authorized authorities.

---

# 61. Advanced Functional Requirements

## FR-016 - Controlled Replication

The system shall control the number of bundle replicas.

## FR-017 - Adaptive Routing

The system shall calculate forwarding scores based on network conditions.

## FR-018 - Transport Fallback

The system shall fall back between supported transports where possible.

## FR-019 - Authority Broadcast

Authorities shall be able to issue emergency broadcasts.

## FR-020 - Emergency ACK Propagation

Authority acknowledgements shall propagate through the mesh.

## FR-021 - Incident Confidence

The system shall calculate an incident confidence score.

## FR-022 - Network Analytics

The authority platform shall display mesh delivery metrics.

---

# 62. Non-Functional Requirements

### NFR-001 Availability

Critical offline functions shall remain available without Internet.

### NFR-002 Reliability

Local persistence shall protect undelivered emergency bundles against normal application restart.

### NFR-003 Security

Emergency bundles shall provide integrity and origin authentication.

### NFR-004 Privacy

Sensitive user information shall be minimized and protected.

### NFR-005 Performance

Critical operations must meet defined performance targets under supported test conditions.

### NFR-006 Maintainability

The application shall use modular feature/domain boundaries.

### NFR-007 Testability

DTN and routing algorithms shall be testable independently from physical radio transports.

### NFR-008 Extensibility

Additional transports shall be addable without modifying the DTN engine.

---

# 63. Recommended Project Structure

```text
emergency-mesh/
│
├── src/
│   ├── app/
│   ├── features/
│   │   ├── emergency/
│   │   ├── mesh/
│   │   ├── incidents/
│   │   ├── messages/
│   │   ├── gateway/
│   │   ├── identity/
│   │   └── settings/
│   │
│   ├── core/
│   │   ├── dtn/
│   │   ├── routing/
│   │   ├── protocol/
│   │   ├── security/
│   │   ├── storage/
│   │   ├── sync/
│   │   └── events/
│   │
│   ├── infrastructure/
│   │   ├── transport/
│   │   ├── native/
│   │   ├── database/
│   │   └── supabase/
│   │
│   ├── store/
│   └── shared/
│
├── android/
│   └── native-modules/
│
├── authority/
│   └── nextjs-dashboard/
│
├── simulator/
│   └── python/
│
├── tests/
│
└── docs/
```

---

# 64. Core Development Sequence

This is important: **do not build every feature simultaneously.**

## Phase 1 - Protocol Core

```text
Device Identity
      ↓
Emergency Bundle
      ↓
Bundle Validation
      ↓
Local SQLite
      ↓
TTL
      ↓
Deduplication
```

## Phase 2 - DTN

```text
Queue
 ↓
Priority
 ↓
Replication
 ↓
Store-Carry-Forward
 ↓
Routing
```

## Phase 3 - Real Transport

```text
Transport Interface
       ↓
BLE
       ↓
A → B
       ↓
A → B → C
```

## Phase 4 - Gateway

```text
Connectivity Detection
       ↓
Gateway Election
       ↓
Supabase Sync
       ↓
ACK
       ↓
ACK Propagation
```

## Phase 5 - Additional Transports

```text
Wi-Fi Direct
       ↓
Wi-Fi Aware
       ↓
Adaptive Transport Selection
```

## Phase 6 - Incident Intelligence

```text
Report
 ↓
Classification
 ↓
Clustering
 ↓
Incident
 ↓
Authority
```

## Phase 7 - Production Hardening

```text
Security
Battery
Background operation
Failure recovery
Device compatibility
Performance
Observability
```

---

# 65. Testing Architecture

The system must be tested at multiple levels.

### Unit

```text
Bundle
TTL
Priority
Routing
Replication
Deduplication
```

### Integration

```text
DTN ↔ SQLite
DTN ↔ Transport
Gateway ↔ Supabase
```

### Physical device

```text
Phone A ↔ Phone B
Phone A ↔ Phone B ↔ Phone C
```

### Failure

```text
Internet OFF
Bluetooth OFF
Wi-Fi OFF
Gateway disappears
Phone restarts
Node leaves network
```

### Load

```text
10 nodes
50 nodes
100 simulated nodes
```

---

# 66. Simulation Platform

Python will model:

```text
node mobility
network topology
contact duration
node failures
gateway probability
message generation
TTL
replication
routing
```

Metrics:

```text
delivery ratio
delivery latency
hop count
replication count
battery proxy
network overhead
gateway utilization
```

This allows us to optimize routing before deploying algorithm changes to real devices.

---

# 67. Key Product KPIs

The product should eventually measure:

### Delivery Ratio

```text
Delivered Bundles
-----------------
Generated Bundles
```

### Delivery Latency

```text
Authority receipt time
-
Bundle creation time
```

### Average Hop Count

```text
Total hops
----------
Delivered bundles
```

### Replication Overhead

```text
Total transmissions
-------------------
Unique bundles
```

### Gateway Success Rate

```text
Successfully synchronized bundles
----------------------------------
Gateway-attempted bundles
```

---

# 68. Observability

Each device should maintain local diagnostics:

```text
Network status
Connected peers
Transport used
Bundles sent
Bundles received
Bundles forwarded
Bundles expired
Gateway sessions
ACKs
Errors
```

Diagnostics must not expose sensitive emergency information unnecessarily.

---

# 69. Authority Analytics

Dashboard metrics:

```text
Active incidents
Critical emergencies
Average delivery time
Mesh delivery ratio
Gateway count
Active nodes
Messages pending
Messages delivered
Expired bundles
```

---

# 70. Deployment Architecture

```text
                 Android Devices
                       │
                       │
                    Mesh
                       │
                 Gateway Node
                       │
                    HTTPS
                       │
                 ┌─────▼─────┐
                 │ Supabase  │
                 └─────┬─────┘
                       │
                  Realtime/API
                       │
                 ┌─────▼─────┐
                 │ Next.js   │
                 │ Authority │
                 └───────────┘
```

---

# 71. Critical Architectural Decision

The **DTN engine must not depend on Supabase**.

Correct:

```text
DTN
 │
 ├── Local DB
 │
 └── Mesh
```

Optional:

```text
Gateway
   ↓
Supabase
```

Incorrect:

```text
DTN
 ↓
Supabase
 ↓
Mesh
```

The former preserves the fundamental offline capability.

---

# 72. Critical Architectural Decision #2

The **DTN engine must not depend on BLE**.

Correct:

```text
DTN
 ↓
Transport Manager
 ↓
BLE / Wi-Fi Direct / Wi-Fi Aware
```

This allows the communication technology to evolve without rewriting the emergency protocol.

---

# 73. Critical Architectural Decision #3

The **React Native UI must not directly manage radio state**.

Correct:

```text
UI
 ↓
Mesh Service
 ↓
Transport Manager
```

Not:

```text
SOS Button
 ↓
Bluetooth scan
 ↓
Bluetooth connect
 ↓
send
```

The latter would make the application extremely difficult to maintain.

---

# 74. Final Frozen Architecture

```text
                    ┌─────────────────────────┐
                    │      AUTHORITY WEB      │
                    │ Next.js + TypeScript    │
                    └────────────┬────────────┘
                                 │
                              Supabase
                                 │
                    ┌────────────▼────────────┐
                    │       PostgreSQL        │
                    └────────────┬────────────┘
                                 │
                              INTERNET
                                 │
                         ┌───────▼───────┐
                         │    GATEWAY    │
                         └───────▲───────┘
                                 │
                  ┌──────────────┴──────────────┐
                  │        SMARTPHONE MESH      │
                  │                             │
                  │  A ── B ── C ── D ── E    │
                  │  │       │       │          │
                  │  F ──────G───────H          │
                  │                             │
                  └──────────────▲──────────────┘
                                 │
                     ┌───────────┴───────────┐
                     │    React Native      │
                     │      TypeScript       │
                     ├───────────────────────┤
                     │ Emergency Engine      │
                     │ DTN Engine             │
                     │ Routing Engine         │
                     │ Priority Engine        │
                     │ Incident Engine        │
                     │ Gateway Manager        │
                     │ Security Manager      │
                     │ Sync Manager           │
                     ├───────────────────────┤
                     │ Local SQLite           │
                     ├───────────────────────┤
                     │ Transport Manager     │
                     └───────────┬───────────┘
                                 │
                          Turbo Modules
                                 │
               ┌─────────────────┼─────────────────┐
               │                 │                 │
              BLE           Wi-Fi Direct      Wi-Fi Aware
               │                 │                 │
               └─────────────────┼─────────────────┘
                                 │
                           Android OS
```

---

# 75. Final Architecture Decisions - Frozen

I would consider these decisions **approved as the baseline**:

### Application

**React Native + TypeScript**

### Architecture

**Feature-based + layered architecture**

### Core

**Offline-first DTN engine**

### Persistence

**SQLite**

### Communication

**Transport abstraction**

with:

**BLE → Wi-Fi Direct → Wi-Fi Aware**

subject to device capability.

### Native integration

**React Native Turbo Native Modules**

rather than a separate Kotlin application. React Native's current documentation explicitly supports this pattern for platform APIs. ([React Native](https://reactnative.dev/docs/turbo-native-modules-introduction?utm_source=chatgpt.com))

### Backend

**Supabase + PostgreSQL**

### Authority

**Next.js + TypeScript**

### Simulation

**Python**

### AI

AI is an **enhancement layer**, not a dependency of the emergency communication protocol.

---

## One important feasibility constraint

There is one thing I would explicitly put into the SRS as an engineering constraint:

> **"Offline" does not mean that Android permits unlimited background radio operation under all circumstances.**

Modern Android imposes runtime permissions and background/foreground-service restrictions. Bluetooth permissions such as `BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`, and `BLUETOOTH_CONNECT` are runtime permissions on Android 12+, while modern foreground services have additional restrictions and service-type requirements. ([Android Developers](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions?authuser=683989221&utm_source=chatgpt.com))

Similarly, Wi-Fi Direct and Wi-Fi Aware support is device-dependent. ([Android Developers](https://developer.android.com/develop/connectivity/wifi/wifip2p?utm_source=chatgpt.com))

Therefore, **our SRS promises the communication protocol and behavior, not an unrealistic guarantee that every Android phone will continuously mesh in every background state.** Device capability detection, transport fallback, foreground-service compliance, and graceful degradation are first-class requirements.

That distinction will make the architecture technically defensible when an SIH judge asks, *"But can Android actually allow your app to do this?"*

---


---

**Sources:**

- [Native Platform · React Native](https://reactnative.dev/docs/native-platform?utm_source=chatgpt.com)
- [Wi-Fi Direct (peer-to-peer or P2P) overview  |  Connectivity  |  Android Developers](https://developer.android.com/develop/connectivity/wifi/wifip2p?utm_source=chatgpt.com)


