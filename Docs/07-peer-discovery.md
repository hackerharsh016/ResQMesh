# MODULE PROMPT — Peer Discovery: HELLO Handshake, Identity Resolution & Contact Lifecycle

**Project:** Offline Disaster Communication & Delay-Tolerant Emergency Mesh Network (DRM03)
**Protocol:** Emergency Mesh Protocol (EMP) v1.0
**Sequence position:** 7 of N — `Peer Discovery` (builds on `Foundation` + `Storage` + `Protocol Primitives` + `DTN Engine` + `Transport Abstraction` + `BLE Transport`; precedes `Routing`)
**Status:** Ready for implementation

---

## 1. Module Objective

This module turns "a radio noticed some address nearby" into "we know who that is, we've shaken hands, and there's an active session Routing can use." It owns the `DISCOVERY → HELLO/HELLO_ACK` phase of the EMP session lifecycle (SRS/EMP session sequence, established in earlier modules' context) and is the sole caller of the `registerPeerIdentity()` correlation hook Module 5 anticipated. Nothing above this module (Routing, Gateway, UI) should ever have to think about `peerAddress`-to-`nodeId` resolution — by the time this module hands a session off, it's fully identified.

---

## 2. Context & Existing Architecture

Relevant frozen source documents and prior-module context:
- EMP session lifecycle: `DISCOVERY → HELLO/HELLO_ACK → SYNC_REQUEST/RESPONSE → ...` — this module implements the first arrow only; `SYNC_REQUEST` onward belongs to the Routing module (next).
- Protocol Data Model doc — `sessions`, `contacts`, `peers` tables (Module 2); `HelloMessage`, `HelloAckMessage` (Module 3).
- Module 5's stated intention: *"populated by whatever module handles the HELLO exchange... will call `TransportManager.registerPeerIdentity(peerAddress, nodeId, transport)`"* — that module is this one.

**Required extensions to Module 5's `TransportManager` (gap, not a doc conflict — see the framing above; implement as part of this module's work, in Module 5's file, following its conventions exactly):**

```typescript
// ADDED to transport/TransportManager.ts

export interface TransportManager {
  // ...existing methods unchanged...

  /** Send to a not-yet-identified peer, addressed by raw transport address. Used only
   *  during handshake, before a nodeId is known for this peer. */
  sendToAddress(peerAddress: string, transport: TransportType, message: ProtocolMessage): Promise<void>;

  /** Fires for every discovered peer address BEFORE identity resolution. Peer Discovery
   *  is the sole intended consumer; once identity is known, the existing onPeerDiscovered
   *  (nodeId-keyed) event takes over for all other modules. */
  onRawPeerDiscovered(handler: (peerAddress: string, transport: TransportType, signalStrength?: number) => void): Unsubscribe;

  /** Fires for every received message where the sender's nodeId is not yet known.
   *  Once registerPeerIdentity() is called for a peerAddress, subsequent messages from it
   *  route through the existing onMessageReceived (nodeId-keyed) event instead — no
   *  duplication between the two channels for the same message. */
  onRawMessageReceived(handler: (peerAddress: string, transport: TransportType, payload: Uint8Array) => void): Unsubscribe;

  registerPeerIdentity(peerAddress: string, nodeId: string, transport: TransportType): void; // already anticipated by Module 5, implement now
}
```

**Also finalizing here:** Module 2's `SessionRepository` referenced a `SessionState` type without enumerating it. This module defines it (additive, not breaking — no prior module used a specific value):

```typescript
export enum SessionState {
  DISCOVERED = "DISCOVERED",
  HANDSHAKING = "HANDSHAKING",
  ACTIVE = "ACTIVE",
  CLOSED = "CLOSED",
  FAILED = "FAILED",
}
```

---

## 3. Responsibilities

This module MUST implement:
1. **`PeerDiscoveryService`** — subscribes to `TransportManager.onRawPeerDiscovered` and initiates a handshake: creates a `ProtocolSession` (state `DISCOVERED` → `HANDSHAKING`), sends a `HelloMessage` via the new `sendToAddress()`.
2. **HELLO responder logic** — on receiving a `HelloMessage` via `onRawMessageReceived`: validate `protocolVersion` compatibility, reply with a `HelloAckMessage` (`accepted: true/false`), and — if accepted — call `registerPeerIdentity()`, upsert the `Peer` (Module 2 `PeerRepository`), start a `Contact` record (`ContactRepository`), and transition the session to `ACTIVE`.
3. **HELLO_ACK handler logic** — on receiving a `HelloAckMessage` (as the handshake initiator) via `onRawMessageReceived`: if `accepted`, perform the same identity-registration/peer-upsert/contact-start/session-activation as above; if not accepted (version mismatch), transition the session to `FAILED` and log via `ProtocolEventRepository`.
4. **Session teardown** — on `TransportManager.onPeerLost` (or a transport-level disconnect signal surfaced through it) for an already-identified peer: close the active `Contact` (`endedAt`, `durationMs`), transition the `ProtocolSession` to `CLOSED`, and call `PeerRepository.recordEncounter(peerNodeId, durationMs)`.
5. **Handshake deduplication** — if the same `nodeId`/`peerAddress` is discovered again while a handshake is already in flight, or discovered simultaneously on a second transport, do not start a second concurrent handshake.
6. **Public hand-off API for Routing (Module 8)** — expose `onSessionEstablished(handler: (session: ProtocolSession) => void)` and `getActiveSessions(): Promise<ProtocolSession[]>` so Routing can react to newly usable sessions without knowing anything about how they got established.

---

## 4. Non-Responsibilities / Scope Boundaries

Do **NOT** implement in this module:
- `SYNC_REQUEST`/`SYNC_RESPONSE`, `BUNDLE_OFFER`/`ACCEPT`/`REJECT`, `BUNDLE_DATA`, or `BUNDLE_ACK` handling of any kind — that entire negotiation belongs to the Routing module. This module's job ends the moment a session is `ACTIVE`.
- Routing score calculation, contact-history-based peer prioritization, or next-hop decisions (Routing Engine, next module) — this module only *records* contact/encounter data via `PeerRepository`/`ContactRepository`; it does not interpret that data for scoring.
- Gateway detection or election (Gateway Service module).
- Any BLE/Wi-Fi radio code (already done, Modules 5–6) — this module only calls `TransportManager`.
- Any UI.

---

## 5. Dependencies

This module MAY use:
- Module 1: `IdentityManager` (local `nodeId`/`publicKey`/`protocolVersion`/capabilities for constructing the local `HelloMessage`).
- Module 2: `PeerRepository`, `ContactRepository`, `SessionRepository`, `ProtocolEventRepository`.
- Module 3: `MessageType`, `HelloMessage`, `HelloAckMessage`, `PROTOCOL_VERSION`, `NodeCapabilities`.
- Module 5: `TransportManager` (including the three additions in §2), `TransportType`.

This module MUST NOT depend on: `DtnEngine` (bundle logic has no place in a handshake), `RoutingEngine`, `GatewayService`, or UI.

---

## 6. Interfaces & Contracts

```typescript
// discovery/PeerDiscoveryService.ts

export interface PeerDiscoveryService {
  start(): Promise<void>;
  stop(): Promise<void>;

  onSessionEstablished(handler: (session: ProtocolSession) => void): Unsubscribe;
  onSessionClosed(handler: (session: ProtocolSession) => void): Unsubscribe;

  getActiveSessions(): Promise<ProtocolSession[]>;
}
```

Cross-check `ProtocolSession`/`SessionState` against Module 2's schema-derived type — extend, don't duplicate. `HelloMessage`/`HelloAckMessage` must match Module 3's definitions exactly (do not add fields here without updating Module 3's canonical type).

