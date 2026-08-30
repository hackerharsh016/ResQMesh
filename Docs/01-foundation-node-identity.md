# MODULE PROMPT — Foundation: Node Identity & Local Configuration

**Project:** Offline Disaster Communication & Delay-Tolerant Emergency Mesh Network (DRM03)
**Protocol:** Emergency Mesh Protocol (EMP) v1.0
**Sequence position:** 1 of N — `Foundation` (precedes `Storage`, `Protocol Primitives`, `DTN Engine`, ...)
**Status:** Ready for implementation

---

## 1. Module Objective

This module establishes the **cryptographic and application-level identity of the device**. Every other subsystem — bundle signing, peer trust, gateway sessions, ACK attribution — depends on a stable, non-hardware-derived `nodeId` and a securely managed keypair existing before any other code runs.

This module exists so that:
- The device has a persistent identity across app restarts (SRS §42, EMP §5–6).
- Cryptographic signing of bundles is possible later (EMP §24, §97).
- No other module has to reason about identity bootstrap or key storage — they just consume `NodeIdentity`.

This is intentionally the **first and smallest** module. It does not touch bundles, transports, or SQLite beyond its own table.

---

## 2. Context & Existing Architecture

Relevant frozen source documents (treat as ground truth, cite section numbers in code comments where non-obvious):
- SRS §42 (Device Identity), §43 (Security Requirements), §49 (Android Permission Requirements — not yet relevant here, but do not violate later).
- EMP Core Protocol Spec §5 (Node Identity), §6 (Cryptographic Identity).
- Protocol Data Model doc §5 (`node_identity` table), §6 (`local_config` table), §31 (`NodeIdentity` interface), §32 (`NodeCapabilities` interface).

**Resolved conflict (see conversation):** `node_identity.encrypted_private_key` is an **opaque reference/handle** into Android Keystore-managed material, not decryptable ciphertext accessible to JS. `NodeIdentity.privateKeyRef` is the canonical TypeScript name for this same opaque value. No raw private key bytes may ever cross the native→JS bridge.

---

## 3. Responsibilities

This module MUST implement:
1. First-run detection: check whether a `node_identity` row exists.
2. If absent: generate a new Ed25519 (or equivalent asymmetric) keypair via the native Android Keystore bridge, generate a `nodeId` satisfying EMP §5 constraints, and persist the identity record.
3. If present: load and expose the existing identity.
4. Expose a `NodeIdentity` object (per Data Model §31) to the rest of the app, with `privateKeyRef` only — never raw key material.
5. Provide a `local_config` key/value store (Data Model §6) for experimentally-tunable parameters (e.g. `max_bundle_size`, `max_hop_count`), with typed getters/setters and sane defaults.
6. Expose device capability metadata shape (`NodeCapabilities`, Data Model §32) — values may be stubbed/static in this module (e.g. `gateway: false`, `batteryClass: NORMAL`) since battery/transport detection belongs to later modules. Do not wire real sensors here.

---

## 4. Non-Responsibilities / Scope Boundaries

Do **NOT** implement in this module:
- Bundle creation, signing, or verification logic (belongs to Protocol Primitives / Security Service modules).
- Peer discovery, sessions, or HELLO handshake (belongs to Transport/Routing modules).
- Real battery-level reading, transport capability probing, or gateway detection (belongs to later modules — stub only).
- Full SQLite schema/migrations for all tables (belongs to Storage module) — this module may create only its own two tables (`node_identity`, `local_config`) behind the repository interface it defines, but must not preclude the Storage module from owning migrations going forward (see §14).
- Any UI screens.
- Any networking code.

If you find yourself needing any of the above to "finish" this module, stop and flag it — it means scope has leaked.

---

## 5. Dependencies

This module MAY use:
- A native Android Keystore bridge (Turbo Native Module) for key generation and signing capability exposure — build a minimal one if it does not exist yet (`generateKeyPair()`, `getPublicKey(alias)`, and a placeholder `sign(alias, data)` stub that later modules will call; do not implement full signing semantics here beyond exposing the capability).
- SQLite (via whatever DB access layer the project has standardized on, e.g. `react-native-quick-sqlite` / `expo-sqlite` / `op-sqlite` — inspect the repo first; do not introduce a second SQLite library if one is already present).
- No other application modules — this is a leaf dependency for the rest of the system.

This module MUST NOT depend on: DTN engine, Routing engine, Transport Manager, Gateway Service, or any UI package beyond what's already in the repo.

---

## 6. Interfaces & Contracts

Implement exactly (do not rename fields):

```typescript
// protocol/types/node.ts

export interface NodeIdentity {
  nodeId: string;
  publicKey: string;

  /**
   * Opaque reference to Android Keystore-protected key material.
   * Never contains raw private key bytes. Not decryptable in JS.
   */
  privateKeyRef: string;

  protocolVersion: string;

  createdAt: number;
  updatedAt: number;
}

export enum BatteryClass {
  LOW = "LOW",
  NORMAL = "NORMAL",
  HIGH = "HIGH",
}

export interface NodeCapabilities {
  transports: TransportType[]; // import from existing/shared enum once Transport module exists; stub as [] for now
  gateway: boolean;
  maxBundleSize: number;
  batteryClass: BatteryClass;
}
```

