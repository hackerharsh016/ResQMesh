# MODULE PROMPT — UI & Advanced Features: Composition Root, Lifecycle, Core Screens

**Project:** Offline Disaster Communication & Delay-Tolerant Emergency Mesh Network (DRM03)
**Protocol:** Emergency Mesh Protocol (EMP) v1.0
**Sequence position:** 11 of N — `UI / Advanced Features` (builds on **all** prior modules — the final module in the build order)
**Status:** Ready for implementation

---

## 1. Module Objective

Every prior module built a piece of a working mesh with no one to turn it on. This module is the **composition root** — the place that instantiates and wires every service into a running app — plus the lifecycle scaffolding (foreground service, scheduled maintenance/sync cycles, permission rationale flows) and the minimal set of citizen-facing screens needed to actually create a report, see what's arrived, see the mesh's health, and control gateway behavior. It exists to turn eleven modules of correct, independently-tested logic into an app a person can actually hold and use during a disaster.

The Authority Dashboard (Next.js, backend-facing) is a **separate application** and entirely out of scope here.

---

## 2. Context & Existing Architecture

Relevant frozen source documents and established context:
- SRS's citizen-facing app requirements (report an incident, see nearby/relevant incidents, see mesh connectivity status, control settings) — cross-check the exact screen/field list against the SRS's UI/functional-requirements section before finalizing field names on the report form; the fields assumed below (`emergencyType`, `severity`, `description`, `location`) are reconstructed from the `EmergencyPayload` shape established in earlier modules, not re-verified against a wireframe.
- Every module's explicit deferrals to "a later/UI-adjacent concern": Module 4 (scheduling `runMaintenanceCycle()`), Module 9 (scheduling `runSyncCycle()`), Module 6/10 (permission-rationale UI), Module 1 (a future "gateway mode" toggle screen). This module is where all of those deferred threads get picked up.

**Required extension to Module 4's `DtnEngine`:**
```typescript
// ADDED to dtn/DtnEngine.ts
export interface DtnEngine {
  // ...existing methods unchanged...
  onBundleAccepted(handler: (bundle: EmergencyBundle) => void): Unsubscribe;
  onBundleStateChanged(handler: (bundleId: string, newState: BundleState) => void): Unsubscribe;
}
```

**Builds on:** literally every previous module. This is intentional and unavoidable for a composition root — the boundary this module must still respect is that it only *wires and calls* other modules' public interfaces; it does not reach into their internals or duplicate their logic.

---

## 3. Responsibilities

