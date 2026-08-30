# MODULE PROMPT — Routing: Contact-Aware Scoring & Bundle Exchange Negotiation

**Project:** Offline Disaster Communication & Delay-Tolerant Emergency Mesh Network (DRM03)
**Protocol:** Emergency Mesh Protocol (EMP) v1.0
**Sequence position:** 8 of N — `Routing` (builds on everything through `Peer Discovery`; precedes `Gateway`)
**Status:** Ready for implementation

---

## 1. Module Objective

This module is where bundles actually start moving between devices. It decides, for a given `ACTIVE` session, *which* stored bundles are worth offering to *this* peer (routing score), and drives the full `SYNC_REQUEST → SYNC_RESPONSE → BUNDLE_OFFER → BUNDLE_ACCEPT/REJECT → BUNDLE_DATA → BUNDLE_ACK` exchange over that session. Everything before this module (Transport, BLE, Peer Discovery) only got two devices to the point of knowing each other; this module is the first place actual `EmergencyBundle` payloads cross the wire.

---

## 2. Context & Existing Architecture

Relevant frozen source documents and established context:
- EMP session lifecycle (from earlier synthesis): `... HELLO/HELLO_ACK → SYNC_REQUEST/RESPONSE (bundle summaries, not full bundles) → BUNDLE_OFFER/ACCEPT/REJECT → BUNDLE_DATA → BUNDLE_ACK → SESSION_CLOSE`.
- Routing score model (established from initial architecture synthesis): weighted sum of priority, gateway probability, contact history, link quality, battery, minus hop/queue penalties — weights experimentally tunable.
- SRS §82 invariants: `hopCount` only increases, `replicationBudget` only decreases, `bundleId` immutable, failed transfers never delete the original.

**Design correction carried into this module (see above):** `hopCount + 1` is computed only for the transmitted copy (via Module 3's `applyHopIncrement`, non-persisted on the sender side); `replicationBudget` is the only field the sender mutates locally per successful handoff (via Module 4's `markTransferred`, unchanged). Module 4's `markRelayed()` hop-mutation behavior is removed as part of this module's implementation work.

**Required extension to Module 7's `PeerDiscoveryService`:** add `closeSession(nodeId: string, reason?: string): Promise<void>` — a graceful close this module calls once sync is finished, and which also backs incoming `SessionCloseMessage` handling. Module 7 only implemented ungraceful (transport-disconnect-triggered) teardown; the protocol's explicit `SESSION_CLOSE` message needs a home, and Module 7's existing teardown logic (close contact, close session, record encounter) is the correct implementation to reuse — just expose it as a callable method instead of only an internal reaction to `onPeerLost`.

**Builds on:** Module 7 (`onSessionEstablished`, `closeSession`), Module 5 (`TransportManager.send`/`onMessageReceived`, now identity-resolved), Module 4 (`getForwardingCandidates`, `receiveBundle`, `markOffered`, `markTransferred`, `markDelivered`, `markRejectedByPeer`), Module 3 (all `SYNC_*`/`BUNDLE_*` message types, `applyHopIncrement`), Module 2 (`PeerRepository` for contact-history score inputs, `BundleAckRepository`).

---

## 3. Responsibilities

