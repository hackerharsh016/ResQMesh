# MODULE PROMPT — Protocol Primitives: Canonical Types, Bundle Factory, Serialization & Signing Contract

**Project:** Offline Disaster Communication & Delay-Tolerant Emergency Mesh Network (DRM03)
**Protocol:** Emergency Mesh Protocol (EMP) v1.0
**Sequence position:** 3 of N — `Protocol Primitives` (builds on `Foundation` + `Storage`; precedes `DTN Engine`)
**Status:** Ready for implementation

---

## 1. Module Objective

This module gives the rest of the system the **one correct way** to construct, serialize, sign, and verify a bundle — so that "create a bundle" and "check if a bundle is valid" are never reimplemented ad hoc in the DTN Engine, Transport layer, or UI. It exists because EMP correctness depends entirely on every node computing the *same* signature over the *same* bytes for the *same* logical bundle, regardless of how many hops it's traveled — which requires a single, centralized, deterministic serialization routine rather than each module doing its own `JSON.stringify`.

This module also defines the **wire message contract** (`ProtocolMessage` union + `ProtocolEnvelope<T>`) that the Transport/Session layer will use later — this module defines the shapes, it does not implement session handshake logic.

---

## 2. Context & Existing Architecture

Relevant frozen source documents:
- EMP Core Protocol Spec §24 (Immutable vs Mutable Bundle Fields), §76 (Message Type catalogue), §95 (Protocol Constants), §97 (Bundle Signing Procedure).
- Protocol Data Model doc §28–§45 (`EmergencyBundle`, `RoutingMetadata`, `SecurityMetadata`, `EmergencyPayload` and sub-payload types, `ProtocolMessage` discriminated union members, `ProtocolEnvelope<T>`).
- SRS §43 (Security Requirements — signature required on every bundle before transmission, integrity hash for tamper detection), §82 (Data Integrity Rules — bundleId immutable, hopCount monotonic increase, replicationBudget monotonic decrease, expiry never extended by relays).

**Builds on:**
- Module 1 (`Foundation`): `KeystoreModule.ts` native bridge for keypair generation — this module extends it with actual `sign`/`verify` operations.
- Module 2 (`Storage`): `protocol/types/bundle.ts` and related type files — this module either lives alongside them or extends them; it does **not** redefine `EmergencyBundle`/`RoutingMetadata`/`SecurityMetadata` a second time.

**Assumption carried from conversation (flag if wrong):** only `EmergencyBundle` payloads are cryptographically signed. Session-lifecycle messages (`HELLO`, `SYNC_REQUEST`, etc.) are trusted based on the established BLE/Wi-Fi session, not individually signed in v1.

---

## 3. Responsibilities

This module MUST implement:
1. **`BundleFactory`** — the single entry point for constructing a new `EmergencyBundle` from user/sensor input (origin creation) with all required fields correctly initialized (`bundleId` generation, `hopCount = 0`, `state = CREATED`, `createdAt`/`expiresAt` computed from priority-driven TTL defaults per EMP §38).
2. **`CanonicalSerializer`** — deterministic byte-string serialization of the *immutable* subset of a bundle (per EMP §24) for signing and integrity-hash purposes. Must produce identical output for identical logical content regardless of JS engine/object key insertion order.
3. **`SecurityService`** — `sign(bundle)`, `verify(bundle)`, `computeIntegrityHash(bundle)` — using Module 1's Keystore bridge for the actual cryptographic operation, this module for the canonicalization + orchestration around it.
4. **Protocol message types**: full `MessageType` enum, all message payload interfaces (`HelloMessage`, `HelloAckMessage`, `SyncRequestMessage`, `SyncResponseMessage`, `BundleOfferMessage`, `BundleAcceptMessage`, `BundleRejectMessage`, `BundleDataMessage`, `BundleAckMessage`, `SessionCloseMessage`), the `ProtocolMessage` discriminated union, and `ProtocolEnvelope<T>` wrapper — types only, no transport/session logic.
5. **Protocol constants module** — single source of truth for `PROTOCOL_VERSION`, per-priority default TTLs, default `maxHopCount`, default `replicationBudget`, referenced everywhere instead of magic numbers.
6. **Mutation guards** — factory-level functions (`incrementHopMutation`, `decrementReplicationBudgetMutation`, etc. — pure functions returning a new bundle-routing-metadata object) that enforce the monotonic invariants from SRS §82 at the type/function level, so the DTN Engine cannot accidentally violate them by hand-editing fields.

