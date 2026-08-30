# MODULE PROMPT — Transport Abstraction: MeshTransport Interface, TransportManager & Wire Codec

**Project:** Offline Disaster Communication & Delay-Tolerant Emergency Mesh Network (DRM03)
**Protocol:** Emergency Mesh Protocol (EMP) v1.0
**Sequence position:** 5 of N — `Transport Abstraction` (builds on `Foundation` + `Storage` + `Protocol Primitives` + `DTN Engine`; precedes `BLE Transport`)
**Status:** Ready for implementation

---

## 1. Module Objective

This module defines the **contract** every physical transport (BLE, Wi-Fi Direct, Wi-Fi Aware) must implement, and the **manager** that lets the rest of the app send a message or discover peers without knowing or caring which radio is underneath. It exists so the DTN Engine, Routing Engine, and Session/Protocol Manager never `import` anything BLE- or Wi-Fi-specific — per SRS's layering, protocol logic must stay transport-agnostic, and today's BLE-only MVP must be able to grow into a multi-transport system later without rewriting anything above this layer.

This module contains **zero radio code**. It is pure TypeScript: interfaces, a manager that composes multiple transport instances, and a wire codec for turning a `ProtocolMessage` into bytes and back. Module 6 (BLE Transport) is the first concrete implementer of the interface defined here.

---

## 2. Context & Existing Architecture

Relevant frozen source documents:
- SRS §20–§23 (multi-transport support: BLE mandatory, Wi-Fi Direct and Wi-Fi Aware as graceful-degradation upgrades; transport selection should prefer higher-bandwidth transports when available for larger payloads).
- SRS §71–§74 (layering: DTN/Routing/Session must go through `TransportManager`/`MeshTransport`, never touch a native radio API directly).
- Protocol Data Model doc — `TransportType` enum, `peer_transports` table (a peer can be reachable over more than one transport simultaneously; this module must treat "peer" as one identity with a *set* of available transports, not one row per transport).
- Protocol Data Model doc §76 — `ProtocolMessage`/`ProtocolEnvelope<T>` (Module 3) is what actually gets sent; this module is responsible for turning that structured object into bytes suitable for a given radio and back.

**Builds on:**
- Module 3: `ProtocolMessage`, `MessageType`, `ProtocolEnvelope<T>` — the payload this module transmits, never redefines.
- Module 2: `PeerRepository` — this module persists/updates observed peer + transport availability through it.

**Required small addition to Module 2 (not a conflict — an omission to patch here):** the frozen `peer_transports` table exists in the schema, but no repository method was defined for it in Module 2's `PeerRepository`. Add a minimal `PeerTransportRepository` (`upsert(nodeId, transport, signalStrength)`, `getByNode(nodeId): PeerTransport[]`) in Module 2's `storage/repositories/` folder as part of this module's work, following Module 2's existing conventions exactly. Document this addition in `DEVIATIONS.md` — do not silently bolt ad hoc SQL onto this module instead.

---

## 3. Responsibilities

