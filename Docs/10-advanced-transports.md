# MODULE PROMPT — Advanced Transports: Wi-Fi Direct & Wi-Fi Aware

**Project:** Offline Disaster Communication & Delay-Tolerant Emergency Mesh Network (DRM03)
**Protocol:** Emergency Mesh Protocol (EMP) v1.0
**Sequence position:** 10 of N — `Advanced Transports` (builds on everything through `Gateway`; precedes `UI / Advanced Features`)
**Status:** Ready for implementation

---

## 1. Module Objective

This module adds two more concrete `MeshTransport` implementations — Wi-Fi Direct and Wi-Fi Aware — so that when both peers' hardware supports them, large bundles move over a real IP socket instead of being chunked through BLE's tiny MTU. It exists purely for graceful-degradation bandwidth upgrade: SRS establishes BLE as the mandatory baseline (Module 6) and these two as optional upgrades when available. Nothing above `TransportManager` needs to change — Module 5's transport-selection logic (prefer the connected transport with the largest `getMaxMessageSize()`) already knows what to do with a second, faster transport once it's registered.

---

## 2. Context & Existing Architecture

Relevant frozen source documents and established context:
- SRS §20–§23 (BLE mandatory; Wi-Fi Direct and Wi-Fi Aware as graceful-degradation upgrades for larger/faster transfers when hardware/OS support exists).
- Module 5's `MeshTransport` interface — this module's contract, implemented twice more.
- Module 6's chunking work — **a different problem, not reused verbatim** (see §3.2): BLE fragments one logical message into many small GATT writes because its MTU is tiny; Wi-Fi Direct/Aware run over IP sockets where the constraint is stream framing (knowing where one message ends and the next begins), not payload-size fragmentation. Do not force-fit Module 6's `Chunker`/`Reassembler` onto a socket transport — build the simpler primitive this actually needs.

**Cross-check required before finalizing:** if the EMP spec fixes a specific Wi-Fi Aware service name or any Wi-Fi Direct group-role policy, use it verbatim. The placeholder `WIFI_AWARE_SERVICE_NAME` below must be replaced if the spec defines one; if not, this module's own choice is fine and should be documented as original, not reconstructed.

**Builds on:** Module 5's `MeshTransport`/`TransportManager`/error classes (unchanged — no new extensions needed this time), Module 1's `LocalConfigRepository` (max message size ceiling via `max_bundle_size`, connection timeout parameters).

---

## 3. Responsibilities