SQLite tables (verbatim from Data Model doc §5, §6):

```sql
CREATE TABLE node_identity (
    node_id TEXT PRIMARY KEY NOT NULL,
    public_key TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    protocol_version TEXT NOT NULL DEFAULT '1.0',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE local_config (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
```

Repository contract to define (new, minimal — will later be absorbed into the broader repository layer from the Storage module without changing its public method signatures):

```typescript
export interface IdentityRepository {
  getIdentity(): Promise<NodeIdentity | null>;
  saveIdentity(identity: NodeIdentity): Promise<void>;
}

export interface LocalConfigRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  getNumber(key: string, fallback: number): Promise<number>;
}
```

---

## 7. Implementation Requirements

- `nodeId` generation must satisfy EMP §5: globally unique with extremely high probability, non-sensitive, independent of MAC address, persistent across restarts, not derived from phone number. Recommended: `EMP-` + UUIDv4 or ULID. Do not use `Settings.Secure.ANDROID_ID`, IMEI, or any hardware identifier as the seed.
- Keypair generation must happen inside the native Keystore bridge, not in JS with a JS crypto library — the private key must never exist as a JS-accessible value at any point.
- `IdentityManager.initialize()` must be idempotent: calling it twice must not regenerate identity or duplicate keys.
- `local_config` defaults (`max_bundle_size = 8192`, `max_hop_count = 20`, etc.) must be seeded on first run only, and must not overwrite existing user/experiment-modified values on subsequent app starts.
- All timestamps are Unix epoch milliseconds (integers), consistent with the rest of the data model.
- Protocol version constant must be centralized (per EMP §95, Protocol Constants) — do not hardcode `"1.0"` in more than one place; define it once (e.g. `PROTOCOL_VERSION` constant) and reference it.

---

## 8. Data Flow

```
App cold start
      │
      ▼
IdentityManager.initialize()
      │
      ▼
IdentityRepository.getIdentity()
      │
   ┌──┴───┐
  found   not found
   │         │
   │         ▼
   │   NativeKeystoreBridge.generateKeyPair()
   │         │
   │         ▼
   │   build NodeIdentity { nodeId, publicKey, privateKeyRef, ... }
   │         │
   │         ▼
   │   IdentityRepository.saveIdentity()
   │         │
   └────┬────┘
        ▼
  NodeIdentity held in memory (singleton/module-scope),
  exposed via IdentityManager.getIdentity()
```

`local_config` flow is independent and read/write on demand by any future module (e.g. Routing reading `max_hop_count`).

---

## 9. Error Handling & Edge Cases

- Native Keystore generation failure (e.g. hardware-backed keystore unavailable on low-end device) → must throw a typed error (`IdentityGenerationError`), must NOT silently fall back to storing a plaintext key in SQLite.
- App killed mid-generation (identity row partially written) → on next `initialize()`, detect incomplete/corrupt row (e.g. missing `public_key`) and regenerate from scratch rather than crash-looping.
- Concurrent calls to `initialize()` (e.g. two app entry points racing) → must be safe; use a single in-flight promise guard so only one generation attempt occurs.
- `local_config.get()` for a key that was never seeded → return `null` (caller decides fallback), do not throw.
- SQLite unavailable/locked at startup → propagate a clear error; this is a fatal condition for the app (nothing else can function without identity), do not mask it.

---

## 10. Security Requirements

- Private key material must never leave native code. No `privateKey: string` field should ever exist on any JS-visible object.
- Use Android Keystore-backed key generation with hardware-backed storage where the device supports it; document (in code comment) the fallback behavior if hardware-backed keystore is unavailable, but do not implement a JS-side fallback in this module — flag it as a decision point instead if the native bridge doesn't already handle it.
- `publicKey` may be freely stored and later transmitted (per EMP HELLO §11) — it is not sensitive.
- Do not log `privateKeyRef`, `nodeId` generation seed material, or any Keystore alias to console/analytics in a way that could aid correlation attacks — treat `nodeId` as pseudonymous but not secret.

---

## 11. Android / React Native Boundary