This module MUST implement:
1. **`MeshTransport` interface** — the contract every concrete radio implementation (Module 6+) must satisfy: lifecycle (advertise/discover start/stop), connection management, sending a whole `ProtocolMessage`, and event emission for discovery/connection/message-received.
2. **`TransportManager`** — holds a registry of `MeshTransport` instances, aggregates their peer-discovery events into one deduplicated peer identity per `nodeId` (a peer seen via both BLE and Wi-Fi Direct is one peer with two available transports, not two peers), and routes outgoing `send()` calls to the best available transport for a given peer according to a configurable priority order.
3. **`WireCodec`** — deterministic encode/decode between a `ProtocolMessage` and a transmittable byte payload (`Uint8Array`), versioned so the format can evolve later without breaking older nodes mid-rollout (best effort — full backward compatibility isn't achievable in v1 with only one node type, but the version field must exist from day one).
4. **`PeerTransportRepository`** addition to Module 2 (see §2) so observed transport availability persists across restarts (useful for Routing's contact-history scoring later).
5. **A `MockTransport` test double** implementing `MeshTransport` in-memory, so `TransportManager` logic can be fully unit tested without any native code or real radios — and so later modules (Routing, Session) can be developed/tested against a fake mesh before BLE (Module 6) exists.

---

## 4. Non-Responsibilities / Scope Boundaries

Do **NOT** implement in this module:
- Any actual BLE, Wi-Fi Direct, or Wi-Fi Aware code, native or JS (Module 6+).
- MTU-based chunking/fragmentation/reassembly for any specific radio's payload size limits — that is encapsulated *inside* each concrete transport implementation behind the "send one whole message" interface boundary defined here; this module's job is to define that boundary, not implement fragmentation for a radio it doesn't yet have.
- HELLO/session handshake semantics, bundle offer/accept negotiation (Routing/Session module) — this module only moves opaque `ProtocolMessage` objects; it does not interpret `MessageType` values or drive protocol state.
- Routing score calculation or peer trust decisions (Routing Engine).
- Gateway detection/election logic (Gateway Service).
- Any UI.

---

## 5. Dependencies

This module MAY use:
- Module 3: `ProtocolMessage`, `MessageType`, `ProtocolEnvelope<T>`, `PROTOCOL_VERSION`.
- Module 2: `PeerRepository`, plus the new `PeerTransportRepository` this module adds.
- Module 1: nothing directly required, though `IdentityManager.getIdentity().nodeId` may be useful for `HelloMessage` construction later — not this module's job to construct that message, only to transmit whatever it's handed.

This module MUST NOT depend on: `DtnEngine`, `RoutingEngine`, `GatewayService`, `ProtocolSession`, or UI. It also must not depend on any specific native BLE/Wi-Fi library — those belong exclusively inside Module 6+'s concrete implementations.

---

## 6. Interfaces & Contracts

```typescript
// transport/types.ts

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
  nodeId: string;                // if known (post-HELLO); may be a transport-local address pre-handshake — see note below
  transport: TransportType;
  signalStrength?: number;
  discoveredAt: number;
}

export type Unsubscribe = () => void;

// transport/MeshTransport.ts
export interface MeshTransport {
  readonly type: TransportType;

  isSupported(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;

  startAdvertising(): Promise<void>;
  stopAdvertising(): Promise<void>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;

  connect(peerAddress: string): Promise<void>;
  disconnect(peerAddress: string): Promise<void>;

  send(peerAddress: string, payload: Uint8Array): Promise<void>;

  onPeerDiscovered(handler: (peer: DiscoveredPeer) => void): Unsubscribe;
  onPeerLost(handler: (peerAddress: string) => void): Unsubscribe;
  onConnectionStateChanged(handler: (peerAddress: string, state: ConnectionState) => void): Unsubscribe;
  onMessageReceived(handler: (peerAddress: string, payload: Uint8Array) => void): Unsubscribe;

  getMaxMessageSize(): number;
}
```

**Important boundary note:** `MeshTransport` operates on `peerAddress` (a transport-local identifier — e.g. a BLE MAC/GATT handle) and raw `Uint8Array` payloads. It does **not** know about `nodeId` or `ProtocolMessage`. The mapping from `peerAddress` → `nodeId` only becomes known once a `HelloMessage` is exchanged and decoded — that correlation is `TransportManager`'s job (see §7), not something baked into the transport interface itself. This keeps `MeshTransport` implementable by something as dumb as a raw BLE central/peripheral role with zero protocol awareness.

```typescript
// transport/WireCodec.ts
export interface WireCodec {
  encode(message: ProtocolMessage): Uint8Array;
  decode(payload: Uint8Array): ProtocolMessage;
}

// transport/TransportManager.ts
export interface TransportManager {
  registerTransport(transport: MeshTransport): void;

  startAll(): Promise<void>;
  stopAll(): Promise<void>;

  send(nodeId: string, message: ProtocolMessage): Promise<void>;

  getAvailableTransports(nodeId: string): TransportType[];

  onPeerDiscovered(handler: (nodeId: string, transports: TransportType[]) => void): Unsubscribe;
  onPeerLost(handler: (nodeId: string) => void): Unsubscribe;
  onMessageReceived(handler: (nodeId: string, message: ProtocolMessage) => void): Unsubscribe;
}
```

---

## 7. Implementation Requirements

- **Peer identity correlation:** before a `HelloMessage` is exchanged and its `nodeId` learned, `TransportManager` only knows a transport-local `peerAddress`. It must track a `peerAddress → nodeId` mapping once learned (populated by whatever module handles the HELLO exchange — likely Routing/Session, which will call an as-yet-undefined `TransportManager.registerPeerIdentity(peerAddress, nodeId, transport)` method). **Add this method to the `TransportManager` interface now** even though nothing calls it until the Routing/Session module exists, so that module doesn't have to modify this one later.
- **Deduplication across transports:** if the same `nodeId` is reachable via both BLE and Wi-Fi Direct, `onPeerDiscovered` at the `TransportManager` level must fire once per *new* transport becoming available for an already-known peer (with the updated transport list), not re-announce the peer as brand-new.
- **Transport selection for `send()`:** given a `nodeId` reachable over multiple transports, pick by a configurable priority order (default: prefer the transport with the largest `getMaxMessageSize()` for large payloads like `BUNDLE_DATA`; for small control messages any connected transport is fine — implement a simple default of "prefer highest max message size among currently connected transports," expose the priority list as overridable rather than hardcoded, so tuning doesn't require a code change later).
- **Connection lifecycle:** `send()` must transparently `connect()` first if not already connected to the target `peerAddress` on the chosen transport, and surface a clear error if connection fails — callers (Session module later) should not have to manually manage connect/disconnect for the common case.
- **WireCodec versioning:** every encoded payload must embed `PROTOCOL_VERSION` (from Module 3) so `decode()` can reject or flag messages from an incompatible future/past version distinctly from "corrupted data."
- **WireCodec format:** JSON-based encoding (`JSON.stringify` the `ProtocolEnvelope`, then UTF-8 encode to bytes) is acceptable for v1 — document this choice and the version field explicitly as the seam for a future compact/binary encoding, rather than presenting JSON-over-BLE as a permanent architectural decision.

---

## 8. Data Flow

**Outgoing:**
```
Caller (future: Routing/Session layer)
        │
        ▼
TransportManager.send(nodeId, message)
        │
        ├─▶ resolve nodeId → peerAddress + best transport (per §7)
        ├─▶ WireCodec.encode(message) → Uint8Array
        │
        ▼
MeshTransport.send(peerAddress, payload)
        │
        ▼
(Module 6+: native radio transmission)
```

**Incoming:**
```
(Module 6+: native radio receives bytes)
        │
        ▼
MeshTransport emits onMessageReceived(peerAddress, payload)
        │
        ▼
TransportManager: WireCodec.decode(payload) → ProtocolMessage
        │
        ├─▶ resolve peerAddress → nodeId (if known)
        │
        ▼
TransportManager emits onMessageReceived(nodeId, message)
        │
        ▼
Caller (future: Routing/Session layer)
```

**Discovery:**
```
MeshTransport emits onPeerDiscovered({ nodeId?, transport, signalStrength })
        │
        ▼
TransportManager: merge into peer registry (dedup by nodeId if known, else by peerAddress+transport until identity resolved)
        │
        ├─▶ PeerTransportRepository.upsert(...)
        │
        ▼
TransportManager emits onPeerDiscovered(nodeId, transports[])
```

---

## 9. Error Handling & Edge Cases

- `send()` to a `nodeId` with no currently available transport → reject with a typed `NoTransportAvailableError`, do not silently drop the message (the caller — Session/DTN layer — needs to know so it can retry later or pick a different peer).
- `send()` where the payload exceeds every available transport's `getMaxMessageSize()` → reject with a typed `PayloadTooLargeError`; do not attempt cross-transport fragmentation here (out of scope per §4 — a future transport's own chunking, if it supports large payloads at all, is internal to that transport).
- `WireCodec.decode()` receives a payload with an unrecognized/future `MessageType` → throw a typed `UnknownMessageTypeError` rather than crashing on `undefined` field access; caller should log and drop, not propagate an unhandled exception into transport-layer event handling.
- `WireCodec.decode()` receives malformed/corrupted bytes → throw a typed `DecodeError`; `TransportManager`'s internal message-received handler must catch this per-message so one corrupted packet from a flaky BLE link doesn't take down the whole receive pipeline.
- A registered `MeshTransport.isSupported()` returns `false` (e.g., device lacks Wi-Fi Aware hardware) → `TransportManager.startAll()` must skip that transport gracefully, not fail the whole startup.
- Peer connection drops mid-send → `send()`'s promise rejects with a typed `TransportSendError`; `TransportManager` does not automatically retry on a different transport — that policy decision belongs to the caller (Session/Routing layer), which has more context on whether retrying matters for this message.

---

## 10. Security Requirements

- This module transmits already-signed bundles (per Module 3) and does not add its own encryption layer in v1 — document this as a known scope limitation (BLE/Wi-Fi Direct links themselves may or may not be encrypted at the radio level depending on pairing mode, which is a Module 6+ concern, not this abstraction layer's).
- `WireCodec.decode()` must never `eval` or otherwise dynamically execute content from a received payload — plain `JSON.parse` only, with the result validated against expected shape before being treated as a trusted `ProtocolMessage`.
- Do not log full decoded payload contents (which may contain incident details/location data) at a log level that could persist to shared logs — log message *type* and size/peer for diagnostics, not full content, consistent with the SRS's general privacy posture for emergency payload data.

---

## 11. Android / React Native Boundary

This entire module is **TypeScript-only**. `MeshTransport` is an interface with zero implementations here besides the in-memory `MockTransport` test double — no native code, no Turbo Native Modules, no Android permissions handling beyond the interface method signature (`requestPermissions()`) that Module 6's concrete BLE implementation will actually back with real `PermissionsAndroid` calls.

---

## 12. Testing Requirements

**Unit tests (all against `MockTransport`, no native code involved):**
- `TransportManager.send()` picks the transport with the largest `getMaxMessageSize()` among multiple connected mock transports for a given peer.
- `TransportManager` deduplicates a peer discovered via two different mock transports into one `onPeerDiscovered` peer-identity event with both transports listed.
- `send()` to an unreachable `nodeId` rejects with `NoTransportAvailableError`.
- `send()` with an oversized payload (vs a mock transport's small configured `getMaxMessageSize()`) rejects with `PayloadTooLargeError`.
- `WireCodec` round-trip: encode then decode every `ProtocolMessage` variant from Module 3 and assert deep equality.
- `WireCodec.decode()` on malformed bytes throws `DecodeError`, not an unhandled exception.
- A mid-send disconnect (simulated via `MockTransport`) surfaces as a rejected `send()` promise with `TransportSendError`.

**Integration tests:**
- Two `TransportManager` instances wired to a pair of `MockTransport`s that simulate a shared in-memory "ether" (Peer A's `send()` triggers Peer B's `onMessageReceived`) — a full send/receive round trip proves the manager + codec + mock transport composition works end-to-end without needing real BLE hardware. This test harness is valuable for the Routing/Session module's own tests later — build it to be reusable, not throwaway.

---

## 13. Acceptance Criteria

- [ ] `MeshTransport` interface exists with no radio-specific code anywhere in this module.
- [ ] `TransportManager` correctly deduplicates multi-transport peer discovery.
- [ ] `TransportManager` correctly selects a transport per the priority rule in §7 and this is covered by a test with more than one connected mock transport.
- [ ] `WireCodec` round-trips every Module 3 message type without data loss, verified by test.
- [ ] All error conditions in §9 have a distinct typed error class and a corresponding test.
- [ ] `PeerTransportRepository` added to Module 2 following its existing conventions, with its own unit test.
- [ ] `MockTransport` + dual-manager integration test harness exists and passes, ready to be reused by the future Routing/Session module's tests.
- [ ] Zero imports of `DtnEngine`, `RoutingEngine`, `GatewayService`, or any native BLE/Wi-Fi library in this module.

---

## 14. Files / Folder Structure

```
src/
├── transport/
│   ├── types.ts                  # TransportType, ConnectionState, DiscoveredPeer, Unsubscribe
│   ├── errors.ts                 # NoTransportAvailableError, PayloadTooLargeError, DecodeError,
│   │                              # UnknownMessageTypeError, TransportSendError
│   ├── MeshTransport.ts          # interface only
│   ├── WireCodec.ts              # interface + JSON-based implementation
│   ├── TransportManager.ts       # interface + implementation
│   └── mocks/
│       └── MockTransport.ts      # in-memory test double implementing MeshTransport
│
└── storage/repositories/
    └── PeerTransportRepository.ts   # ADDITION to Module 2, following its conventions

tests/
└── transport/
    ├── WireCodec.test.ts
    ├── TransportManager.test.ts
    ├── TransportManager.integration.test.ts   # dual-manager mock-ether harness
    └── PeerTransportRepository.test.ts
```

---

## 15. Implementation Order

1. Define `types.ts` and `errors.ts`.
2. Implement `WireCodec` (JSON-based) with round-trip tests against every Module 3 message type — get this solid before anything else depends on it.
3. Implement `MockTransport` test double.
4. Implement `TransportManager` incrementally: registration/startAll/stopAll → peer discovery aggregation/dedup → send()/transport selection → connection lifecycle handling → `registerPeerIdentity()` stub method.
5. Add `PeerTransportRepository` to Module 2's repositories folder, with its own test, and wire `TransportManager`'s discovery handling to persist through it.
6. Write the dual-manager mock-ether integration test harness.
7. Run full suite; confirm Modules 1–4 tests remain unaffected.

---

## 16. Final Verification

- [ ] Confirm `MeshTransport` has no knowledge of `nodeId`, `ProtocolMessage`, or any protocol semantics — only `peerAddress` and raw bytes.
- [ ] Confirm `TransportManager` is the only place `nodeId ↔ peerAddress` correlation and cross-transport dedup logic exists.
- [ ] Confirm no MTU/fragmentation logic was implemented here (that's explicitly deferred to Module 6+).
- [ ] Confirm the `PeerTransportRepository` addition to Module 2 follows that module's existing repository pattern exactly (same error-handling conventions, same transaction discipline) and is noted in `DEVIATIONS.md`.
- [ ] Confirm `WireCodec`'s version field is present in every encoded payload and exercised by a test that decodes a payload with a mismatched version.
- [ ] Confirm Modules 1–4 remain unmodified and their test suites pass unchanged.
- [ ] Record any deviation in `DEVIATIONS.md` (append to the running log) before proceeding to the BLE Transport module.

**Do not proceed to the BLE Transport module until every checkbox above is confirmed true.**