---

## 4. Non-Responsibilities / Scope Boundaries

Do **NOT** implement in this module:
- Deduplication logic, TTL expiry enforcement, priority queue management (DTN Engine).
- Actual session handshake / message exchange over a transport (Transport + Routing/Session modules).
- Persisting bundles (already done — this module calls into Module 2's `BundleRepository`, it doesn't reimplement storage).
- Routing score calculation or next-hop decisions.
- Any UI or bundle-creation forms.
- Native Keystore key *generation* (that's done, Module 1) — this module only adds `sign`/`verify` calls against an existing key.

---

## 5. Dependencies

This module MAY use:
- Module 1's `KeystoreModule.ts` (extend with `sign(alias, data): Promise<string>` and `verify(publicKey, data, signature): Promise<boolean>` native methods).
- Module 1's `IdentityManager` (to get the local node's `nodeId`/`publicKey`/`privateKeyRef` when constructing/signing a bundle).
- Module 2's type definitions (`EmergencyBundle`, `RoutingMetadata`, `SecurityMetadata`, `EmergencyPayload`, `Priority`, `BundleState`, etc.) and `BundleRepository` interface (for `BundleFactory` to persist what it creates, via dependency injection — this module does not talk to SQLite directly).

This module MUST NOT depend on: DTN Engine, Transport Manager, Routing Engine, Gateway Service, or UI.

---

## 6. Interfaces & Contracts

### 6.1 Protocol constants

```typescript
// protocol/constants.ts
export const PROTOCOL_VERSION = "1.0";

export const DEFAULT_TTL_SECONDS: Record<Priority, number> = {
  [Priority.CRITICAL]: 86400,   // confirm exact value against EMP §38 table before finalizing
  [Priority.HIGH]: 43200,
  [Priority.MEDIUM]: 21600,
  [Priority.LOW]: 7200,
};

export const DEFAULT_MAX_HOP_COUNT = 20;
export const DEFAULT_REPLICATION_BUDGET: Record<Priority, number> = {
  [Priority.CRITICAL]: 10,
  [Priority.HIGH]: 6,
  [Priority.MEDIUM]: 4,
  [Priority.LOW]: 2,
};
```
**Do not guess these numbers silently** — if the EMP spec's §38 table has different values than the placeholders above, use the spec's values; these are illustrative only and must be corrected against the actual table before merging.

### 6.2 BundleFactory

```typescript
export interface CreateBundleInput {
  destinationType: DestinationType;
  destinationNodeId?: string;
  priority: Priority;
  payload: EmergencyPayload;
  incidentId?: string;
}

export interface BundleFactory {
  createBundle(input: CreateBundleInput, identity: NodeIdentity): Promise<EmergencyBundle>;
}
```

Rules the implementation must follow:
- `bundleId`: globally unique, generated here, never regenerated or altered afterward by any other module.
- `originNodeId`: always `identity.nodeId` — a locally created bundle cannot claim a different origin.
- `createdAt`: `Date.now()`.
- `expiresAt`: `createdAt + DEFAULT_TTL_SECONDS[priority] * 1000`.
- `hopCount`: `0`.
- `maxHopCount`: `DEFAULT_MAX_HOP_COUNT` (or payload/priority-specific override if EMP spec defines one — confirm).
- `replicationBudget`: `DEFAULT_REPLICATION_BUDGET[priority]`.
- `state`: `BundleState.CREATED`.
- `security`: populated by calling `SecurityService.sign()` before the factory returns — a bundle must never exist in memory unsigned once `createBundle()` resolves.