**TypeScript/React Native side:**
- `IdentityManager`, `IdentityRepository`, `LocalConfigRepository`, all TS interfaces/types, SQLite table creation/queries for these two tables, `nodeId` generation (UUID/ULID logic can live in JS — it's not sensitive), business/orchestration logic.

**Native (Android) side, via Turbo Native Module:**
- Actual Keystore keypair generation (`generateKeyPair(alias): { publicKey }`).
- Any future signing/verification calls (stub the method signature now, implement fully in the Security module).
- Must use React Native's Codegen-based Turbo Native Module pattern per SRS §14, not a bespoke bridge.

Do not implement Keystore access via a JS-side "polyfill" or a third-party JS crypto library pretending to be secure storage — that violates SRS §43 (Security Requirements) and the resolved conflict above.

---

## 12. Testing Requirements

**Unit tests (TS, Jest):**
- `IdentityManager.initialize()` creates identity on first run.
- `IdentityManager.initialize()` is idempotent (second call returns same `nodeId`).
- `LocalConfigRepository` seeds defaults once; does not overwrite modified values on re-seed attempt.
- `nodeId` format validation (matches expected prefix/uniqueness pattern) across N generated instances (no collisions in a reasonable sample).
- Concurrent `initialize()` calls resolve to identical identity (race condition test).

**Integration tests:**
- Full round trip: generate identity → app "restart" (fresh module instance, same SQLite file) → identity loaded matches original `nodeId`/`publicKey`.
- Corrupt/partial `node_identity` row → regeneration path exercised.

**Native/device-level tests (manual or instrumented, document as TODO if infra isn't ready):**
- Verify key is actually hardware-backed where device supports it (via Keystore inspection).
- Verify no private key material appears in any logcat output during generation.

---

## 13. Acceptance Criteria

- [ ] Fresh install produces exactly one `node_identity` row with a valid `nodeId`, `publicKey`, and non-empty `privateKeyRef`.
- [ ] No code path anywhere sets or reads a field literally containing raw private key bytes.
- [ ] Restarting the app reuses the existing identity (no regeneration, no duplicate rows).
- [ ] `local_config` has documented default values seeded on first run and is independently readable/writable.
- [ ] All new types exactly match the interface names/shapes in §6 of this prompt (which mirror the frozen Data Model doc) — no renamed fields.
- [ ] All tests in §12 pass.
- [ ] No references to DTN, Routing, Transport, or Gateway modules exist in this module's code.

---

## 14. Files / Folder Structure

Create/modify (inspect repo first — adapt paths if an existing structure already partially exists; do not create a second parallel structure):

```
src/
├── protocol/
│   └── types/
│       └── node.ts                    # NodeIdentity, NodeCapabilities, BatteryClass
│
├── identity/
│   ├── IdentityManager.ts             # orchestration: initialize(), getIdentity()
│   ├── IdentityRepository.ts          # SQLite-backed implementation of IdentityRepository interface
│   └── LocalConfigRepository.ts       # SQLite-backed implementation
│
├── storage/
│   ├── database.ts                    # SQLite connection bootstrap (create if absent; Storage module will extend, not replace)
│   └── migrations/
│       └── 0001_node_identity_and_local_config.sql   # the two CREATE TABLE statements from §6
│
└── native/
    └── KeystoreModule.ts               # TS-side typed wrapper around the Turbo Native Module

android/native-modules/
└── keystore/                           # native Keystore bridge implementation

tests/
├── identity/
│   ├── IdentityManager.test.ts
│   └── LocalConfigRepository.test.ts
```

If a `storage/database.ts` or migrations folder already exists from prior work, extend it — do not create a competing DB bootstrap file.

---

## 15. Implementation Order

1. Inspect repo for existing SQLite setup, native module conventions, and any pre-existing `node.ts`/identity code. Reuse what exists.
2. Define TypeScript types (§6) in `protocol/types/node.ts`.
3. Add migration `0001_node_identity_and_local_config.sql`.
4. Implement `KeystoreModule.ts` TS wrapper + native Android Keystore bridge (keypair generation only for now).
5. Implement `IdentityRepository` and `LocalConfigRepository` against SQLite.
6. Implement `IdentityManager` orchestration (first-run detection, generation, idempotency guard).
7. Seed `local_config` defaults.
8. Write unit tests (§12).
9. Write integration test (restart simulation).
10. Run full test suite; confirm no regressions in any pre-existing code.

---

## 16. Final Verification

Before declaring this module complete, verify against the frozen documentation:

- [ ] Cross-check every field name in your `NodeIdentity`/`NodeCapabilities` implementation against Data Model doc §31–§32 — zero deviations.
- [ ] Cross-check SQLite table definitions against Data Model doc §5–§6 — zero deviations (except the reinterpreted semantics of `encrypted_private_key` as documented in the resolved conflict above, which must be noted in a code comment on that column's usage).
- [ ] Confirm no SRS non-goal or critical architectural decision (SRS §5, §71–§73) has been violated — in particular, this module must not give the UI or any business-logic layer direct access to native Keystore APIs; access must go through `IdentityManager`.
- [ ] Confirm `PROTOCOL_VERSION` is defined once and referenced, not duplicated as a string literal.
- [ ] If any deviation from this prompt was necessary, document it explicitly in a `DEVIATIONS.md` note in the module folder, explaining why, before proceeding to the next module.

**Do not proceed to the Storage module until every checkbox above is confirmed true.**