---

## 7. Implementation Requirements

- The handshake state machine per `(peerAddress, transport)` pair must be explicit and finite: `NONE → HANDSHAKE_SENT → ESTABLISHED` (initiator side) or `NONE → HELLO_RECEIVED → ACK_SENT → ESTABLISHED` (responder side) — implement as a small internal map keyed by `peerAddress`, not ad hoc boolean flags, so the dedup requirement in §3.5 is enforceable by construction (a peer already in a non-`NONE` state is skipped on a repeat `onRawPeerDiscovered` event).
- Protocol version compatibility check: compare the incoming `HelloMessage.protocolVersion` against local `PROTOCOL_VERSION` (Module 3). For v1, require exact match (`accepted: false` on any mismatch) — do not attempt partial semver-style compatibility logic that isn't specified anywhere in the frozen docs.
- Once `registerPeerIdentity()` is called for a `peerAddress`, this module must stop listening for further raw events from that address for handshake purposes (it's now a resolved peer) — guard against acting twice on a straggler duplicate `HelloMessage` retransmission.
- `getActiveSessions()` must query `SessionRepository` for `state = ACTIVE`, not maintain a separate in-memory list that could drift from persisted state — the repository is the source of truth; an in-memory cache for performance is acceptable only if it's invalidated/refreshed on every state-changing method in this module, not left to go stale.
- Contact `duration_ms` on teardown must be computed from the actually-recorded `started_at`, not estimated — read the `Contact` row back if the in-memory reference isn't reliably held across the module's lifecycle.

---

## 8. Data Flow

**Initiator side (we discover them first):**
```
TransportManager.onRawPeerDiscovered(peerAddress, transport, rssi)
        │
        ▼
PeerDiscoveryService: create ProtocolSession(state=DISCOVERED→HANDSHAKING)
        │
        ▼
TransportManager.sendToAddress(peerAddress, transport, HelloMessage)
        │
        ▼
(wait for HelloAckMessage via onRawMessageReceived)
        │
   ┌────┴─────┐
 accepted   rejected/mismatch
   │             │
   ▼             ▼
registerPeerIdentity()      session → FAILED, log via ProtocolEventRepository
PeerRepository.upsert()
ContactRepository.create()
session → ACTIVE
onSessionEstablished fires
```

**Responder side (they discover/connect to us first):**
```
TransportManager.onRawMessageReceived(peerAddress, transport, payload)
        │
        ▼
decoded as HelloMessage
        │
        ▼
PeerDiscoveryService: validate protocolVersion
        │
        ▼
TransportManager.sendToAddress(peerAddress, transport, HelloAckMessage{accepted})
        │
   ┌────┴─────┐
 accepted   rejected
   │             │
   ▼             ▼
registerPeerIdentity()      session → FAILED
PeerRepository.upsert()
ContactRepository.create()
session → ACTIVE
onSessionEstablished fires
```

**Teardown:**
```
TransportManager.onPeerLost(nodeId)  [post-identity, existing Module 5 event]
        │
        ▼
PeerDiscoveryService: close Contact, session → CLOSED
        │
        ▼
PeerRepository.recordEncounter(nodeId, durationMs)
        │
        ▼
onSessionClosed fires
```

---

## 9. Error Handling & Edge Cases

- `HelloMessage` received from a peer already mid-handshake or already `ACTIVE` (retransmission/duplicate) → ignore idempotently, do not create a second session or re-send a second `HelloAckMessage` unless the first send genuinely failed.
- `sendToAddress()` for the `HelloAckMessage` fails (peer disconnected between HELLO arrival and our reply) → transition session to `FAILED`, do not retry indefinitely; log via `ProtocolEventRepository`.
- Two peers' `onRawPeerDiscovered` fire for the same physical device on two transports (e.g. BLE and Wi-Fi Direct) before identity is known → since `nodeId` isn't known yet, this module cannot detect they're the same device; both handshakes may proceed independently and — this is fine — `registerPeerIdentity()` calls for the same resolved `nodeId` on two different transports are exactly how Module 5 already expects multi-transport dedup to happen (Module 5 handles the merge once identity is known; this module doesn't need special-case logic here beyond not crashing on a second `registerPeerIdentity()` call for an already-known `nodeId`).
- Malformed/undecodable payload on `onRawMessageReceived` (already caught as a `DecodeError` inside `TransportManager` per Module 5) → this module simply never sees it; no additional handling needed here beyond not assuming every raw message is a valid `HelloMessage`/`HelloAckMessage` (type-guard the decoded `MessageType` before treating it as either).
- App restart mid-handshake (a `HANDSHAKING`-state session left over from before a crash) → on `start()`, sessions found in a non-terminal state that are older than a short grace period should be transitioned to `FAILED` rather than left dangling forever.

