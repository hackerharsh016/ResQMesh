# MODULE PROMPT — DTN Engine: Acceptance Policy, Dedup, TTL/Eviction, Forwarding Candidates

**Project:** Offline Disaster Communication & Delay-Tolerant Emergency Mesh Network (DRM03)
**Protocol:** Emergency Mesh Protocol (EMP) v1.0
**Sequence position:** 4 of N — `DTN Engine` (builds on `Foundation` + `Storage` + `Protocol Primitives`; precedes `Transport Abstraction`)
**Status:** Ready for implementation

---

## 1. Module Objective

This module is the **decision-making brain** of the store-carry-forward system. It answers the questions no lower layer is allowed to answer for itself: *should I accept this bundle someone just handed me? which of my stored bundles am I willing to offer a given peer? is it time to give up on a bundle? do I need to make room?*

It exists to keep protocol *policy* out of Storage (mechanism only, per Module 2) and out of Transport/Routing (which only move bytes and pick peers, per SRS's layering — DTN must not depend on transports or Supabase). Everything in this module is pure decision logic sitting on top of Modules 1–3.

---

## 2. Context & Existing Architecture

Relevant frozen source documents:
- SRS §71–§74 (DTN Engine must depend only on Local DB + protocol primitives — never transports, never Supabase directly).
- SRS §82 (Data Integrity Rules — hopCount monotonic increase, replicationBudget monotonic decrease, expiry never extended, failed transfers never delete the original bundle, dedup by `bundleId`).
- EMP Core Protocol Spec — Bundle state machine: `CREATED → PERSISTED → QUEUED → OFFERED → TRANSFERRED → RELAYED → {DELIVERED, EXPIRED, REJECTED, CANCELLED}`.
- Protocol Data Model doc — `DtnEngine` interface entry (referenced in the architecture overview alongside `ProtocolManager`, `GatewayService`).

**Builds on:**
- Module 1 (`Foundation`): `IdentityManager` — to know the local `nodeId` (needed to decide if a bundle is addressed to "me").
- Module 2 (`Storage`): `BundleRepository`, `SecurityEventRepository`, `ProtocolEventRepository` — this module orchestrates them, never talks to SQLite directly.
- Module 3 (`Protocol Primitives`): `BundleFactory`, `SecurityService.verify()`, `applyHopIncrement`/`applyReplicationDecrement` mutation guards — this module is the primary caller of all three.

**Design decisions made here (not doc conflicts, just choices this module must encode consistently — flag if you'd prefer different defaults):**
1. **Dedup policy:** first-seen `bundleId` wins. A duplicate arrival is rejected outright and the already-stored copy is never overwritten or hop-count-merged. This trivially satisfies the "hopCount only increases" invariant since the stored bundle is never touched by a duplicate receipt.
2. **Hop-limit-at-receipt vs hop-limit-at-relay are different checks:** a bundle arriving with `hopCount` already at/near `maxHopCount` may still be *accepted and stored* (e.g., it might be addressed to this very node, i.e. final delivery) — it is `getForwardingCandidates()`'s job, not `receiveBundle()`'s, to decide whether a stored bundle is still eligible to be offered onward.
3. **Eviction under storage pressure prioritizes protecting higher-priority and not-yet-synced bundles.** Exact thresholds are implementation-tunable via `local_config` (Module 1), not hardcoded.

---

## 3. Responsibilities

This module MUST implement:
1. **`receiveBundle(bundle, senderPublicKey)`** — the single gate a bundle must pass through before it is persisted: dedup check, expiry check, signature/integrity verification (via Module 3), hop-count sanity check, then persist via `BundleRepository.create()` and transition state `CREATED → PERSISTED → QUEUED`.
2. **`createLocalBundle(input)`** — thin wrapper around `BundleFactory.createBundle()` (Module 3) that also persists the result and transitions it to `QUEUED`, so callers (future UI/use-case layer) have one call that both builds and stores a locally originated bundle.
3. **`getForwardingCandidates(peerNodeId, capacity?)`** — returns `BundleSummary[]` for bundles this node is willing to *offer* to a given peer: excludes bundles already confirmed delivered/expired/at hop or replication limit, and (if peer history is available later from Routing) can accept an optional exclusion list of bundle IDs the peer has already indicated it holds (populated by the future Routing/Session module — this module just needs to accept and honor that parameter, not compute it).
4. **`markOffered` / `markTransferred` / `markRelayed` / `markDelivered` / `markRejectedByPeer`** — state transition entry points called by the future Transport/Session layer as a session progresses; each does the corresponding `BundleRepository.markState()` call plus any required side effects (e.g. `markTransferred` calls `applyReplicationDecrement` and persists the new value; `markRelayed` calls `applyHopIncrement`).
5. **`runMaintenanceCycle()`** — periodic sweep: expire bundles past `expiresAt` (`BundleRepository.deleteExpired()`, but only after confirming via priority-aware policy that expiry, not eviction, is the correct action — see §7), and run eviction if storage pressure requires it. Returns a `MaintenanceReport` summarizing what happened (for logging/telemetry, not for UI display — that's a later concern).
6. **Rejection/acceptance telemetry** — every rejection must be logged via `SecurityEventRepository` (for signature/integrity failures) or `ProtocolEventRepository` (for dedup/expiry/capacity rejections), so later debugging/telemetry has a trail.

---

## 4. Non-Responsibilities / Scope Boundaries

Do **NOT** implement in this module:
- Routing score calculation or next-hop peer selection (Routing Engine module) — this module only decides *what's eligible to be offered*, not *to whom specifically it should be prioritized*.
- Any BLE/Wi-Fi/session/handshake code (Transport + Routing/Session modules) — this module has no knowledge of `MeshTransport` or `ProtocolSession`.
- Gateway sync / backend upload decisions (Gateway Service module) — this module does not touch `sync_queue` or know what Supabase is.
- Scheduling *when* `runMaintenanceCycle()` is called (app lifecycle/background task wiring is a later/UI-adjacent concern) — this module only implements what the cycle does when invoked.
- Any UI.

---

## 5. Dependencies

This module MAY use:
- Module 1: `IdentityManager`, `LocalConfigRepository` (for tunable eviction/maintenance thresholds).
- Module 2: `BundleRepository`, `SecurityEventRepository`, `ProtocolEventRepository`.
- Module 3: `BundleFactory`, `SecurityService`, `applyHopIncrement`, `applyReplicationDecrement`, protocol constants.

This module MUST NOT depend on: `MeshTransport`, `TransportManager`, `RoutingEngine`, `GatewayService`, `ProtocolSession`, or any UI package. If implementing this module makes you feel like you need to know about BLE or Supabase, stop — that dependency direction is backwards per SRS §71–§74.

---

## 6. Interfaces & Contracts

```typescript
// dtn/types.ts

export enum RejectionReason {
  DUPLICATE = "DUPLICATE",
  EXPIRED = "EXPIRED",
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  INTEGRITY_MISMATCH = "INTEGRITY_MISMATCH",
  HOP_LIMIT_EXCEEDED = "HOP_LIMIT_EXCEEDED",
  MALFORMED = "MALFORMED",
  STORAGE_FULL = "STORAGE_FULL",
}

export interface AcceptanceResult {
  accepted: boolean;
  bundle?: EmergencyBundle;   // present only when accepted
  reason?: RejectionReason;   // present only when rejected
}

export interface MaintenanceReport {
  expiredCount: number;
  evictedCount: number;
  remainingCount: number;
  ranAt: number;
}

// dtn/DtnEngine.ts
export interface DtnEngine {
  createLocalBundle(input: CreateBundleInput): Promise<EmergencyBundle>;
  receiveBundle(bundle: EmergencyBundle, senderPublicKey: string): Promise<AcceptanceResult>;
  getForwardingCandidates(
    peerNodeId: string,
    opts?: { capacity?: number; excludeBundleIds?: string[] }
  ): Promise<BundleSummary[]>;
  markOffered(bundleId: string, peerNodeId: string): Promise<void>;
  markTransferred(bundleId: string, peerNodeId: string): Promise<void>;
  markRelayed(bundleId: string): Promise<void>;
  markDelivered(bundleId: string): Promise<void>;
  markRejectedByPeer(bundleId: string, peerNodeId: string, reason?: string): Promise<void>;
  runMaintenanceCycle(): Promise<MaintenanceReport>;
}
```

Cross-check `EmergencyBundle`, `BundleSummary`, `CreateBundleInput`, `BundleState` against Modules 2/3's already-established definitions — do not redefine them here.

---

## 7. Implementation Requirements

**`receiveBundle()` gate, in this exact order (fail fast, cheapest checks first):**
1. Basic structural validation (required fields present) → `MALFORMED` if not.
2. Expiry check (`bundle.expiresAt < Date.now()`) → `EXPIRED` if already expired; do not persist.
3. Dedup check (`BundleRepository.getById(bundle.bundleId)` already exists) → `DUPLICATE`; do not overwrite.
4. Hop sanity check (`bundle.hopCount > bundle.maxHopCount`) → `HOP_LIMIT_EXCEEDED` (this should only happen if a misbehaving/buggy peer sent something invalid, since relays should never increment past the limit and still send).
5. Signature + integrity verification via `SecurityService.verify()` → `INVALID_SIGNATURE` or `INTEGRITY_MISMATCH` on failure; log via `SecurityEventRepository`.
6. Storage capacity check — if the local store is at its configured limit, attempt eviction (see below) before rejecting with `STORAGE_FULL`.
7. Persist via `BundleRepository.create()`, transition `CREATED → PERSISTED → QUEUED`, return `{ accepted: true, bundle }`.

**Eviction policy (`runMaintenanceCycle()` and the on-demand path in step 6 above share this logic — implement once, call from both places):**
- Never evict a bundle whose priority is `CRITICAL` unless every stored bundle is `CRITICAL` (then evict the soonest-to-expire `CRITICAL` bundle only as an absolute last resort, and log this loudly via `ProtocolEventRepository` — this is a degraded-mode condition worth surfacing later in UI/telemetry).
- Prefer evicting, in order: already-`DELIVERED` bundles past a grace period → `LOW` priority bundles closest to expiry → `MEDIUM` priority bundles closest to expiry → then escalate.
- If the *incoming* bundle (in the receive path) is lower priority than everything currently evictable, and eviction still wouldn't free enough room, reject the incoming bundle with `STORAGE_FULL` rather than evict something more important to make room for something less important.
- Read the storage limit and grace-period thresholds from `LocalConfigRepository` (Module 1) — do not hardcode.

**`getForwardingCandidates()`:**
- Filter to bundles where `state` is in `{QUEUED, OFFERED, TRANSFERRED}` (i.e., not yet terminal) AND `hopCount < maxHopCount` AND `replicationBudget > 0` AND not in the caller-supplied `excludeBundleIds`.
- Order by the same priority-then-expiry rule as `BundleRepository.getPending()` (Module 2) — reuse that method's ordering rather than reimplementing it; do not invent a second sort order.
- Respect `capacity` if provided (return at most that many).

**State-transition methods (`markOffered`, etc.):**
- `markRelayed(bundleId)` must call `applyHopIncrement` (Module 3) and persist the result via `BundleRepository.incrementHop()` — do not manually increment the field elsewhere.
- `markTransferred(bundleId, peerNodeId)` must call `applyReplicationDecrement` and persist via `BundleRepository.decrementReplicationBudget()`.
- `markDelivered(bundleId)` is terminal — no further replication/relay should occur for this bundle afterward; `getForwardingCandidates()`'s state filter in the point above already excludes it once its state is updated.
- `markRejectedByPeer` does **not** mark the bundle itself as terminal (a rejection by one peer doesn't mean the bundle is undeliverable overall) — it should just be logged (`ProtocolEventRepository`) for future routing-history use (Routing Engine module will read this history later; this module just needs to write it).

---

## 8. Data Flow

**Receive path (entry point called later by Transport/Session layer once it decodes a `BUNDLE_DATA` message):**
```
Transport/Session layer (future module) decodes BundleDataMessage
        │
        ▼
DtnEngine.receiveBundle(bundle, senderPublicKey)
        │
        ├─▶ structural/expiry/dedup/hop checks
        ├─▶ SecurityService.verify()
        ├─▶ capacity check + eviction if needed
        │
        ▼
BundleRepository.create() → state PERSISTED → QUEUED
        │
        ▼
AcceptanceResult returned to caller
```

**Local creation path:**
```
Caller (future UI/use-case layer)
        │
        ▼
DtnEngine.createLocalBundle(input)
        │
        ▼
BundleFactory.createBundle() [Module 3, includes signing]
        │
        ▼
BundleRepository.create() → state QUEUED
```

**Forwarding query path (called later by Routing/Session when a session with a peer is active):**
```
Routing/Session layer (future module)
        │
        ▼
DtnEngine.getForwardingCandidates(peerNodeId, opts)
        │
        ▼
BundleRepository query (priority+expiry ordered, filtered)
        │
        ▼
BundleSummary[] returned
```

**Maintenance path (invoked by whatever scheduler a later module wires up):**
```
Scheduler tick
        │
        ▼
DtnEngine.runMaintenanceCycle()
        │
        ├─▶ BundleRepository.deleteExpired()
        ├─▶ eviction pass if over capacity
        │
        ▼
MaintenanceReport returned
```

---

## 9. Error Handling & Edge Cases

- Two peers deliver the same bundle to this node concurrently (race) → rely on Module 2's `DuplicateBundleError` from a concurrent `create()` call as the final authority; the earlier `getById()` dedup check is a fast-path optimization, not the sole guarantee — catch `DuplicateBundleError` from `create()` and translate it into a `DUPLICATE` `AcceptanceResult` rather than letting it throw uncaught.
- `SecurityService.verify()` throws (native timeout/error) rather than returning `false` → treat as `INVALID_SIGNATURE` (reject-by-default per Module 3's security posture), do not let the exception propagate as an unhandled rejection.
- `runMaintenanceCycle()` invoked while storage is empty → returns a report with all-zero counts, does not error.
- Eviction pass cannot free enough space even after exhausting the priority ladder (pathological case: store full of undelivered `CRITICAL` bundles) → the incoming/new bundle is rejected with `STORAGE_FULL`; this must be logged clearly since it represents a real operational problem (approaching capacity in a disaster scenario), not silently swallowed.
- `markTransferred`/`markRelayed` called for a `bundleId` that no longer exists locally (e.g., already evicted by a race with maintenance) → no-op with a logged warning, not a thrown error — the session layer calling this shouldn't crash because local state churned.

---

## 10. Security Requirements

- Every rejected bundle due to `INVALID_SIGNATURE` or `INTEGRITY_MISMATCH` must be logged via `SecurityEventRepository`, including the claimed `senderPublicKey`/origin, so repeated forgery attempts from a given peer are visible to later peer-trust/reputation logic (Routing Engine, later).
- `receiveBundle()` must never persist a bundle before signature verification succeeds — verification order in §7 is mandatory, not just a suggestion.
- This module must not weaken verification results — e.g., no "accept anyway if verification fails but everything else looks fine" fallback, ever.

---

## 11. Android / React Native Boundary

This module is **entirely TypeScript** — pure business logic with no native code. It only calls into the native-backed `SecurityService` (Module 3) as an opaque async dependency; it has no awareness of Keystore, BLE, or any Android API.

---

## 12. Testing Requirements

**Unit tests (with `BundleRepository`, `SecurityService`, `BundleFactory` mocked/faked — this module's tests should not require a real SQLite instance):**
- `receiveBundle()`: accepted case (valid, non-duplicate, non-expired, verified) persists and returns `accepted: true`.
- `receiveBundle()`: each rejection reason (`EXPIRED`, `DUPLICATE`, `INVALID_SIGNATURE`, `INTEGRITY_MISMATCH`, `HOP_LIMIT_EXCEEDED`, `MALFORMED`) individually triggers the correct `AcceptanceResult`, and none of them call `BundleRepository.create()`.
- `receiveBundle()` under `STORAGE_FULL`: verify eviction is attempted first, and only rejects if eviction can't free room; verify `CRITICAL` bundles are never evicted while non-`CRITICAL` alternatives exist.
- `getForwardingCandidates()`: excludes delivered/expired/at-limit bundles; respects `capacity` and `excludeBundleIds`; ordering matches priority-then-expiry.
- `markRelayed`/`markTransferred`: correctly call the corresponding mutation guard and repository method exactly once each.
- `runMaintenanceCycle()`: expired bundles are removed; eviction ladder order is respected in a mixed-priority test store.

**Integration tests (real Module 2 repositories, in-memory/temp SQLite):**
- End-to-end: `createLocalBundle()` → `getForwardingCandidates()` includes it → `markOffered` → `markTransferred` → `markRelayed` → verify final stored state and `hopCount`/`replicationBudget` values are correct.
- End-to-end receive: construct a validly signed bundle (using Module 3's real `BundleFactory`/`SecurityService`), feed it through `receiveBundle()`, confirm it's queryable afterward and forwarding-eligible.

---

## 13. Acceptance Criteria

- [ ] All rejection reasons in §6 are reachable and individually tested.
- [ ] `receiveBundle()` never persists before successful verification (verified by test ordering, not just by reading the code).
- [ ] Eviction never removes a `CRITICAL` bundle while a lower-priority alternative exists in the store.
- [ ] `getForwardingCandidates()` ordering exactly matches `BundleRepository.getPending()`'s priority/expiry rule (no divergent sort logic).
- [ ] State transitions (`markOffered`→`markTransferred`→`markRelayed`→`markDelivered`) correctly update `hopCount`/`replicationBudget`/`state` with no double-application of mutation guards.
- [ ] Zero references to `MeshTransport`, `ProtocolSession`, `GatewayService`, or any Supabase/network client anywhere in this module.
- [ ] Concurrent duplicate receipt (race test) results in exactly one stored copy, no crash.

---

## 14. Files / Folder Structure

```
src/
└── dtn/
    ├── types.ts                 # RejectionReason, AcceptanceResult, MaintenanceReport
    ├── DtnEngine.ts              # interface + implementation (or split into DtnEngine.ts + DtnEngineImpl.ts if the project's convention elsewhere does that — check Modules 1–3's pattern and match it)
    ├── evictionPolicy.ts         # isolated, independently testable eviction ladder logic
    └── acceptancePolicy.ts       # isolated, independently testable receiveBundle() gate logic (composed into DtnEngine)

tests/
└── dtn/
    ├── DtnEngine.test.ts
    ├── evictionPolicy.test.ts
    ├── acceptancePolicy.test.ts
    └── DtnEngine.integration.test.ts
```

---

## 15. Implementation Order

1. Inspect Modules 1–3's file/interface conventions to keep this module stylistically consistent (e.g., is logic split into small pure-function files or class-based services elsewhere?).
2. Implement `acceptancePolicy.ts` (the `receiveBundle()` gate as a pure/testable function set) with mocked dependencies first — get all rejection-reason unit tests passing before touching real storage.
3. Implement `evictionPolicy.ts` in isolation with its own unit tests (mixed-priority store fixtures).
4. Wire both into `DtnEngine.ts` along with `createLocalBundle`, `getForwardingCandidates`, and the `mark*` transition methods.
5. Add `runMaintenanceCycle()` combining expiry sweep + eviction policy.
6. Write remaining unit tests against the assembled `DtnEngine`.
7. Write integration tests against real Module 2 repositories and Module 3 signing.
8. Run full suite; confirm Modules 1–3 tests remain unaffected.

---

## 16. Final Verification

- [ ] Confirm SRS §71–§74 layering is respected: this module has no import, direct or transitive, of anything transport/routing/gateway/UI-related.
- [ ] Confirm every hard invariant from SRS §82 (hopCount monotonic increase, replicationBudget monotonic decrease, expiry never extended, dedup by bundleId, failed transfers never delete the original) is enforced somewhere in this module's logic and covered by a test.
- [ ] Confirm eviction policy thresholds are read from `LocalConfigRepository`, not hardcoded.
- [ ] Confirm no duplicate/divergent sort-order implementation exists between this module and Module 2's `getPending()`.
- [ ] Confirm all rejection paths log via the correct repository (`SecurityEventRepository` for crypto failures, `ProtocolEventRepository` for everything else).
- [ ] Record any deviation in `DEVIATIONS.md` (append to the running log from Modules 1–3) before proceeding to the Transport Abstraction module.

**Do not proceed to the Transport Abstraction module until every checkbox above is confirmed true.**
