# MODULE PROMPT — BLE Transport: Concrete MeshTransport Implementation over Bluetooth LE

**Project:** Offline Disaster Communication & Delay-Tolerant Emergency Mesh Network (DRM03)
**Protocol:** Emergency Mesh Protocol (EMP) v1.0
**Sequence position:** 6 of N — `BLE Transport` (builds on `Foundation` + `Storage` + `Protocol Primitives` + `DTN Engine` + `Transport Abstraction`; precedes `Peer Discovery`/`Routing`)
**Status:** Ready for implementation

---

## 1. Module Objective

This module is the **first real radio**. It implements Module 5's `MeshTransport` interface using Android Bluetooth Low Energy, making it possible for two physical phones to actually exchange bytes for the first time in this build sequence. It exists to fulfill SRS's mandatory-BLE requirement (the one transport guaranteed to exist on every target device) while keeping every byte-shuffling/GATT/chunking detail behind the contract Module 5 already defined — nothing above this module should need to change when this module lands.

---

## 2. Context & Existing Architecture

Relevant frozen source documents:
- SRS §20 (BLE is the mandatory baseline transport; must function without internet, without existing pairing/bonding, and across heterogeneous Android device/OEM BLE stacks).
- SRS §22 (battery efficiency — advertising/scanning duty cycling requirements).
- EMP Core Protocol Spec — transport-agnostic wire message must survive fragmentation over a small-MTU link; the protocol payload itself has no BLE-specific framing baked in (that's this module's job to add and strip).
- Module 5's `MeshTransport` interface — this module's primary contract; every method must be implemented, none renamed.

**Cross-check required before finalizing (flagging rather than guessing):** if the EMP spec or SRS fixes a specific BLE Service UUID / Characteristic UUID scheme for interoperability, use that verbatim. The UUIDs in §6 below are placeholders generated for this prompt and **must be replaced** with the spec's actual values if any were specified; if none were specified, generating fresh app-specific UUIDs here is correct and should simply be documented as this module's original contribution (not reconstructed from a doc).

**Builds on:** Module 5's `MeshTransport` interface, `TransportManager` (which will `registerTransport(new BleTransport(...))`), and `errors.ts` (reuse `TransportSendError`, `PayloadTooLargeError` — this module raises these, doesn't redefine them).

---

## 3. Responsibilities

This module MUST implement:
1. **`BleTransport`** — a TypeScript class implementing `MeshTransport` fully: `isSupported`, `requestPermissions`, `startAdvertising`/`stopAdvertising`, `startDiscovery`/`stopDiscovery`, `connect`/`disconnect`, `send`, all four event emitters, `getMaxMessageSize`.
2. **Chunking & reassembly** — since BLE's negotiated MTU (typically 20–512 bytes payload) is far smaller than a serialized `ProtocolMessage` (which can contain a full `EmergencyBundle`), this module must fragment outgoing payloads into MTU-sized chunks with a small header (message ID, chunk index, total chunks) and reassemble incoming chunks into the original payload before emitting `onMessageReceived`.
3. **Native Android BLE bridge (Turbo Native Module)** — dual-role BLE: peripheral role (GATT server + advertising, so this device is discoverable and connectable) and central role (scanning + GATT client, so this device can discover and connect to others), since any two phones must be able to find each other regardless of which one happens to be "listening" first.
4. **Runtime permission handling** — request the correct Android BLE permissions for the device's API level (`BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT` on API 31+; `ACCESS_FINE_LOCATION` + legacy Bluetooth permissions on older API levels) via the native bridge.
5. **Duty-cycled advertising/scanning** — per SRS §22, do not scan/advertise continuously at maximum power indefinitely; implement a configurable on/off duty cycle (parameters read from `LocalConfigRepository`, Module 1 — not hardcoded).

---

## 4. Non-Responsibilities / Scope Boundaries