---

## 10. Security Requirements

- `HelloMessage`/`HelloAckMessage` are not signed in this design (per Module 3's stated assumption that only bundles are signed) — this module must not claim otherwise; peer authenticity for handshake purposes rests on protocol-version/shape validation only, not cryptographic proof of identity at this stage. If stronger handshake authentication is later required, that's a documented future change to Module 3's scope, not something to improvise here.
- Do not log full `NodeCapabilities` or any potentially sensitive device details from a peer's `HelloMessage` at a persistent log level beyond what's needed for debugging.
- Rate-limit/dedup handshake attempts (per §3.5) partly serves security too — prevents a misbehaving or malicious nearby device from forcing repeated session churn/log spam via rapid re-advertising.

---

## 11. Android / React Native Boundary

This module is **entirely TypeScript** — no native code. It only calls `TransportManager` (Module 5, itself backed by native transports) and Module 1/2/3 TS interfaces.

---

## 12. Testing Requirements

**Unit tests (with `TransportManager`, `PeerRepository`, `ContactRepository`, `SessionRepository` mocked):**
- Initiator flow: `onRawPeerDiscovered` → `HelloMessage` sent → `HelloAckMessage{accepted:true}` received → identity registered, peer upserted, contact created, session `ACTIVE`, `onSessionEstablished` fires.
- Responder flow: `HelloMessage` received → `HelloAckMessage{accepted:true}` sent → same end state as above.
- Protocol version mismatch (either direction) → session `FAILED`, no peer/contact records created, `onSessionEstablished` does NOT fire.
- Duplicate `HelloMessage` while already `HANDSHAKING`/`ACTIVE` → idempotent, no duplicate session/contact.
- Teardown: `onPeerLost` for an active session closes the contact with correct `durationMs` and fires `onSessionClosed`.
- Stale `HANDSHAKING` session found on `start()` (simulated restart) → transitioned to `FAILED`.

**Integration tests (real Module 2 repositories, `TransportManager` wired to the dual-mock-ether harness from Module 5):**
- Two `PeerDiscoveryService` instances (one per side of the mock ether) successfully complete a full handshake and both end up with `ACTIVE` sessions referencing each other's correct `nodeId`.

---

## 13. Acceptance Criteria

- [ ] Both initiator and responder handshake flows complete correctly and are covered by tests.
- [ ] Protocol version mismatch is handled on both sides without crashing and without creating spurious peer/contact records.
- [ ] Handshake deduplication prevents concurrent double-handshakes with the same peer.
- [ ] Contact `durationMs` is computed from persisted `started_at`/`ended_at`, verified by test.
- [ ] `getActiveSessions()` reflects `SessionRepository` state faithfully (no drift from an unsynced in-memory cache).
- [ ] The three `TransportManager` extensions from §2 are implemented in Module 5's file, are covered by their own unit tests, and are noted in `DEVIATIONS.md`.
- [ ] Zero `SYNC_REQUEST`/`BUNDLE_OFFER`/etc. handling anywhere in this module.

---

## 14. Files / Folder Structure

```
src/
├── transport/
│   └── TransportManager.ts          # EXTEND (Module 5) with sendToAddress, onRawPeerDiscovered,
│                                     # onRawMessageReceived, registerPeerIdentity implementation
│
└── discovery/
    ├── types.ts                     # SessionState enum (finalizing Module 2's placeholder)
    ├── PeerDiscoveryService.ts      # interface + implementation
    └── handshakeStateMachine.ts     # isolated, independently testable per-peer state tracking

tests/
└── discovery/
    ├── PeerDiscoveryService.test.ts
    ├── handshakeStateMachine.test.ts
    └── PeerDiscoveryService.integration.test.ts   # dual-instance mock-ether handshake
```

---

## 15. Implementation Order

1. Implement the three `TransportManager` extensions in Module 5's file, with their own unit tests, before touching this module's own logic.
2. Finalize `SessionState` enum in `discovery/types.ts`.
3. Implement `handshakeStateMachine.ts` in isolation (pure per-peer state tracking, no I/O) with full unit test coverage.
4. Implement `PeerDiscoveryService`, composing the state machine with `TransportManager` + Module 2 repositories.
5. Write initiator/responder/version-mismatch/dedup/teardown unit tests.
6. Write the dual-instance integration test using Module 5's mock-ether harness.
7. Run full suite; confirm Modules 1–6 tests remain unaffected.

---

## 16. Final Verification

- [ ] Confirm this module never handles `SYNC_*`/`BUNDLE_*` message types — only `HELLO`/`HELLO_ACK`.
- [ ] Confirm the three `TransportManager` extensions don't change the behavior of any existing Module 5/6 method for already-identified peers (regression-test Module 5/6's existing suites).
- [ ] Confirm `registerPeerIdentity()` is called exactly once per newly resolved `(peerAddress, nodeId, transport)` combination, never repeatedly for the same one.
- [ ] Confirm session/contact state always matches what's persisted in Module 2 — no silent in-memory-only state.
- [ ] Confirm Modules 1–6 remain unmodified in behavior (only the documented additive extension to Module 5) and their test suites pass unchanged.
- [ ] Record all deviations (the three `TransportManager` additions, the `SessionState` finalization) in `DEVIATIONS.md` before proceeding to the Routing module.

**Do not proceed to the Routing module until every checkbox above is confirmed true.**