### 6.3 CanonicalSerializer

```typescript
export interface CanonicalSerializer {
  /**
   * Serializes ONLY the immutable subset of a bundle (per EMP §24) into a
   * deterministic byte string, suitable for signing and integrity hashing.
   * MUST produce identical output for logically identical bundles regardless
   * of object key insertion order or JS engine.
   */
  serializeForSigning(bundle: EmergencyBundle): string;
}
```

Immutable subset to include (confirm exact field list against EMP §24 before finalizing — do not include any field that the DTN Engine will later mutate, e.g. `hopCount`, `replicationBudget`, `state`, `updatedAt`):
`bundleId, originNodeId, destinationType, destinationNodeId, payloadType, priority, createdAt, expiresAt, payload`.

Implementation requirement: sort object keys explicitly (do not rely on engine key order), use a fixed number formatting rule, and version the canonical format itself (embed `PROTOCOL_VERSION` in the signed string) so future format changes don't silently break verification of old bundles.

### 6.4 SecurityService

```typescript
export interface SecurityService {
  sign(bundle: EmergencyBundle, identity: NodeIdentity): Promise<SecurityMetadata>;
  verify(bundle: EmergencyBundle, senderPublicKey: string): Promise<boolean>;
  computeIntegrityHash(bundle: EmergencyBundle): string;
}
```