This module MUST implement:
1. **`RoutingScorer`** — pure scoring function: given a candidate bundle and a peer's known stats (contact history, gateway status, link quality, battery class), produce a numeric score used to rank/filter forwarding candidates.
2. **`BundleExchangeCoordinator`** — the per-session protocol driver: on `onSessionEstablished`, initiates sync; handles all six `SYNC_*`/`BUNDLE_*` message types as both initiator and responder; drives bundles through `DtnEngine`'s `mark*` transitions at the right points; calls `PeerDiscoveryService.closeSession()` when sync activity for that session is done.
3. **Outgoing-copy construction** — building the `hopCount`-incremented, wire-ready copy of a bundle for `BUNDLE_DATA` (per the design correction above), without mutating the sender's own stored record.
4. **Acknowledgment handling** — sending `BundleAckMessage` on receipt (via `DtnEngine.receiveBundle()`'s result) and processing incoming acks to advance the sender's own bundle state (`markTransferred`) and persist the ack (`BundleAckRepository`).

---

## 4. Non-Responsibilities / Scope Boundaries

Do **NOT** implement in this module:
- `HELLO`/`HELLO_ACK` handshake logic (Module 7 — already done; this module only starts once a session is `ACTIVE`).
- Gateway detection, election, or backend sync (`sync_queue`, Supabase) — Gateway Service module, next.
- Bundle creation, signing, or verification (Modules 3–4 — this module calls `DtnEngine.receiveBundle()`/`BundleFactory` indirectly through `DtnEngine`, it doesn't reimplement any of that).
- Any transport/radio code (Modules 5–6).
- Any UI.

---

## 5. Dependencies

This module MAY use:
- Module 7: `PeerDiscoveryService.onSessionEstablished`, `.onSessionClosed`, `.closeSession()` (new).
- Module 5: `TransportManager.send`, `.onMessageReceived` (identity-resolved channel — this module is a primary consumer of it, now that Peer Discovery has already handled the raw/pre-identity channel).
- Module 4: `DtnEngine` (`getForwardingCandidates`, `receiveBundle`, `markOffered`, `markTransferred`, `markDelivered`, `markRejectedByPeer`).
- Module 3: `MessageType`, all `SYNC_*`/`BUNDLE_*` message interfaces, `applyHopIncrement`, `BundleSummary`.
- Module 2: `PeerRepository` (contact-history stats for scoring), `BundleAckRepository`.
- Module 1: `LocalConfigRepository` (routing score weights).

This module MUST NOT depend on: `GatewayService`, any transport internals below `TransportManager`, or UI.

---

## 6. Interfaces & Contracts

```typescript
// routing/RoutingScorer.ts

export interface RoutingWeights {
  priorityWeight: number;
  gatewayProbabilityWeight: number;
  contactHistoryWeight: number;
  linkQualityWeight: number;
  batteryWeight: number;
  hopPenaltyWeight: number;
  queuePenaltyWeight: number;
}

export interface RoutingScoreContext {
  peer: Peer;                 // Module 2 — includes encounterCount, successfulTransfers, batteryClass, isGateway, lastSignalStrength
  bundle: EmergencyBundle;
  queuePosition: number;      // this bundle's rank within the local queue, for the penalty term
}

export interface RoutingScorer {
  computeScore(context: RoutingScoreContext, weights: RoutingWeights): number;
}

// routing/BundleExchangeCoordinator.ts
export interface BundleExchangeCoordinator {
  start(): Promise<void>;   // subscribes to PeerDiscoveryService.onSessionEstablished
  stop(): Promise<void>;
}
```

Cross-check every `SYNC_*`/`BUNDLE_*` message shape against Module 3's definitions exactly — this module is their primary consumer and must not invent alternate fields.

---

## 7. Implementation Requirements

**Scoring formula** (weights read from `LocalConfigRepository`, defaults tunable, not hardcoded beyond initial seed values):
```
score = (priorityWeight * normalizedPriority)
      + (gatewayProbabilityWeight * (peer.isGateway ? 1 : 0))
      + (contactHistoryWeight * contactHistoryFactor(peer))
      + (linkQualityWeight * normalizedSignalStrength(peer.lastSignalStrength))
      + (batteryWeight * batteryFactor(peer.batteryClass))
      - (hopPenaltyWeight * (bundle.hopCount / bundle.maxHopCount))
      - (queuePenaltyWeight * normalizedQueuePosition(queuePosition))
```
where `contactHistoryFactor` combines `successfulTransfers / max(encounterCount, 1)` (a reliability ratio) with `encounterCount` itself (a familiarity bonus, diminishing — e.g. `log(1 + encounterCount)`), and `normalizedPriority` maps `Priority.CRITICAL → 1.0 ... Priority.LOW → 0.25` (confirm against any explicit weighting table in the frozen docs if one exists; otherwise this linear mapping is this module's own reasonable default, document it as such).

**Sync exchange sequencing (per session):**
1. `onSessionEstablished(session)` → call `DtnEngine.getForwardingCandidates(session.peerNodeId)` → send `SyncRequestMessage{ bundleSummaries }`.
2. On receiving a `SyncRequestMessage` from the peer: compare its `bundleSummaries` against local storage (`BundleRepository.getById` per summary, via `DtnEngine`/a thin existence-check — do not reach into Module 2 directly if `DtnEngine` can expose this; if it can't yet, add a minimal `DtnEngine.hasBundle(bundleId): Promise<boolean>` method as a small additive extension, documented). Reply `SyncResponseMessage{ wantedBundleIds }` = summaries we don't already have and aren't expired.
3. On receiving a `SyncResponseMessage`: for each `wantedBundleId`, look up the local full bundle, run it through `RoutingScorer` against this peer, and if above a configurable threshold (`LocalConfigRepository`) AND `replicationBudget > 0` AND `hopCount < maxHopCount`, send `BundleOfferMessage{ bundleId, summary }` and call `DtnEngine.markOffered(bundleId, peerNodeId)`. If below threshold or ineligible, simply don't offer it (no message needed — silence is a valid outcome here, not an error).
4. On receiving a `BundleOfferMessage`: decide accept/reject based on current local capacity/state (re-check — state may have changed since the `SYNC_RESPONSE` was sent) and reply `BundleAcceptMessage` or `BundleRejectMessage{ reason }`.
5. On receiving a `BundleAcceptMessage` for a bundle we offered: construct the outgoing copy via `applyHopIncrement(localBundle)` (Module 3, non-persisted locally), send `BundleDataMessage{ bundle: incrementedCopy }`, then on successful transmission call `DtnEngine.markTransferred(bundleId, peerNodeId)`.
6. On receiving a `BundleRejectMessage`: call `DtnEngine.markRejectedByPeer(bundleId, peerNodeId, reason)` — do not mark the bundle terminal, per Module 4's existing behavior.
7. On receiving a `BundleDataMessage`: call `DtnEngine.receiveBundle(bundle, senderPublicKey)` (peer's public key from the `Peer` record, Module 2); reply `BundleAckMessage{ bundleId, ackType: RECEIVED }` regardless of accept/reject outcome only if accepted — on rejection by `DtnEngine` (dedup/expired/invalid signature/etc.), do not ack; the sender's lack-of-ack will surface via its own timeout handling (§9).
8. On receiving a `BundleAckMessage`: persist via `BundleAckRepository.create()`; if this was the first ack for a locally-originated or relayed bundle, this is where delivery confirmation logic could eventually escalate to `markDelivered` — but only if `ackType === DELIVERED` (a downstream/final ack, not merely `RECEIVED` by an intermediate relay) — do not call `markDelivered` on every hop's `RECEIVED` ack, only on a true end-to-end delivery signal (this may not be fully resolvable until the Gateway module exists to relay a `DELIVERED` ack back from the backend for internet-bound bundles; for peer-to-peer destination bundles, the final recipient's own `RECEIVED` ack IS the delivery signal — distinguish by `bundle.destinationType`).
9. Once no further `wantedBundleIds` remain to process and no offers are in flight, call `PeerDiscoveryService.closeSession(peerNodeId)` (sends `SessionCloseMessage`, tears down contact/session per Module 7's reused logic).

---

## 8. Data Flow

```
PeerDiscoveryService.onSessionEstablished(session)
        │
        ▼
BundleExchangeCoordinator: DtnEngine.getForwardingCandidates(peerNodeId)
        │
        ▼
TransportManager.send(peerNodeId, SyncRequestMessage)
        │
        ▼
        ... (SYNC_RESPONSE → BUNDLE_OFFER/ACCEPT/REJECT → BUNDLE_DATA → BUNDLE_ACK, per §7 sequencing) ...
        │
        ▼
DtnEngine state transitions applied throughout (markOffered/markTransferred/markRejectedByPeer/receiveBundle)
        │
        ▼
BundleAckRepository persists each ack
        │
        ▼
No more work for this session → PeerDiscoveryService.closeSession(peerNodeId)
```

---

## 9. Error Handling & Edge Cases

- `BUNDLE_DATA` sent but no `BUNDLE_ACK` received within a configurable timeout → treat as a failed transfer: do **not** call `markTransferred` (it was already called optimistically in step 5 above — reconsider: move `markTransferred` to occur only *after* ack receipt, not right after send, to avoid falsely marking a successful transfer before confirmation; correct §7 step 5 to defer `markTransferred` until the corresponding `BUNDLE_ACK` arrives, with a timeout path that logs the failure via `ProtocolEventRepository` and leaves `replicationBudget` untouched — per SRS §82, failed transfers never delete/corrupt the original, and here that means never decrementing budget for a transfer that didn't confirm).
- `SYNC_RESPONSE` never arrives (peer disconnected mid-sync) → session teardown via Module 7's existing `onPeerLost` path handles this; this module doesn't need special-case cleanup beyond not leaving in-flight offer state referencing a dead session (clear it on `onSessionClosed`).
- Duplicate `BUNDLE_OFFER` for a bundle already offered/accepted/rejected in the same session → idempotent, ignore the repeat.
- `BUNDLE_DATA` received for a bundle that was never offered/accepted in this session (protocol violation or stale message) → still run it through `DtnEngine.receiveBundle()` (dedup will naturally reject it if already held, or accept it if genuinely new — the exchange handshake around offers is an optimization to avoid wasted transmission, not a security boundary; the real gate is `receiveBundle()`'s verification).
- Both peers simultaneously initiate `SyncRequestMessage` to each other (equally likely at handshake time since either side could be the one whose `onSessionEstablished` fires first) → this is fine and expected; both directions of sync proceed independently and concurrently, they are not mutually exclusive.

---

## 10. Security Requirements

- `BundleDataMessage` contents go through `DtnEngine.receiveBundle()`'s full verification gate (Module 4/3) — this module must never skip that by, e.g., trusting a bundle because it arrived on an already-`ACTIVE`/handshaken session. Session-level trust and bundle-level cryptographic trust are separate; only the latter gates persistence.
- Do not log full bundle payload contents when logging exchange progress — log `bundleId`, message type, and peer only.

---

## 11. Android / React Native Boundary

This module is **entirely TypeScript** — no native code. It orchestrates `TransportManager` (Module 5), `DtnEngine` (Module 4), and `PeerDiscoveryService` (Module 7), all of which are themselves TS interfaces regardless of what backs them natively underneath.

---

## 12. Testing Requirements

**Unit tests:**
- `RoutingScorer.computeScore()`: verify each weighted factor moves the score in the expected direction in isolation (higher priority → higher score; higher hopCount → lower score; higher contact success rate → higher score), using fixed weight fixtures.
- `BundleExchangeCoordinator` (with `TransportManager`, `DtnEngine`, `PeerDiscoveryService` mocked): full initiator-side sequence (`SYNC_REQUEST` → `SYNC_RESPONSE` → `OFFER` → `ACCEPT` → `DATA` → wait for `ACK` → `markTransferred` called only after ack) and full responder-side sequence (`SYNC_REQUEST` received → `SYNC_RESPONSE` sent → `OFFER` received → `ACCEPT`/`REJECT` decision → `DATA` received → `DtnEngine.receiveBundle()` called → `ACK` sent).
- Timeout path: `BUNDLE_DATA` sent, no ack within timeout → `markTransferred` never called, failure logged.
- `BundleRejectMessage` handling calls `markRejectedByPeer`, not a terminal state change.
- Session closes (`closeSession` called) once no more offers are pending.

**Integration tests (using Module 5's mock-ether harness + real Modules 2–4/7):**
- Two full stacks (each with its own `DtnEngine`, `PeerDiscoveryService`, `BundleExchangeCoordinator`) — Node A creates a local bundle, both nodes' discovery/handshake completes, sync exchange runs, and Node B ends up with a correctly persisted, verified copy of the bundle with `hopCount` incremented by exactly one relative to Node A's original.

---

## 13. Acceptance Criteria

- [ ] `RoutingScorer` produces monotonically sensible output for each factor, verified by test.
- [ ] Full bidirectional sync sequence completes correctly in the two-stack integration test, with correct final `hopCount`/`replicationBudget`/`state` on both sides.
- [ ] `markTransferred` is called only after ack receipt, never optimistically at send time.
- [ ] Sender's own stored bundle record's `hopCount` is never mutated by relaying (verified by test — this directly checks the Module 4 correction took effect).
- [ ] `Module 4`'s `markRelayed` hop-mutating behavior has been removed/repurposed, and this is recorded in `DEVIATIONS.md`.
- [ ] `PeerDiscoveryService.closeSession()` extension (Module 7) is implemented and called at the correct point.
- [ ] Zero Gateway/Supabase/sync_queue references anywhere in this module.

---

## 14. Files / Folder Structure

```
src/
├── discovery/
│   └── PeerDiscoveryService.ts     # EXTEND (Module 7) with closeSession()
│
├── dtn/
│   └── DtnEngine.ts                 # EXTEND: remove markRelayed's hop-mutation; add hasBundle() if needed
│
└── routing/
    ├── RoutingScorer.ts
    ├── BundleExchangeCoordinator.ts
    └── weights.ts                   # default RoutingWeights, LocalConfigRepository-backed overrides

tests/
└── routing/
    ├── RoutingScorer.test.ts
    ├── BundleExchangeCoordinator.test.ts
    └── BundleExchangeCoordinator.integration.test.ts   # two-stack, mock-ether
```

---

## 15. Implementation Order

1. Apply the Module 4 correction first (remove `markRelayed`'s hop-mutation; add `hasBundle()` if needed) with regression tests confirming Module 4's existing suite still passes otherwise unchanged.
2. Add `PeerDiscoveryService.closeSession()` to Module 7, with its own unit test.
3. Implement `RoutingScorer` in isolation with fixture-based unit tests.
4. Implement `BundleExchangeCoordinator`'s initiator-side flow first (simpler to reason about), with mocked dependencies.
5. Implement the responder-side flow in the same coordinator (most real sessions will exercise both directions).
6. Implement timeout handling for unacked `BUNDLE_DATA`.
7. Write remaining unit tests.
8. Write the two-stack integration test using Module 5's mock-ether harness.
9. Run full suite; confirm Modules 1–7 tests remain unaffected (beyond the documented Module 4 correction).

---

## 16. Final Verification

- [ ] Confirm the hopCount design correction is fully applied: grep for any remaining place that persists an incremented `hopCount` on a relaying node's own record.
- [ ] Confirm `markTransferred` timing (post-ack, not post-send) is correct by test, not just by reading the code.
- [ ] Confirm `RoutingScorer` weights are sourced from `LocalConfigRepository`, not hardcoded.
- [ ] Confirm bundle-level cryptographic verification (`DtnEngine.receiveBundle()`) is never bypassed for session-trusted peers.
- [ ] Confirm no Gateway/backend/Supabase awareness exists anywhere in this module.
- [ ] Confirm Modules 1–7 remain correct aside from the documented, deliberate Module 4 correction and Module 7 extension.
- [ ] Record all deviations in `DEVIATIONS.md` before proceeding to the Gateway module.

**Do not proceed to the Gateway module until every checkbox above is confirmed true.**
