# MODULE PROMPT — Gateway Service: Detection, Sync Queue & Backend Upload

**Project:** Offline Disaster Communication & Delay-Tolerant Emergency Mesh Network (DRM03)
**Protocol:** Emergency Mesh Protocol (EMP) v1.0
**Sequence position:** 9 of N — `Gateway` (builds on everything through `Routing`; precedes `Advanced Transports`/UI)
**Status:** Ready for implementation

---

## 1. Module Objective

This module is the **only** place in the mobile app that knows Supabase exists. It watches for internet connectivity, decides whether this device can act as a gateway, drains the `sync_queue` of internet-bound bundles to the backend when online, and is the sole reason `is_gateway`/`NodeCapabilities.gateway` ever becomes `true` instead of the placeholder `false` Module 1 stubbed in. It exists so SRS's hard requirement — DTN Engine and Routing must never depend on Supabase directly — is actually true in the code, not just in the diagram.

---

## 2. Context & Existing Architecture

Relevant frozen source documents and established context:
- SRS §71–§74 (layering: only Gateway Service touches the backend; DTN/Routing route *toward* gateway-capable peers via `Peer.isGateway`, they never talk to Supabase themselves).
- SRS §43/§82 (backend upload must be idempotent on `bundleId` — a hard invariant established from the initial architecture read).
- Protocol Data Model doc — `sync_queue` table and `GatewaySyncItem`/`SyncStatus` types (Module 2).
- **Gap flagged above:** no frozen backend/Postgres schema exists in the provided documentation. This module's `BackendClient` payload contract is this module's own provisional design, not a cross-checked frozen contract — mark it clearly as such in code comments so it's the first thing revisited once a backend schema doc is available.