This module MUST implement:
1. **`WifiDirectTransport`** — `MeshTransport` implementation using Android's `WifiP2pManager`: peer discovery, group formation (device may become group owner or client), and a TCP socket data path between the two once the group forms.
2. **`WifiAwareTransport`** — `MeshTransport` implementation using Android's `WifiAwareManager`: publish/subscribe-based discovery, then a Wi-Fi Aware data-path (also resolves to a socket) for data exchange.
3. **`StreamFramer`** (shared by both) — a simple length-prefixed framing primitive: a 4-byte big-endian length header followed by that many payload bytes, so a single logical `ProtocolMessage` payload can be reliably extracted from a byte stream that may deliver it in one chunk or split arbitrarily across multiple socket reads.
4. **Hardware/API capability detection** — `isSupported()` for each transport must check both Android API level and the specific hardware feature flag (`PackageManager.FEATURE_WIFI_DIRECT` / `FEATURE_WIFI_AWARE`) before claiming support; do not assume availability from API level alone.
5. **Concurrency-limit handling appropriate to each transport** — Wi-Fi Direct can only maintain **one active group (one peer connection) at a time** per device (a hard Android platform limitation, more restrictive than BLE's several-connections limit from Module 6); Wi-Fi Aware supports multiple concurrent data paths and should not be artificially restricted to one.

---

## 4. Non-Responsibilities / Scope Boundaries

Do **NOT** implement in this module:
- Any change to BLE (Module 6), `TransportManager` (Module 5), or transport-selection logic — this module only registers two more transports for the existing manager to choose between.
- Any protocol/session/routing/DTN/gateway logic — same byte-mover-only boundary as Module 6.
- Any UI, including OS-level Wi-Fi Direct connection dialogs (handled by the platform, not this module).
- Reusing or modifying Module 6's `Chunker`/`Reassembler` to serve a different purpose — build `StreamFramer` as its own primitive (see §2).

---

## 5. Dependencies

This module MAY use:
- Module 5: `MeshTransport`, `TransportType`, `ConnectionState`, `DiscoveredPeer`, `Unsubscribe`, error classes (`NoTransportAvailableError`, `PayloadTooLargeError`, `TransportSendError`, `DecodeError` — reuse, don't redefine).
- Module 1: `LocalConfigRepository` (max message size, connection/group-formation timeouts).

This module MUST NOT depend on: `DtnEngine`, `RoutingEngine`, `GatewayService`, `PeerDiscoveryService`, or UI.

---

## 6. Interfaces & Contracts

### 6.1 Constants (placeholder flagged per §2)

```typescript
// transport/wifi-aware/constants.ts
export const WIFI_AWARE_SERVICE_NAME = "emp-mesh-v1"; // PLACEHOLDER — verify against spec if one exists

// transport/shared/constants.ts
export const DEFAULT_SOCKET_TIMEOUT_MS = 15_000;
export const GROUP_FORMATION_TIMEOUT_MS = 20_000;
```

### 6.2 StreamFramer

```typescript
// transport/shared/StreamFramer.ts
export interface StreamFramer {
  /** Prefixes a payload with a 4-byte big-endian length header. */
  frame(payload: Uint8Array): Uint8Array;

  /**
   * Feed raw bytes as they arrive from a socket (which may deliver partial frames,
   * multiple frames in one read, or a frame split across many reads). Returns any
   * fully-received payloads extracted so far; retains partial data internally for
   * the next call.
   */
  addData(peerAddress: string, bytes: Uint8Array): Uint8Array[];

  /** Clears any partial buffer for a peer, e.g. on disconnect. */
  reset(peerAddress: string): void;
}
```

### 6.3 Both transports implement Module 5's `MeshTransport` unchanged

```typescript
export class WifiDirectTransport implements MeshTransport { /* ... */ }
export class WifiAwareTransport implements MeshTransport { /* ... */ }
```
No new methods beyond Module 5's interface — cross-check for signature drift.

### 6.4 Native bridge contracts (one per transport, same shape pattern as Module 6's `BleNativeModule`)

```typescript
// transport/wifi-direct/WifiDirectNativeModule.ts
export interface WifiDirectNativeModule {
  isSupported(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(deviceAddress: string): Promise<void>;   // initiates group formation
  disconnect(): Promise<void>;                      // tears down the single active group
  sendBytes(bytes: Uint8Array): Promise<void>;      // over the established socket
  onPeerDiscovered(handler: (address: string) => void): Unsubscribe;
  onGroupFormed(handler: (isGroupOwner: boolean, peerAddress: string) => void): Unsubscribe;
  onConnectionStateChanged(handler: (state: ConnectionState) => void): Unsubscribe;
  onDataReceived(handler: (bytes: Uint8Array) => void): Unsubscribe;
}

// transport/wifi-aware/WifiAwareNativeModule.ts
export interface WifiAwareNativeModule {
  isSupported(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  publish(serviceName: string): Promise<void>;
  subscribe(serviceName: string): Promise<void>;
  stopPublishSubscribe(): Promise<void>;
  openDataPath(peerHandle: string): Promise<void>;
  closeDataPath(peerHandle: string): Promise<void>;
  sendBytes(peerHandle: string, bytes: Uint8Array): Promise<void>;
  onPeerDiscovered(handler: (peerHandle: string) => void): Unsubscribe;
  onDataPathEstablished(handler: (peerHandle: string) => void): Unsubscribe;
  onConnectionStateChanged(handler: (peerHandle: string, state: ConnectionState) => void): Unsubscribe;
  onDataReceived(handler: (peerHandle: string, bytes: Uint8Array) => void): Unsubscribe;
}
```

---

## 7. Implementation Requirements

- **Wi-Fi Direct single-group constraint:** `WifiDirectTransport.connect(peerAddress)` while a group is already active with a *different* peer must reject with a clear typed error (do not silently disconnect the existing peer to serve a new request — that decision belongs to a higher layer, e.g. Routing choosing not to attempt a second Wi-Fi Direct connection while one is busy, falling back to BLE for that second peer instead, which `TransportManager`'s per-peer transport selection already supports naturally).
- **Wi-Fi Aware multi-path:** `WifiAwareTransport` may have multiple concurrent `peerHandle` data paths open; no artificial single-connection restriction.
- **`StreamFramer` correctness:** must handle all three real-world socket delivery patterns — a read containing exactly one frame, a read containing multiple complete frames back-to-back, and a read containing a partial frame whose remainder arrives in a later call. Test all three explicitly (§12).
- **`getMaxMessageSize()`** for both: derive from `LocalConfigRepository`'s `max_bundle_size` ceiling (same source Module 6 used for its own cap), since socket transports don't have BLE's MTU-driven ceiling — the practical limit here is app-level policy, not radio-level, and should be the same policy value across transports unless there's a documented reason to differ.
- **Group formation / data-path establishment timeouts:** both `connect()` (Wi-Fi Direct) and `openDataPath()` (Wi-Fi Aware) must reject if the underlying platform callback doesn't fire within `GROUP_FORMATION_TIMEOUT_MS` — Android's P2P/Aware APIs are callback-based and can silently hang on some OEM stacks.

---

## 8. Data Flow

**Wi-Fi Direct send:**
```
TransportManager.send(nodeId, message) → WifiDirectTransport.send(peerAddress, payload)
        │
        ├─▶ ensure group formed with this peer (connect() if not; reject if a DIFFERENT group is active)
        ├─▶ StreamFramer.frame(payload)
        ▼
WifiDirectNativeModule.sendBytes() over the group's TCP socket
```

**Wi-Fi Direct receive:**
```
WifiDirectNativeModule.onDataReceived(rawBytes)
        │
        ▼
StreamFramer.addData(peerAddress, rawBytes) → zero or more complete payloads
        │
        ▼ (per complete payload)
WifiDirectTransport emits onMessageReceived(peerAddress, payload)
```

**Wi-Fi Aware** follows the identical shape, substituting `peerHandle` for `peerAddress` and `openDataPath`/publish-subscribe for group formation.

---

## 9. Error Handling & Edge Cases

- `connect()` to a second peer while a Wi-Fi Direct group is already active → reject immediately with a typed `TransportBusyError` (new, alongside Module 5's other transport errors) — do not queue, do not silently drop the existing connection.
- Group formation / data-path negotiation times out → reject with `TransportSendError`/a connection-specific timeout error; ensure any partial native state is cleaned up (cancel the pending P2P/Aware operation) so a retry isn't blocked by stale native state.
- Socket read yields zero bytes / connection reset by peer → treat as disconnect, fire `onConnectionStateChanged(DISCONNECTED)`, call `StreamFramer.reset(peerAddress)` to discard any partial buffer.
- Hardware lacks Wi-Fi Aware support entirely (common on many devices) → `isSupported()` returns `false`; `TransportManager.startAll()` (Module 5) already handles a transport reporting unsupported gracefully — no special handling needed here beyond correctly reporting it.
- Location services disabled at the OS level (both Wi-Fi Direct and Wi-Fi Aware discovery require location permission granted **and** device location services turned on, on many Android versions, even though no GPS data is used) → `requestPermissions()` returning `true` doesn't guarantee discovery will actually work if location services are off at the OS level; `startDiscovery()` should surface a distinguishable error in that case if the native layer can detect it, rather than just silently finding no peers.
- `StreamFramer` receives a length header claiming an implausibly large frame (corrupted stream or protocol confusion) → reject/reset that peer's buffer rather than attempting to allocate an unbounded buffer; cap against the same `max_bundle_size`-derived ceiling used for `getMaxMessageSize()`.

---

## 10. Security Requirements

- Same posture as Module 6: no additional application-level encryption at this layer; bundle-level signing (Module 3) is the actual authenticity/integrity guarantee. Wi-Fi Direct/Aware links may have their own radio-level encryption depending on Android's implementation, but this module must not rely on or claim that as a security property.
- Do not log raw socket bytes or reassembled payload content at persistent log levels — log peer/frame-count/error information only, consistent with every prior transport module.
- `StreamFramer`'s length-header bound-check (§9) is also a security measure — an unbounded allocation from an untrusted length field is a resource-exhaustion vector on a device that may already be resource-constrained in a disaster scenario.

---

## 11. Android / React Native Boundary

**TypeScript/React Native side:** `WifiDirectTransport`, `WifiAwareTransport`, `StreamFramer`, constants, error classes, orchestration.

**Native (Android) side, two new Turbo Native Modules:**
- Wi-Fi Direct: `WifiP2pManager` (discovery, group formation, role negotiation) + a TCP socket server/client for the actual data path once a group exists.
- Wi-Fi Aware: `WifiAwareManager` (publish/subscribe, data-path request/response) + the resulting socket for data exchange.
- Both must check hardware feature flags (`PackageManager.hasSystemFeature(...)`) and request the correct permissions for the device's API level, following the same Codegen Turbo Native Module pattern as Modules 1 and 6.

---

## 12. Testing Requirements

**Unit tests (pure TS, no native/hardware required):**
- `StreamFramer`: single complete frame in one read; multiple frames in one read; one frame split across two+ reads; a frame with a corrupted/oversized length header is rejected without crashing.
- `WifiDirectTransport` with mocked `WifiDirectNativeModule`: `connect()` to a second peer while a group is active rejects with `TransportBusyError`; group formation timeout rejects cleanly; `send()`/`onMessageReceived()` round-trip via the framer.
- `WifiAwareTransport` with mocked `WifiAwareNativeModule`: multiple concurrent `peerHandle` data paths work independently; same framer round-trip coverage.
- Both transports' `getMaxMessageSize()` correctly reflects the `LocalConfigRepository`-driven ceiling.

**Device-level tests (manual/instrumented, same posture as Module 6 — required before production-readiness, not achievable in unit tests):**
- Two physical devices with Wi-Fi Direct support: group formation in both role directions (each device tries being the one that initiates `connect()` first), and a large (multi-hundred-KB) bundle transfer completes correctly and noticeably faster than the equivalent BLE transfer from Module 6.
- Two physical devices with Wi-Fi Aware hardware (if available in your test fleet — note if this can't be verified due to hardware availability): publish/subscribe discovery, data-path establishment, and a multi-message exchange.
- Verify graceful fallback: a device without Wi-Fi Aware hardware correctly reports `isSupported() === false` and the mesh continues operating over BLE/Wi-Fi Direct without error.

---

## 13. Acceptance Criteria

- [ ] Both transports implement Module 5's `MeshTransport` interface exactly, no signature drift.
- [ ] `StreamFramer` correctly handles all three stream-delivery patterns in §12, verified by test.
- [ ] Wi-Fi Direct's single-group constraint is enforced and tested; Wi-Fi Aware's multi-path support is verified not to be artificially restricted.
- [ ] `getMaxMessageSize()` for both transports is sourced from `LocalConfigRepository`, matching the same policy ceiling used in Module 6.
- [ ] Capability detection correctly checks hardware feature flags, not just API level, for both transports.
- [ ] Manual device-level tests executed at least once (or explicitly noted as blocked by hardware availability for Wi-Fi Aware) and results recorded.
- [ ] No changes made to Module 5's `TransportManager` selection logic or Module 6's BLE implementation.

---

## 14. Files / Folder Structure

```
src/
└── transport/
    ├── shared/
    │   ├── StreamFramer.ts
    │   └── constants.ts
    ├── wifi-direct/
    │   ├── constants.ts
    │   ├── WifiDirectNativeModule.ts
    │   ├── WifiDirectTransport.ts
    │   └── errors.ts                # TransportBusyError
    └── wifi-aware/
        ├── constants.ts
        ├── WifiAwareNativeModule.ts
        └── WifiAwareTransport.ts

android/native-modules/
├── wifi-direct/
└── wifi-aware/

tests/
└── transport/
    ├── shared/
    │   └── StreamFramer.test.ts
    ├── wifi-direct/
    │   └── WifiDirectTransport.test.ts
    └── wifi-aware/
        └── WifiAwareTransport.test.ts
```

---

## 15. Implementation Order

1. Cross-check §6.1's `WIFI_AWARE_SERVICE_NAME` placeholder against the spec; finalize.
2. Implement `StreamFramer` in isolation with full unit test coverage for all three delivery patterns — everything else depends on this being correct, same principle as Module 6's chunking-first approach.
3. Implement the Wi-Fi Direct native bridge (discovery, group formation, socket data path, permissions, hardware check).
4. Implement `WifiDirectTransport.ts`, composing the native bridge + `StreamFramer`, including the single-group constraint.
5. Implement the Wi-Fi Aware native bridge (publish/subscribe, data-path, permissions, hardware check).
6. Implement `WifiAwareTransport.ts`.
7. Register both into the app's `TransportManager` instance alongside BLE (wherever that composition-root wiring lives, per Module 6's note).
8. Write remaining unit tests.
9. Execute manual device-level tests; record results (including any hardware-availability limitations for Wi-Fi Aware).
10. Run full suite; confirm Modules 1–9 tests remain unaffected.

---

## 16. Final Verification

- [ ] Confirm neither transport reuses or mutates Module 6's `Chunker`/`Reassembler` — `StreamFramer` is a distinct, independently correct primitive.
- [ ] Confirm the Wi-Fi Direct single-group limitation is real and enforced, not just documented.
- [ ] Confirm no protocol-semantic (`MessageType`, bundle) logic exists in either transport.
- [ ] Confirm `TransportManager`'s existing transport-selection logic (Module 5) automatically starts preferring these transports for large payloads once registered, without any change to Module 5 itself.
- [ ] Confirm Modules 1–9 remain unmodified and their test suites pass unchanged.
- [ ] Record any deviation (especially the service-name placeholder resolution and any Wi-Fi Aware hardware-testing limitations) in `DEVIATIONS.md` before proceeding to UI / Advanced Features.

**Do not proceed to the UI / Advanced Features module until every checkbox above is confirmed true.**