Do **NOT** implement in this module:
- Wi-Fi Direct or Wi-Fi Aware transports (later modules — this module only touches BLE).
- Any change to `TransportManager`'s transport-selection, dedup, or peer-identity-correlation logic (Module 5 — already built; this module is just one more registered transport to it).
- HELLO/session handshake interpretation, bundle offer/accept negotiation, or any `MessageType`-aware logic — this module moves opaque bytes only, exactly like Module 5's `MeshTransport` contract requires.
- Routing, DTN, or Gateway logic of any kind.
- Any UI (including BLE permission-rationale dialogs — that's a UI-layer concern that will call this module's `requestPermissions()`, not something this module renders itself).

---

## 5. Dependencies

This module MAY use:
- Module 5: `MeshTransport` interface, `TransportType`, `ConnectionState`, `DiscoveredPeer`, `Unsubscribe`, and the error classes in `transport/errors.ts`.
- Module 1: `LocalConfigRepository` (for duty-cycle timing parameters).

This module MUST NOT depend on: `TransportManager`'s internals (it is *registered into* a `TransportManager`, it does not import or call back into manager-level logic), `DtnEngine`, `RoutingEngine`, `GatewayService`, or any UI package.

---

## 6. Interfaces & Contracts

### 6.1 Constants (placeholders — replace with spec values if any exist, per §2)

```typescript
// transport/ble/constants.ts
export const BLE_SERVICE_UUID = "6e400001-0000-1000-8000-00805f9b34fb"; // PLACEHOLDER — verify against spec
export const BLE_WRITE_CHARACTERISTIC_UUID = "6e400002-0000-1000-8000-00805f9b34fb"; // PLACEHOLDER
export const BLE_NOTIFY_CHARACTERISTIC_UUID = "6e400003-0000-1000-8000-00805f9b34fb"; // PLACEHOLDER
export const DEFAULT_MTU_REQUEST = 512;
export const FALLBACK_MTU = 20; // pre-negotiation / devices that reject MTU request
export const REASSEMBLY_TIMEOUT_MS = 30_000;
```

### 6.2 Chunk frame format

```typescript
// transport/ble/chunking.ts
export interface ChunkHeader {
  messageId: string;   // correlates chunks of the same logical message
  chunkIndex: number;  // 0-based
  totalChunks: number;
}

export interface Chunker {
  /** Splits a full payload into MTU-sized chunks, each prefixed with an encoded header. */
  split(payload: Uint8Array, mtu: number): Uint8Array[];
}

export interface Reassembler {
  /** Feed one received chunk; returns the fully reassembled payload once all chunks for
   *  its messageId have arrived, or null if still incomplete. Must self-clean any buffer
   *  that hasn't completed within REASSEMBLY_TIMEOUT_MS. */
  addChunk(peerAddress: string, chunk: Uint8Array): Uint8Array | null;
}
```

### 6.3 Native bridge contract

```typescript
// transport/ble/BleNativeModule.ts
export interface BleNativeModule {
  isBleSupported(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;

  startAdvertising(serviceUuid: string): Promise<void>;
  stopAdvertising(): Promise<void>;

  startScanning(serviceUuid: string): Promise<void>;
  stopScanning(): Promise<void>;

  connectGatt(deviceAddress: string): Promise<void>;
  disconnectGatt(deviceAddress: string): Promise<void>;

  writeCharacteristic(deviceAddress: string, bytes: Uint8Array): Promise<void>;
  requestMtu(deviceAddress: string, mtu: number): Promise<number>; // returns negotiated MTU

  onDeviceDiscovered(handler: (address: string, rssi: number) => void): Unsubscribe;
  onConnectionStateChanged(handler: (address: string, state: ConnectionState) => void): Unsubscribe;
  onDataReceived(handler: (address: string, bytes: Uint8Array) => void): Unsubscribe;
}
```