**Builds on:**
- Module 1: `IdentityManager`, `LocalConfigRepository` (gateway-mode toggle, sync interval/backoff parameters).
- Module 2: `SyncQueueRepository`, `BundleRepository`, `PeerRepository` (to update the local node's own `is_gateway` flag isn't applicable — that's per-peer data about *others*; this node's own gateway status is exposed via `NodeCapabilities`, not `PeerRepository`).
- Module 3: `EmergencyBundle`, `DestinationType` (cross-check the exact enum member name for "internet/gateway-bound" — used as a placeholder `DestinationType.GATEWAY` below; confirm against Module 3/Data Model doc's actual naming before finalizing).
- Module 4: `DtnEngine` — this module calls `markDelivered()` on confirmed backend receipt for gateway-destined bundles; it does not reach into `BundleRepository` directly.
- Module 7/8: `NodeCapabilities.gateway` is currently hardcoded `false` (Module 1 placeholder) — this module provides the live value; whichever module constructs the outgoing `HelloMessage` (Module 7) must read it from here going forward, not from a static stub.

---

## 3. Responsibilities

This module MUST implement:
1. **`ConnectivityMonitor`** — wraps the app's network-connectivity check (native/RN connectivity API) into `isOnline(): Promise<boolean>` and an `onConnectivityChanged` event.
2. **`GatewayService`** — the orchestrator: decides current gateway-capability (`isOnline() && local_config gateway-mode enabled`), exposes this as the live value for `NodeCapabilities.gateway`, enqueues internet-bound bundles into `sync_queue` when handed one, and runs sync cycles that upload queued bundles when online.
3. **`BackendClient`** — the actual Supabase HTTP call(s): upload a bundle, receive a server receipt ID, handle idempotent-retry semantics on the client side (don't re-upload something already marked `SYNCED` locally).
4. **Retry/backoff** — failed uploads get `attempts` incremented, `lastError` recorded, and `nextAttemptAt` computed via exponential backoff (capped), all persisted through `SyncQueueRepository` (Module 2), read from `LocalConfigRepository` for tunable parameters.
5. **Enqueue trigger wiring** — whichever module currently decides a bundle is gateway-bound (Module 4's `receiveBundle`/`createLocalBundle`, based on `bundle.destinationType`) must call this module's `enqueueForSync(bundleId)`. Add this as a small integration call in Module 4 (documented addition, not new business logic in Module 4 itself — Module 4 just calls out to this module's public method when it sees a gateway-destined bundle land in `QUEUED` state).

---

## 4. Non-Responsibilities / Scope Boundaries

Do **NOT** implement in this module:
- Any mesh routing logic that gets a bundle *from origin to a gateway-capable peer* — that's already handled by Module 8's `RoutingScorer` favoring `peer.isGateway`. This module only handles the last leg: gateway device → backend.
- Multi-hop backward propagation of delivery confirmation across the mesh back to the original sender — genuinely hard in a DTN with no guaranteed return path. Implement **only** a best-effort, single-hop opportunistic notification (see §7) if the origin happens to still be in an active session with this gateway at the moment of confirmed upload; do not build a general backward-routing mechanism.
- The Next.js Authority Dashboard itself (separate application, out of this mobile codebase entirely).
- Any UI in the mobile app (a future "gateway mode" toggle screen is a later/UI-adjacent concern; this module just reads/writes the underlying `local_config` value).
- Bundle creation, signing, or verification (Modules 3–4).

---

## 5. Dependencies

This module MAY use:
- Module 1: `LocalConfigRepository` (gateway-mode toggle, sync interval, backoff parameters), `IdentityManager` (for any node-identifying metadata the backend payload needs).
- Module 2: `SyncQueueRepository`, `BundleRepository` (read-only, to fetch full bundle content for upload).
- Module 3: `EmergencyBundle`, `DestinationType`.
- Module 4: `DtnEngine.markDelivered()`.
- A network/HTTP client already present in the project (inspect first — reuse whatever the project uses for HTTP, e.g. `fetch` or an existing Supabase JS client, do not add a second one).

This module MUST NOT depend on: `TransportManager`/BLE/Wi-Fi internals, `RoutingScorer`, or UI. (The one narrow exception — the best-effort opportunistic backward-ack in §7 — depends only on `TransportManager.send()` for an already-identified peer, not on any transport-specific code.)

---

## 6. Interfaces & Contracts

```typescript
// gateway/ConnectivityMonitor.ts
export interface ConnectivityMonitor {
  isOnline(): Promise<boolean>;
  onConnectivityChanged(handler: (online: boolean) => void): Unsubscribe;
}

// gateway/BackendClient.ts
export interface BundleUploadPayload {
  // PROVISIONAL — no frozen backend schema exists in the provided docs.
  // Mirrors EmergencyBundle; revisit against a real backend schema doc when available.
  bundleId: string;
  originNodeId: string;
  incidentId?: string;
  payloadType: string;
  priority: string;
  createdAt: number;
  payload: EmergencyPayload;
  security: SecurityMetadata;
  protocolVersion: string;
}

export interface BackendClient {
  uploadBundle(payload: BundleUploadPayload): Promise<{ serverReceiptId: string }>;
}

// gateway/GatewayService.ts
export interface SyncCycleReport {
  attempted: number;
  succeeded: number;
  failed: number;
  ranAt: number;
}

export interface GatewayService {
  start(): Promise<void>;
  stop(): Promise<void>;

  isGatewayCapable(): Promise<boolean>;
  enqueueForSync(bundleId: string): Promise<void>;
  runSyncCycle(): Promise<SyncCycleReport>;
}
```

Cross-check `SyncQueueRepository`/`GatewaySyncItem`/`SyncStatus` against Module 2's existing definitions — extend, don't duplicate.

---

## 7. Implementation Requirements

- `isGatewayCapable()` = `ConnectivityMonitor.isOnline() AND LocalConfigRepository.get('gatewayModeEnabled') !== 'false'` (default enabled unless explicitly turned off — confirm this default against SRS if it specifies one; otherwise "on by default" is this module's reasonable choice, document it).
- The live `NodeCapabilities.gateway` value must be sourced from `GatewayService.isGatewayCapable()` at the moment a `HelloMessage` is constructed (Module 7) — this module exposes a synchronous-friendly cached value (updated on every `onConnectivityChanged` event) rather than forcing Module 7 to `await` a fresh check on every handshake, since handshakes should stay fast.
- `enqueueForSync(bundleId)` must be idempotent — calling it twice for the same `bundleId` must not create duplicate `sync_queue` rows (the table's primary key on `bundle_id` already enforces this at the storage layer; this method should treat a duplicate-key result as a no-op success, not an error).
- `runSyncCycle()`: only proceeds if `isGatewayCapable()`; fetches `SyncQueueRepository.getWaiting()`, uploads each via `BackendClient.uploadBundle()`, and on success updates status to `SYNCED` with the returned `serverReceiptId`, then calls `DtnEngine.markDelivered(bundleId)` **only if** `bundle.destinationType === DestinationType.GATEWAY` (i.e., the backend upload itself constitutes final delivery for this bundle — a bundle merely relayed *through* a gateway toward a specific mesh destination node is a different case and must not be marked delivered here).
- Backoff: `nextAttemptAt = now + min(maxBackoffMs, baseBackoffMs * 2^attempts)`, parameters from `LocalConfigRepository`.
- **Best-effort opportunistic backward ack (optional, document as best-effort in code):** immediately after a successful upload, check whether `bundle.originNodeId` is currently reachable (`TransportManager.getAvailableTransports(originNodeId).length > 0`); if so, send a `BundleAckMessage{ bundleId, ackType: DELIVERED }` directly. If not reachable, do nothing further — no queuing, no retry, no general backward-routing mechanism. This is a nice-to-have UX improvement for the common case where origin and gateway are still in contact, not a delivery guarantee.

---

## 8. Data Flow

**Enqueue (triggered from Module 4):**
```
DtnEngine (createLocalBundle / receiveBundle) sees destinationType === GATEWAY
        │
        ▼
GatewayService.enqueueForSync(bundleId)
        │
        ▼
SyncQueueRepository.enqueue({ bundleId, status: WAITING, ... })
```

**Sync cycle (triggered by connectivity change or periodic scheduler — scheduling itself wired by a later/app-lifecycle concern, this module just implements what happens when called):**
```
ConnectivityMonitor: online
        │
        ▼
GatewayService.runSyncCycle()
        │
        ▼
SyncQueueRepository.getWaiting()
        │
        ▼  (per bundle)
BundleRepository.getById(bundleId) → build BundleUploadPayload
        │
        ▼
BackendClient.uploadBundle(payload)
        │
   ┌────┴────┐
 success    failure
   │            │
   ▼            ▼
SyncQueueRepository.updateStatus(SYNCED, serverReceiptId)   SyncQueueRepository.updateStatus(FAILED, attempts+1, nextAttemptAt)
   │
   ▼
DtnEngine.markDelivered(bundleId)   [only if destinationType === GATEWAY]
   │
   ▼
(best-effort) check origin reachable → send DELIVERED ack directly
```

---

## 9. Error Handling & Edge Cases

- Connectivity flickers online→offline mid-`runSyncCycle()` → in-flight upload calls that fail due to the drop are treated as ordinary upload failures (retry/backoff per §7), not a special case; the cycle simply stops attempting further items once `isOnline()` is rechecked and found false (check before each item, not just once at cycle start, since a cycle may process many queued items over a non-trivial duration).
- Backend returns a duplicate/already-exists response for a `bundleId` (another gateway device already uploaded it first) → treat as success (idempotent upload, per the stated invariant) — mark `SYNCED` locally using whatever receipt info the backend returns, do not treat this as an error.
- `BundleRepository.getById(bundleId)` returns `null` for a queued sync item (bundle was evicted locally by the DTN Engine's storage-pressure eviction before it could sync — a real possible race between Modules 4 and 9) → remove the orphaned `sync_queue` entry rather than retrying forever against a bundle that no longer exists; log this via `ProtocolEventRepository` since losing an unsynced bundle to local eviction is worth knowing about operationally.
- Upload succeeds but the local `markDelivered` call fails (e.g., app killed between the two) → on next app start, a reconciliation pass should check `sync_queue` entries already `SYNCED` whose corresponding bundle isn't yet `DELIVERED` locally, and complete the `markDelivered` call — implement this as part of `start()`'s startup routine, not as a one-off manual fix.
- Repeated upload failures exceeding a configurable max-attempts ceiling → stop retrying automatically (mark a distinct `EXHAUSTED` status if `SyncStatus` supports adding one, or otherwise stay `FAILED` with a very long `nextAttemptAt`) rather than retrying forever with linearly-growing backoff past a reasonable point — confirm/extend `SyncStatus` enum in Module 2 if needed, documenting the addition.

---

## 10. Security Requirements

- All backend calls must use HTTPS; do not send bundle payloads over plaintext HTTP under any circumstance.
- `BundleUploadPayload` includes the bundle's existing `security.signature`/`integrityHash` unmodified — the backend is expected to be able to verify authenticity independently using the same public key infrastructure; this module does not strip or alter security metadata before upload.
- Do not log full `BundleUploadPayload` contents (may contain sensitive incident/location data) at a persistent log level — log `bundleId`, upload outcome, and HTTP status only.
- Any Supabase API key/credential must come from the project's existing secure config mechanism (inspect how other backend credentials, if any, are currently handled in the repo) — never hardcode a key in this module's source.

---

## 11. Android / React Native Boundary

**TypeScript/React Native side:** `GatewayService`, `BackendClient` (HTTP calls via `fetch` or the project's existing HTTP/Supabase client), retry/backoff logic, sync queue orchestration.

**Native (Android) side:** connectivity detection may already be covered by an existing React Native community module (e.g. NetInfo) if present in the project — inspect first and reuse rather than writing a new native bridge for connectivity; only add native code here if no connectivity-detection capability already exists in the project.

---

## 12. Testing Requirements

**Unit tests (with `SyncQueueRepository`, `BundleRepository`, `BackendClient`, `DtnEngine`, `ConnectivityMonitor` mocked):**
- `runSyncCycle()` uploads all waiting items when online, updates status correctly on success/failure.
- Backoff calculation produces the expected `nextAttemptAt` progression across repeated failures, capped at the configured maximum.
- `markDelivered` is called only for `destinationType === GATEWAY` bundles, never for mesh-destined ones merely passing through.
- Duplicate/already-exists backend response is treated as success, not failure.
- Orphaned `sync_queue` entry (bundle no longer exists locally) is cleaned up rather than retried forever.
- Connectivity drop mid-cycle halts further attempts without crashing.
- Startup reconciliation: a `SYNCED` sync-queue item whose bundle isn't yet `DELIVERED` locally gets `markDelivered` called on `start()`.

**Integration tests:**
- With a fake in-memory `BackendClient` and real Module 2 repositories: enqueue → sync cycle → confirm final `bundles.state` and `sync_queue.status` are consistent.

---

## 13. Acceptance Criteria

- [ ] `GatewayService` is the only module with any reference to Supabase/backend HTTP calls (grep-checked).
- [ ] `NodeCapabilities.gateway` reflects live connectivity + config state, not the Module 1 hardcoded `false`.
- [ ] Idempotent enqueue and idempotent backend upload handling both verified by test.
- [ ] Backoff/retry ceiling behaves correctly and is config-driven.
- [ ] `markDelivered` destination-type gating verified by test.
- [ ] Best-effort opportunistic backward ack is clearly documented as best-effort (no retry/queue) in code comments and covered by at least one test of the "origin reachable" and "origin not reachable" paths.
- [ ] Startup reconciliation pass implemented and tested.

---

## 14. Files / Folder Structure

```
src/
├── gateway/
│   ├── types.ts                    # SyncCycleReport
│   ├── ConnectivityMonitor.ts
│   ├── BackendClient.ts            # PROVISIONAL payload shape — flagged in comments
│   └── GatewayService.ts
│
├── discovery/
│   └── (Module 7's HelloMessage construction) — UPDATE to read GatewayService.isGatewayCapable() cached value instead of the Module 1 stub
│
└── dtn/
    └── DtnEngine.ts                 # UPDATE: call GatewayService.enqueueForSync() when a GATEWAY-destined bundle reaches QUEUED

tests/
└── gateway/
    ├── GatewayService.test.ts
    ├── BackendClient.test.ts
    └── GatewayService.integration.test.ts
```

---

## 15. Implementation Order

1. Implement `ConnectivityMonitor` (reusing an existing project dependency if one exists).
2. Implement `BackendClient` against the provisional payload contract, clearly flagged.
3. Implement `GatewayService` core (`isGatewayCapable`, `enqueueForSync`, `runSyncCycle`, backoff).
4. Wire Module 7's `HelloMessage` construction to read the live capability value.
5. Wire Module 4's bundle-acceptance/creation path to call `enqueueForSync()` for gateway-destined bundles.
6. Implement startup reconciliation pass.
7. Implement the best-effort opportunistic backward ack.
8. Write unit tests, then the integration test with a fake `BackendClient`.
9. Run full suite; confirm Modules 1–8 tests remain unaffected beyond the two small, documented integration points.

---

## 16. Final Verification

- [ ] Confirm zero Supabase/backend references exist outside this module.
- [ ] Confirm `DestinationType.GATEWAY` (or whatever its actual frozen name is — corrected from this prompt's placeholder if different) is the sole gate for both `enqueueForSync` triggering and `markDelivered` eligibility.
- [ ] Confirm the backend payload contract is clearly marked provisional in code comments, pending a real backend schema document.
- [ ] Confirm the opportunistic backward-ack path never blocks or retries — it's fire-and-forget by design.
- [ ] Confirm Modules 1–8 remain correct aside from the two small, documented integration touchpoints (Module 4's enqueue call, Module 7's capability read).
- [ ] Record all deviations and the provisional-schema caveat in `DEVIATIONS.md` before proceeding to Advanced Transports / UI.

**Do not proceed to the next module until every checkbox above is confirmed true.**