This module MUST implement:
1. **Composition root** (`app/bootstrap.ts` or equivalent) — instantiate, in dependency order, every service from Modules 1–10 (`IdentityManager` → repositories → `SecurityService`/`BundleFactory` → `DtnEngine` → `TransportManager` with BLE/Wi-Fi Direct/Wi-Fi Aware registered → `PeerDiscoveryService` → `BundleExchangeCoordinator` → `GatewayService`) and expose a single `startMesh()`/`stopMesh()` pair the rest of the app calls.
2. **Foreground service + scheduling** — an Android foreground service (with a persistent, low-priority notification, per Android's requirement for background BLE/Wi-Fi operation) that keeps the mesh running when the app isn't in the foreground, and a scheduler that periodically triggers `DtnEngine.runMaintenanceCycle()` and `GatewayService.runSyncCycle()` (interval from `LocalConfigRepository`) plus runs `GatewayService.runSyncCycle()` immediately on `ConnectivityMonitor.onConnectivityChanged(true)`.
3. **Permission rationale flow** — before calling any transport's `requestPermissions()`, show the user a plain-language explanation of why (location for BLE/Wi-Fi discovery, Bluetooth, nearby-devices) — a simple sequential flow run once at first launch and re-triggerable from Settings if permissions were denied.
4. **Report/Create Incident screen** — a form backed by `DtnEngine.createLocalBundle()`, with priority selection, emergency type, description, and location capture.
5. **Incident/Message Feed screen** — a read-only list of bundles relevant to this device (received + locally created), subscribing to `DtnEngine.onBundleAccepted`/`onBundleStateChanged` for live updates rather than polling.
6. **Mesh Status screen** — shows currently active sessions/peers (via `PeerDiscoveryService.getActiveSessions()` + `PeerRepository`), per-transport availability, and gateway status (`GatewayService.isGatewayCapable()`).
7. **Settings screen** — gateway-mode toggle (`LocalConfigRepository`), transport enable/disable toggles, and a way to re-run the permission flow.
8. **High-priority notifications** — a local push notification when `DtnEngine.onBundleAccepted` fires for a `CRITICAL`/`HIGH` priority bundle not created locally.

---

## 4. Non-Responsibilities / Scope Boundaries

Do **NOT** implement in this module:
- The Authority Dashboard (separate Next.js app, separate codebase, separate deployment).
- Any new protocol, transport, routing, DTN, or gateway *logic* — this module only calls existing public interfaces from Modules 1–10. If a screen needs data or a decision that doesn't exist yet, that's a sign a lower module is missing something (flag it, don't improvise business logic here).
- Redesigning or second-guessing the routing/priority/eviction policies already built — the UI displays and triggers them, it doesn't reimplement them.
- Full production-grade visual design system (colors, typography, animations) — implement clear, functional, accessible screens; polish is a follow-up pass, not a blocker for this module's completion.

---

## 5. Dependencies

This module MAY use (and is the first module allowed to use) **everything**: Modules 1 through 10's public interfaces, in full.

This module MUST NOT reach past any module's public interface into its internals (e.g., no direct SQLite queries bypassing a repository, no direct native transport calls bypassing `TransportManager`).

---

## 6. Interfaces & Contracts

```typescript
// app/MeshRuntime.ts
export interface MeshRuntime {
  startMesh(): Promise<void>;
  stopMesh(): Promise<void>;
  isRunning(): boolean;
}

// app/scheduler/MaintenanceScheduler.ts
export interface MaintenanceScheduler {
  start(): void;
  stop(): void;
}

// app/permissions/PermissionFlow.ts
export interface PermissionFlowResult {
  granted: boolean;
  deniedPermissions: string[];
}
export interface PermissionFlow {
  run(): Promise<PermissionFlowResult>;
  hasCompletedBefore(): Promise<boolean>;
}
```

Report form fields must map directly onto Module 3's `CreateBundleInput`/`EmergencyPayload` — do not invent form fields with no corresponding protocol field, and do not silently drop a required protocol field from the form.

---

## 7. Implementation Requirements

- **Startup order matters:** `MeshRuntime.startMesh()` must await `IdentityManager.initialize()` before constructing anything that needs `NodeIdentity` (nearly everything), and must call `TransportManager.startAll()` only after all transports are registered — get this sequencing wrong and peer discovery silently never starts.
- **Foreground service notification** must be low-priority/silent (not an alert) since it exists only to satisfy Android's background-operation requirement, not to demand user attention — distinct from the high-priority bundle notifications in §3.8, which should be attention-grabbing.
- **Scheduler intervals** read from `LocalConfigRepository`, with sane defaults (e.g., maintenance every few minutes, sync-on-connectivity plus a periodic fallback) — not hardcoded.
- **Feed screen must not poll** — subscribe to the new `DtnEngine` events (§2) and to `PeerDiscoveryService`'s session events for the Mesh Status screen; only fall back to a manual pull-to-refresh as a supplement, not the primary update mechanism.
- **Permission flow must be re-runnable**, not just a one-time first-launch gate — a user who denied Bluetooth permission initially needs a path from Settings to grant it later without reinstalling.
- **Notifications must respect priority**, per §3.8 — do not notify for every incoming bundle (that would be spammy and desensitizing in an actual emergency context); only `CRITICAL`/`HIGH` and only for bundles not locally originated (a user doesn't need a notification about the report they themselves just filed).

---

## 8. Data Flow

**App launch:**
```
App cold start
        │
        ▼
MeshRuntime.startMesh()
        │
        ├─▶ IdentityManager.initialize()
        ├─▶ Storage migrations (Module 2)
        ├─▶ construct DtnEngine, TransportManager (+ BLE/WiFiDirect/WiFiAware registered),
        │   PeerDiscoveryService, BundleExchangeCoordinator, GatewayService
        ├─▶ PermissionFlow.run() if not completed before
        ├─▶ TransportManager.startAll()
        ├─▶ PeerDiscoveryService.start(), BundleExchangeCoordinator.start(), GatewayService.start()
        ├─▶ start foreground service + MaintenanceScheduler
        │
        ▼
App ready; UI screens subscribe to live events
```

**Report creation:**
```
Report screen form submit
        │
        ▼
DtnEngine.createLocalBundle(input)
        │
        ▼
Feed screen updates via onBundleAccepted (fired for local creation too, or a
separate confirmation path if createLocalBundle's return value is used directly
by the screen that called it — either is acceptable, document which)
```

**Incoming high-priority bundle:**
```
DtnEngine.onBundleAccepted(bundle)
        │
   ┌────┴─────┐
priority ∈ {CRITICAL,HIGH} AND not locally created
   │
   ▼
local notification fired
   │
   ▼
Feed screen updates regardless of priority (all accepted bundles shown there)
```

---

## 9. Error Handling & Edge Cases

- Permission permanently denied ("don't ask again") → `PermissionFlow` must detect this distinct from a simple decline and direct the user to system settings, since re-requesting via the standard API will silently no-op in that state.
- `MeshRuntime.startMesh()` called while already running → idempotent no-op, not a duplicate-service crash.
- Foreground service killed by the OS (aggressive OEM battery management) → on next app foreground, `MeshRuntime` should detect it's not actually running and restart it rather than assuming state from before.
- Report form submitted with missing required fields → validate client-side before calling `createLocalBundle()`; don't rely on `BundleFactory`'s internal checks alone for user-facing error messaging.
- `GatewayService.runSyncCycle()` triggered by the scheduler while a manual one (e.g., user pulled-to-refresh a "sync now" affordance) is already in flight → the scheduler/manual trigger should share one in-flight guard so cycles don't run concurrently and double-count attempts.

---

## 10. Security Requirements

- The report form must not expose or log any other user's data — it only ever constructs a bundle from the current user's own input.
- Notification content for incoming bundles should show enough to be useful (priority, type, rough location) without necessarily including full sensitive incident detail in a lock-screen-visible notification, depending on the device's notification privacy settings — respect the OS's notification privacy categories rather than always showing full content.
- Foreground service notification text should not leak operational/technical details (e.g., internal node IDs) to a casual observer of the user's phone.

---

## 11. Android / React Native Boundary

**TypeScript/React Native side:** all screens, `MeshRuntime`, `MaintenanceScheduler`, `PermissionFlow` orchestration (calling into `PermissionsAndroid`/each transport's `requestPermissions()`), notification triggering via a standard RN notifications library if one exists in the project (inspect first — reuse, don't add a second one).

**Native (Android) side:** the foreground service itself (a proper Android `Service` with `startForeground()` and a notification channel) needs a small native module if the project doesn't already have a foreground-service library integrated — inspect first; only build new native code if nothing suitable already exists in the project's dependencies.

---

## 12. Testing Requirements

**Unit tests:**
- `MeshRuntime.startMesh()` sequencing: verify `IdentityManager.initialize()` is awaited before transport registration, via a mocked dependency chain with call-order assertions.
- `startMesh()` idempotency (double-call doesn't double-construct services).
- `MaintenanceScheduler` fires at the configured interval (fake timers) and respects an in-flight guard against overlapping cycles.
- `PermissionFlow`: granted/denied/permanently-denied paths each produce the correct `PermissionFlowResult`.
- Report form validation rejects incomplete input before calling `createLocalBundle()`.
- Notification triggering logic: fires only for `CRITICAL`/`HIGH` + non-local-origin bundles, verified with a table of priority/origin combinations.

**Integration tests:**
- Full boot sequence against real Modules 1–10 (using Module 5's mock-ether transports in place of real BLE/Wi-Fi for test purposes) — `startMesh()` succeeds, a report created on one simulated device is received and appears in the feed data source on another.

**Manual/device tests:**
- Foreground service survives app backgrounding and is visible in the notification shade.
- Permission rationale flow reads clearly and correctly gates each transport's actual permission request.
- End-to-end on two real devices: create a report on Device A, see it appear (with notification, if high priority) on Device B via whichever transport is available.

---

## 13. Acceptance Criteria

- [ ] `MeshRuntime.startMesh()` correctly sequences every module's startup with no race conditions, verified by test.
- [ ] Feed and Mesh Status screens update via events, not polling.
- [ ] Permission flow handles granted/denied/permanently-denied distinctly and is re-runnable from Settings.
- [ ] Notifications fire only for the correct priority/origin combination.
- [ ] Foreground service keeps the mesh alive in the background on a real device test.
- [ ] `DtnEngine` event extension (§2) is implemented, tested, and recorded in `DEVIATIONS.md`.
- [ ] No business/protocol logic was implemented in this module beyond calling existing module interfaces.

---

## 14. Files / Folder Structure

```
src/
├── dtn/
│   └── DtnEngine.ts                     # EXTEND: onBundleAccepted, onBundleStateChanged
│
├── app/
│   ├── MeshRuntime.ts
│   ├── scheduler/
│   │   └── MaintenanceScheduler.ts
│   ├── permissions/
│   │   └── PermissionFlow.ts
│   ├── notifications/
│   │   └── BundleNotifier.ts
│   └── foreground-service/              # thin wrapper around native/existing library
│
└── screens/
    ├── ReportIncidentScreen.tsx
    ├── FeedScreen.tsx
    ├── MeshStatusScreen.tsx
    └── SettingsScreen.tsx

tests/
├── dtn/
│   └── DtnEngine.events.test.ts
└── app/
    ├── MeshRuntime.test.ts
    ├── MaintenanceScheduler.test.ts
    ├── PermissionFlow.test.ts
    ├── BundleNotifier.test.ts
    └── MeshRuntime.integration.test.ts
```

---

## 15. Implementation Order

1. Add the `DtnEngine` event extension (§2) with its own tests first — the feed/notification work depends on it.
2. Implement `MeshRuntime` composition root and its startup-sequencing tests.
3. Implement `MaintenanceScheduler` and wire it to `DtnEngine.runMaintenanceCycle()`/`GatewayService.runSyncCycle()`.
4. Implement the foreground service wrapper.
5. Implement `PermissionFlow`.
6. Implement `ReportIncidentScreen` (the most directly protocol-connected screen — validates the whole stack end to end for local creation).
7. Implement `FeedScreen` and `BundleNotifier` against the new `DtnEngine` events.
8. Implement `MeshStatusScreen` and `SettingsScreen`.
9. Write remaining unit tests.
10. Write the full-stack integration test using Module 5's mock-ether harness across two simulated devices.
11. Execute manual device tests (foreground service survival, permission flow, real two-device end-to-end).
12. Run the entire project's test suite; confirm all ten prior modules' tests still pass.

---

## 16. Final Verification

- [ ] Confirm this module contains zero reimplemented protocol/routing/DTN/gateway logic — every screen and service call delegates to an existing module's public interface.
- [ ] Confirm the report form's fields were cross-checked against the SRS's actual UI requirements (not left as this prompt's reconstructed placeholder field list) before considering the screen final.
- [ ] Confirm startup sequencing is race-free and idempotent, verified by test.
- [ ] Confirm the `DtnEngine` event extension didn't change the behavior of any existing `DtnEngine` method (regression-test Module 4's suite).
- [ ] Confirm notification logic correctly filters by priority and origin.
- [ ] Confirm the full ten-module + UI stack passes its complete combined test suite.
- [ ] Record all deviations in the final, complete `DEVIATIONS.md` — this document is now the authoritative list of every place the shipped implementation differs from the originally frozen SRS/Protocol Spec/Data Model/Schema, and should be reviewed as a whole before considering the MVP complete.

**This is the final module in the build sequence. Once every checkbox above is confirmed true across all eleven modules, the MVP implementation is complete against the frozen documentation set (plus the documented, deliberate corrections and additions accumulated in `DEVIATIONS.md` along the way).**