`BleTransport implements MeshTransport` composes `BleNativeModule` + `Chunker` + `Reassembler` — cross-check every `MeshTransport` method from Module 5 is implemented with no signature drift.

---

## 7. Implementation Requirements

- `send(peerAddress, payload)`: request/confirm negotiated MTU for that connection (falling back to `FALLBACK_MTU` if negotiation fails or wasn't attempted), split payload via `Chunker`, write chunks sequentially over the write characteristic, await each native write's completion before sending the next (BLE GATT writes are typically not safely pipelined without flow control on all OEM stacks) unless the native layer explicitly supports write-without-response queuing — if so, document that choice and its risk.
- `onDataReceived` from the native bridge feeds `Reassembler.addChunk()`; once a full payload is reassembled, `BleTransport` emits it via its own `onMessageReceived` handler set (fulfilling the `MeshTransport` contract) — the reassembled bytes are the same "whole payload" `TransportManager` expects, unaware chunking ever happened.
- Peripheral (GATT server) and central (GATT client) roles must both be active while `startAdvertising()`/`startDiscovery()` are running — a device must be able to be found by a peer that started scanning first, and also find a peer that started advertising first, without the app needing separate "host" vs "join" modes.
- Duty cycling: read `bleAdvertiseIntervalMs`/`bleScanIntervalMs`/`bleScanWindowMs`-style parameters from `LocalConfigRepository`; implement as a simple on/off timer around the native start/stop calls — do not hand-roll a complex backoff algorithm in v1, a fixed configurable duty cycle is sufficient and matches the "experimentally tunable" spirit already established for routing weights.
- `getMaxMessageSize()` should return a large practical ceiling (chunking makes near-arbitrary sizes possible) but still enforce *some* sane maximum (e.g., a config-driven cap) to avoid one runaway bundle monopolizing a BLE link for an unreasonable duration — document the chosen default and make it overridable via `LocalConfigRepository`.

---

## 8. Data Flow

**Send:**
```
TransportManager.send(nodeId, message)
        │
        ▼
BleTransport.send(peerAddress, payload: Uint8Array)   [payload = WireCodec.encode(message), done by TransportManager]
        │
        ├─▶ ensure connected (connect() if needed)
        ├─▶ negotiate/reuse MTU
        ├─▶ Chunker.split(payload, mtu)
        │
        ▼
BleNativeModule.writeCharacteristic() × N chunks, sequentially
        │
        ▼
(native GATT write to remote peripheral)
```

**Receive:**
```
(native GATT server receives a characteristic write from a central)
        │
        ▼
BleNativeModule emits onDataReceived(address, chunkBytes)
        │
        ▼
BleTransport: Reassembler.addChunk(address, chunkBytes)
        │
   ┌────┴────┐
 incomplete  complete
   │            │
 (wait)         ▼
          BleTransport emits onMessageReceived(address, fullPayload)
                    │
                    ▼
          TransportManager: WireCodec.decode(fullPayload) → ProtocolMessage
```

**Discovery:**
```
BleNativeModule emits onDeviceDiscovered(address, rssi)
        │
        ▼
BleTransport emits onPeerDiscovered({ transport: BLE, signalStrength: rssi, discoveredAt })
        │
        ▼
TransportManager aggregates (per Module 5)
```

---

## 9. Error Handling & Edge Cases

- Bluetooth adapter disabled or unsupported hardware → `isSupported()` returns `false`; `startAdvertising`/`startDiscovery` called anyway must reject clearly rather than silently no-op.
- Permission denied by the user → `requestPermissions()` returns `false`; subsequent lifecycle calls reject with a typed `BlePermissionDeniedError` (define alongside the other transport errors, extending the pattern from Module 5).
- Connection drops mid-chunk-transfer → discard the partial reassembly buffer for that peer/messageId on the receiving side; on the sending side, reject the in-flight `send()` promise with `TransportSendError` (from Module 5) — do not silently resend automatically (retry policy is the caller's decision, per Module 5's existing stance).
- Duplicate or out-of-order chunk arrival (possible on some BLE stacks under connection interference) → `Reassembler` must key by `(messageId, chunkIndex)` and ignore an already-received duplicate chunk rather than corrupting the buffer.
- Reassembly never completes within `REASSEMBLY_TIMEOUT_MS` → discard the buffer, log via a diagnostic event (reuse `ProtocolEventRepository` from Module 2 if wiring is convenient at this layer, or otherwise a lightweight internal log — do not silently leak memory holding incomplete buffers forever).
- Too many simultaneous GATT connections (Android central role has OEM-dependent concurrent-connection limits, commonly around 4–7) → `connect()` to an additional peer beyond capacity should reject with a clear error rather than hang; do not implement a connection eviction/queueing policy in this module — that's a Routing/session-layer capacity decision to make later, this module just needs to fail loudly and fast.
- Payload larger than the configured max from `getMaxMessageSize()` → reject with `PayloadTooLargeError` (Module 5's error class) before attempting any chunking.

---

## 10. Security Requirements

- No additional authentication/encryption is implemented at the BLE layer in v1 (per Module 5's documented scope limitation) — authenticity/integrity of the actual protocol content is entirely handled by Module 3's bundle signing; this module must not claim or imply BLE-level security it doesn't provide.
- Do not log raw chunk payload bytes or reassembled message content at any persistent log level — log peer address, chunk counts, and error codes only, consistent with Module 5's privacy posture for emergency payload data.
- Be aware that Android randomizes BLE MAC addresses for privacy on many OEM builds — `peerAddress` may not be stable across advertising cycles for the same physical device. Do not assume `peerAddress` stability beyond a single connection's lifetime; `nodeId` correlation (via HELLO, handled by the future Routing/Session module) is the only stable identity, exactly as Module 5 already anticipates.

---

## 11. Android / React Native Boundary

**TypeScript/React Native side:**
- `BleTransport` class, `Chunker`, `Reassembler`, constants, error classes, and orchestration of the native bridge calls.

**Native (Android) side, new Turbo Native Module:**
- `BluetoothLeAdvertiser`/`BluetoothGattServer` for peripheral role (advertising + accepting incoming connections + serving the write/notify characteristics).
- `BluetoothLeScanner`/`BluetoothGatt` for central role (scanning + initiating connections + writing to a peer's characteristics).
- MTU negotiation (`BluetoothGatt.requestMtu()`).
- Runtime permission requests appropriate to the device's API level.
- Must use the Codegen-based Turbo Native Module pattern per SRS §14, consistent with Module 1's Keystore bridge.

---

## 12. Testing Requirements

**Unit tests (pure TS, no native/hardware required):**
- `Chunker.split()`: correct number/size of chunks for various payload sizes and MTU values, including edge cases (payload smaller than one MTU, payload exactly divisible, payload requiring a final partial chunk).
- `Reassembler.addChunk()`: returns `null` until all chunks arrive, returns the correct reassembled payload once complete, ignores duplicate chunks, discards a buffer after the timeout (use fake timers).
- `BleTransport` with a mocked `BleNativeModule`: verify `send()` calls `writeCharacteristic` the expected number of times with correctly ordered chunks; verify `onMessageReceived` fires only after full reassembly; verify permission/adapter-disabled error paths surface the correct typed errors.
- Reuse Module 5's `MeshTransport` behavioral expectations (event ordering, error types) as a conformance checklist — `BleTransport` should satisfy the same qualitative contract `MockTransport` does, even though its tests use a mocked native layer instead of a fully in-memory fake.

**Device-level tests (manual/instrumented — document as required before this module is considered production-ready, since some of this cannot be verified in a unit test environment):**
- Two physical Android devices: advertise/discover each other, connect, exchange a message small enough for one chunk and one large enough to require multiple chunks (e.g., a full `EmergencyBundle` with a sizable payload).
- Verify dual-role behavior: Device A starts advertising first and is found by Device B's scan; separately, Device B starts advertising first and is found by Device A's scan — both directions must work.
- Verify behavior when Bluetooth is toggled off mid-session (graceful error, not a crash).
- Verify duty-cycled advertising/scanning doesn't prevent discovery within a reasonable time window across a few cycles.

---

## 13. Acceptance Criteria

- [ ] `BleTransport` implements every method of Module 5's `MeshTransport` interface with no signature drift.
- [ ] Chunking/reassembly round-trips correctly for payload sizes from a few bytes up to a large multi-chunk bundle, verified by unit test.
- [ ] Reassembly buffers are cleaned up after `REASSEMBLY_TIMEOUT_MS`, verified by test with fake timers (no real 30-second wait in CI).
- [ ] Permission-denied and adapter-disabled paths produce clear typed errors, not silent failures or crashes.
- [ ] Duty-cycle timing is read from `LocalConfigRepository`, not hardcoded.
- [ ] Device-level manual test plan in §12 has been executed at least once on two real devices before this module is marked production-ready (record results, even informally, in `DEVIATIONS.md` or a test log).
- [ ] No `MessageType`/protocol-semantic logic exists anywhere in this module — it moves bytes only.

---

## 14. Files / Folder Structure

```
src/
└── transport/
    └── ble/
        ├── constants.ts            # UUIDs (flagged placeholders), MTU/timeout defaults
        ├── chunking.ts             # Chunker, Reassembler
        ├── BleNativeModule.ts      # TS wrapper around the Turbo Native Module
        ├── BleTransport.ts         # implements MeshTransport (Module 5)
        └── errors.ts               # BlePermissionDeniedError (extends Module 5's error pattern)

android/native-modules/
└── ble/                            # native peripheral+central GATT implementation

tests/
└── transport/
    └── ble/
        ├── chunking.test.ts
        └── BleTransport.test.ts    # against mocked BleNativeModule
```

---

## 15. Implementation Order

1. Cross-check §6.1 UUIDs against the frozen spec; replace placeholders if the spec fixes values, otherwise finalize and document these as this module's own constants.
2. Implement `chunking.ts` (`Chunker`, `Reassembler`) in isolation with full unit test coverage first — this is the trickiest pure-logic piece and everything else depends on it being correct.
3. Implement the native Android BLE bridge (peripheral + central dual role, permissions, MTU negotiation).
4. Implement `BleNativeModule.ts` TS wrapper.
5. Implement `BleTransport.ts`, composing the native bridge + chunking/reassembly to satisfy `MeshTransport`.
6. Register `BleTransport` into a `TransportManager` instance in whatever app bootstrap/composition-root file exists (or note where it should be wired if that file doesn't exist yet).
7. Write remaining unit tests against the mocked native module.
8. Execute the manual two-device test plan from §12; record results.
9. Run full suite; confirm Modules 1–5 tests remain unaffected.

---

## 16. Final Verification

- [ ] Confirm `BleTransport` satisfies Module 5's `MeshTransport` interface exactly — no extra public methods that leak BLE-specific concepts (like raw GATT handles) to callers above `TransportManager`.
- [ ] Confirm chunking/reassembly logic has no dependency on any native module (fully unit-testable in isolation, per §12).
- [ ] Confirm duty-cycle and max-message-size parameters are config-driven, not hardcoded.
- [ ] Confirm no protocol-semantic (`MessageType`, bundle) logic exists in this module.
- [ ] Confirm the manual device-level test plan has been run at least once and results recorded.
- [ ] Confirm Modules 1–5 remain unmodified and their test suites pass unchanged.
- [ ] Record any deviation (especially the UUID placeholders' resolution) in `DEVIATIONS.md` before proceeding to the Peer Discovery / Routing module.

**Do not proceed to the Peer Discovery / Routing module until every checkbox above is confirmed true.**