- `sign()`: canonicalize → call `KeystoreModule.sign(identity.privateKeyRef, canonicalString)` → return `{ signature, integrityHash: computeIntegrityHash(bundle), keyId: undefined /* v1: single key per node, keyId reserved for future rotation per resolved conflict */ }`.
- `verify()`: canonicalize the *received* bundle the same way → call `KeystoreModule.verify(senderPublicKey, canonicalString, bundle.security.signature)` → also recompute and compare `integrityHash` to catch transport-level corruption distinct from signature forgery (these are two different failure modes and must be distinguishable in logs/errors).
- `computeIntegrityHash()`: a fast hash (e.g. SHA-256) over the full payload bytes (including mutable fields is fine here — this is corruption detection, not authenticity — confirm against EMP §97 whether integrity hash also excludes mutable fields; if the spec says it covers the same immutable subset as the signature, align it exactly with `serializeForSigning()`'s output instead of hashing separately).

### 6.5 Protocol message types

```typescript
export enum MessageType {
  HELLO = "HELLO",
  HELLO_ACK = "HELLO_ACK",
  SYNC_REQUEST = "SYNC_REQUEST",
  SYNC_RESPONSE = "SYNC_RESPONSE",
  BUNDLE_OFFER = "BUNDLE_OFFER",
  BUNDLE_ACCEPT = "BUNDLE_ACCEPT",
  BUNDLE_REJECT = "BUNDLE_REJECT",
  BUNDLE_DATA = "BUNDLE_DATA",
  BUNDLE_ACK = "BUNDLE_ACK",
  SESSION_CLOSE = "SESSION_CLOSE",
}
// Confirm exact set/naming against EMP §76 message catalogue before finalizing —
// do not add or drop message types without cross-checking the spec table.

export interface ProtocolEnvelope<T> {
  version: string;         // PROTOCOL_VERSION
  type: MessageType;
  senderNodeId: string;
  timestamp: number;
  payload: T;
}

export interface HelloMessage { nodeId: string; publicKey: string; protocolVersion: string; capabilities: NodeCapabilities; }
export interface HelloAckMessage { nodeId: string; publicKey: string; protocolVersion: string; accepted: boolean; }
export interface SyncRequestMessage { bundleSummaries: BundleSummary[]; }
export interface SyncResponseMessage { wantedBundleIds: string[]; }
export interface BundleOfferMessage { bundleId: string; summary: BundleSummary; }
export interface BundleAcceptMessage { bundleId: string; }
export interface BundleRejectMessage { bundleId: string; reason: string; }
export interface BundleDataMessage { bundle: EmergencyBundle; }
export interface BundleAckMessage { bundleId: string; ackType: AckType; }
export interface SessionCloseMessage { reason?: string; }

export type ProtocolMessage =
  | ProtocolEnvelope<HelloMessage>
  | ProtocolEnvelope<HelloAckMessage>
  | ProtocolEnvelope<SyncRequestMessage>
  | ProtocolEnvelope<SyncResponseMessage>
  | ProtocolEnvelope<BundleOfferMessage>
  | ProtocolEnvelope<BundleAcceptMessage>
  | ProtocolEnvelope<BundleRejectMessage>
  | ProtocolEnvelope<BundleDataMessage>
  | ProtocolEnvelope<BundleAckMessage>
  | ProtocolEnvelope<SessionCloseMessage>;
```

Cross-check every field above against the frozen Data Model doc's actual member definitions before implementing — the shapes above are reconstructed from the spec summary and must be corrected to match verbatim if any field was misremembered.

### 6.6 Mutation guard functions

```typescript
export function applyHopIncrement(bundle: EmergencyBundle): EmergencyBundle;
export function applyReplicationDecrement(bundle: EmergencyBundle): EmergencyBundle;
```
Both return a **new** object (never mutate in place), throw if the operation would violate an invariant (`hopCount + 1 > maxHopCount`, `replicationBudget - 1 < 0`), and never touch `bundleId`, `signature`, or any other immutable field.

---

## 7. Implementation Requirements

- `CanonicalSerializer` output must be covered by a "golden vector" test: a fixed sample bundle input must always produce byte-identical canonical output across test runs — commit this fixed vector into the test file so any future accidental change to serialization is caught immediately.
- `BundleFactory.createBundle()` must be the *only* place in the codebase permitted to construct an `EmergencyBundle` with `state = CREATED` — enforce this socially via code review note in this prompt, not technically (TypeScript can't easily prevent external construction of a plain interface), but do not provide any other exported helper that assembles a full bundle object from scratch.
- `SecurityService.verify()` must reject (return `false`, not throw) on: signature mismatch, integrity hash mismatch, or malformed/missing `security` metadata — these are expected adversarial/corrupted-input conditions, not exceptional program states.
- All async native calls (`sign`/`verify` via Keystore) must have a timeout guard — a hung native call must not hang the whole bundle-processing pipeline indefinitely.

---

## 8. Data Flow

**Creation path:**
```
Caller (future: UI form via a use-case layer, or Simulator)
      │
      ▼
BundleFactory.createBundle(input, identity)
      │
      ├─▶ generate bundleId, fill immutable + default mutable fields
      │
      ▼
SecurityService.sign(bundle, identity)
      │
      ├─▶ CanonicalSerializer.serializeForSigning(bundle)
      ├─▶ KeystoreModule.sign(identity.privateKeyRef, canonicalString)
      │
      ▼
bundle.security populated → fully-formed signed EmergencyBundle returned
      │
      ▼
(Caller passes to BundleRepository.create() — NOT done inside this module)
```

**Verification path (used later by DTN Engine on bundle receipt):**
```
Received EmergencyBundle + claimed sender's publicKey
      │
      ▼
SecurityService.verify(bundle, senderPublicKey)
      │
      ├─▶ CanonicalSerializer.serializeForSigning(bundle)  [same routine, receiver side]
      ├─▶ KeystoreModule.verify(publicKey, canonicalString, bundle.security.signature)
      ├─▶ recompute integrity hash, compare
      │
      ▼
boolean result → caller (DTN Engine) decides accept/reject
```

---

## 9. Error Handling & Edge Cases

- Signing a bundle whose identity's `privateKeyRef` is invalid/missing (e.g. Keystore key was somehow lost) → throw a typed `SigningFailedError`; `BundleFactory.createBundle()` must not return a partially-signed or unsigned bundle under any circumstance — fail the whole creation.
- Verifying a bundle with a `security` object missing fields (malformed/tampered wire data) → `verify()` returns `false` immediately without calling native code on garbage input.
- Verifying a bundle whose `protocolVersion`/canonical format version doesn't match what the local node supports → return `false` and log via a distinguishable reason code (`UNSUPPORTED_PROTOCOL_VERSION`) rather than a generic failure, so the DTN Engine/telemetry can tell "forged" apart from "future version we don't understand yet."
- `applyHopIncrement`/`applyReplicationDecrement` called on a bundle already at its limit → throw (caller — DTN Engine — must have already decided not to relay before calling this; this is a defensive invariant check, not the primary control flow decision point).
- Native `sign`/`verify` call timeout or native module unavailable → propagate a distinguishable error; do not fall back to an unsigned/unverified path.

---

## 10. Security Requirements

- `serializeForSigning()` must be the single, shared implementation used both when signing (sender) and verifying (receiver) — any divergence between the two would make all signatures fail to verify or, worse, allow forgery if a receiver-side implementation is more lenient. Do not write two separate serialization code paths.
- Never sign or verify using data taken from anywhere other than the `EmergencyBundle` object itself — no signing "what the UI displayed" or similarly indirect data.
- `computeIntegrityHash` must use a well-vetted hashing primitive (e.g. SHA-256) via a maintained crypto library already in the project, not a hand-rolled hash function.
- Reject-by-default: any ambiguity in `verify()` (missing field, unknown version, native error) must resolve to `false`/rejected, never to an implicit accept.

---

## 11. Android / React Native Boundary

**TypeScript/React Native side:**
- `BundleFactory`, `CanonicalSerializer`, all protocol message type definitions, `applyHopIncrement`/`applyReplicationDecrement`, constants module, orchestration logic in `SecurityService` (calling into native for the actual crypto op).

**Native (Android) side, extending Module 1's Keystore bridge:**
- `sign(alias: string, data: string): Promise<string>` — perform the actual asymmetric signing inside Keystore, return signature (e.g. base64).
- `verify(publicKey: string, data: string, signature: string): Promise<boolean>` — perform signature verification (this can run against a public key directly, doesn't require Keystore access to the signer's private key — confirm whether this should also go through native crypto APIs for consistency, or is safe to do in JS with a public-key-only library; if the project already has a vetted JS crypto lib for public-key verification, using it is acceptable since no private key material is involved — flag this as an implementation choice to record, not a spec violation either way).

---

## 12. Testing Requirements

**Unit tests:**
- `CanonicalSerializer` golden-vector test (fixed input → fixed expected output string, committed to the test file).
- `CanonicalSerializer` determinism test: same logical bundle constructed via different code paths / key insertion orders → identical serialized output.
- `BundleFactory.createBundle()`: verify every default field (TTL, maxHopCount, replicationBudget, state, hopCount=0) matches the constants module for each `Priority` value.
- `SecurityService.sign()` → `verify()` round trip succeeds for a freshly created bundle.
- `SecurityService.verify()` fails (returns `false`, doesn't throw) for: tampered payload, tampered signature, wrong public key, missing security metadata.
- `applyHopIncrement`/`applyReplicationDecrement`: normal case increments/decrements correctly and returns a new object (original untouched — reference inequality test); boundary case throws when limit would be exceeded.

**Integration tests:**
- End-to-end: `BundleFactory.createBundle()` → `BundleRepository.create()` (Module 2) → `BundleRepository.getById()` → `SecurityService.verify()` on the round-tripped bundle succeeds (proves storage layer doesn't corrupt signable fields).

---

## 13. Acceptance Criteria

- [ ] `CanonicalSerializer` passes the golden-vector and determinism tests.
- [ ] Every `BundleFactory`-created bundle is signed before being returned; no code path returns an unsigned bundle.
- [ ] `SecurityService.verify()` correctly rejects all tamper scenarios in §12 and correctly accepts an untampered, freshly signed bundle.
- [ ] `MessageType` enum and all message payload interfaces exactly match the frozen Data Model doc's `ProtocolMessage` definitions (cross-checked, not reconstructed from memory in the final implementation).
- [ ] Mutation guard functions never mutate in place and correctly enforce monotonic invariants.
- [ ] Constants module values match EMP §38's actual TTL/budget table, not the placeholder values in this prompt.
- [ ] No signing/verification logic exists anywhere outside `SecurityService`/`CanonicalSerializer`.

---

## 14. Files / Folder Structure

```
src/
├── protocol/
│   ├── constants.ts                    # PROTOCOL_VERSION, TTL/budget defaults
│   ├── types/
│   │   ├── bundle.ts                   # EXTEND Module 2's file if needed, don't duplicate
│   │   └── messages.ts                 # MessageType, all message payloads, ProtocolMessage, ProtocolEnvelope<T>
│   ├── BundleFactory.ts
│   ├── CanonicalSerializer.ts
│   ├── SecurityService.ts
│   └── mutations.ts                    # applyHopIncrement, applyReplicationDecrement
│
└── native/
    └── KeystoreModule.ts                # EXTEND Module 1's file with sign()/verify()

android/native-modules/keystore/          # EXTEND Module 1's native implementation

tests/
└── protocol/
    ├── CanonicalSerializer.test.ts
    ├── BundleFactory.test.ts
    ├── SecurityService.test.ts
    └── mutations.test.ts
```

---

## 15. Implementation Order

1. Cross-check §6.1 constants, §6.3 immutable field list, and §6.5 message catalogue against the actual EMP spec sections cited — correct any placeholder/reconstructed values before writing code.
2. Implement `constants.ts`.
3. Implement `CanonicalSerializer` + golden-vector test first (everything else depends on this being stable and correct).
4. Extend `KeystoreModule.ts` (TS wrapper) and the native Android bridge with `sign`/`verify`.
5. Implement `SecurityService` on top of the serializer + native bridge.
6. Implement `BundleFactory` on top of `SecurityService` + Module 1's `IdentityManager`.
7. Implement `mutations.ts` guard functions.
8. Implement `messages.ts` protocol message types (pure types, can be done in parallel with steps 2–7).
9. Write remaining unit tests.
10. Write the storage integration test (create → persist via Module 2 → reload → verify).
11. Run full suite; confirm Modules 1–2 tests still pass unmodified.

---

## 16. Final Verification

- [ ] Every constant, immutable-field list, and message type in this module has been cross-checked against the actual frozen EMP spec text (not left as this prompt's placeholder/reconstructed values).
- [ ] `serializeForSigning()` is called from exactly one shared location on both the sign and verify paths — confirmed by code inspection, not just tests.
- [ ] No module outside `protocol/` constructs a bundle object with a `state` field set directly (all creation goes through `BundleFactory`).
- [ ] Confirm this module has zero dependencies on DTN Engine, Transport, Routing, Gateway, or UI packages.
- [ ] Confirm Modules 1 and 2 remain unmodified in behavior (their test suites pass unchanged).
- [ ] Record any deviation (especially any correction to the placeholder constants/field lists in §6) in `DEVIATIONS.md`, appended to the running log from Modules 1–2, before proceeding to the DTN Engine module.

**Do not proceed to the DTN Engine module until every checkbox above is confirmed true — in particular, do not let placeholder TTL/budget values or a reconstructed message catalogue silently ship as if they were verified against the spec.**
