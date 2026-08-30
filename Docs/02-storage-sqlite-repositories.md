# MODULE PROMPT — Storage: SQLite Schema, Migrations & Repository Layer

**Project:** Offline Disaster Communication & Delay-Tolerant Emergency Mesh Network (DRM03)
**Protocol:** Emergency Mesh Protocol (EMP) v1.0
**Sequence position:** 2 of N — `Storage` (builds on `Foundation`; precedes `Protocol Primitives`)
**Status:** Ready for implementation

---

## 1. Module Objective

This module gives every future subsystem a single, typed, transactional way to read and write persistent state — without any of them writing raw SQL themselves. It exists so the DTN Engine, Routing Engine, Gateway Service, and UI never touch SQLite directly, per SRS §71–§74 (DTN must not depend on anything but Local DB + Mesh) and Data Model doc §63/§78 (repository layer sits between protocol logic and SQLite).

This module does **not** decide what happens to data (no dedup logic, no TTL expiry decisions, no routing scoring) — it only stores, retrieves, and queries it correctly and efficiently.

---

## 2. Context & Existing Architecture

Relevant frozen source documents:
- SRS §38–§39 (Local Database entities & requirements — transactions, indexed bundle IDs, TTL queries, priority queue queries, crash recovery).
- Protocol Data Model doc §5–§27 (complete schema for all 12 tables + indexes).
- Protocol Data Model doc §63–§64 (`BundleRepository`, `PeerRepository` interface contracts).
- Protocol Data Model doc §78 (Critical Separation of Responsibilities diagram — Repository Layer sits directly above SQLite, below DTN/Routing/Gateway).

**Builds on Module 1 (Foundation):** reuse the existing `storage/database.ts` connection bootstrap and the `storage/migrations/` mechanism already created there for `node_identity`/`local_config` — do not create a second database bootstrap path. This module extends that migration chain; it does not replace it.

**Resolved conflicts carried into this module:**
1. `node_identity.encrypted_private_key` = opaque Keystore reference only (see Module 1). No change needed here, just don't violate it.
2. `bundles.key_id TEXT` (nullable) is an **additive schema extension** beyond the frozen Data Model doc, added to give `SecurityMetadata.keyId` somewhere to live. Document this addition clearly in the migration file's header comment, referencing this decision.

---

## 3. Responsibilities

This module MUST implement:
1. Complete SQLite schema for all remaining tables (everything except `node_identity`/`local_config`, already done in Module 1): `peers`, `peer_transports`, `contacts`, `sessions`, `bundles`, `bundle_hops`, `bundle_acks`, `transfers`, `sync_queue`, `security_events`, `protocol_events`.
2. All recommended indexes from Data Model doc §27, plus the additive ones you determine are necessary for the query patterns in §6 below (document any addition).
3. A migration runner that applies schema changes in order, is idempotent (safe to run on every app start), and tracks applied migration versions.
4. Repository implementations: `BundleRepository`, `PeerRepository`, `ContactRepository`, `SessionRepository`, `TransferRepository`, `BundleAckRepository`, `SyncQueueRepository`, `SecurityEventRepository`, `ProtocolEventRepository`.
5. The row ↔ domain-object mapping layer: SQLite rows are flat; TypeScript domain objects (`EmergencyBundle`, etc.) are nested (`routing`, `security`, `payload`). Repositories must perform this translation in both directions, including deriving `RoutingMetadata.ttlSeconds` from `created_at`/`expires_at` since it is not stored directly.
6. Transaction support for any multi-statement write (e.g. inserting a bundle + its initial `bundle_hops` row atomically).

---

## 4. Non-Responsibilities / Scope Boundaries

Do **NOT** implement in this module:
- Deduplication decision logic (checking "should I accept this bundle" — that's DTN Engine). This module only provides `bundleExists(bundleId)`-style primitives for others to call.
- TTL expiry *decision-making* (deciding a bundle is now invalid). This module only provides `deleteExpired()` / `getExpired()` query primitives; the DTN Engine decides when/why to call them.
- Routing score calculation or next-hop selection.
- Any bundle signing/verification.
- Any transport or networking code.
- Any UI.
- Business rules from Data Model doc §82 (Data Integrity Rules like "hopCount MUST only increase") — this module exposes the *mechanism* (`incrementHop()`, not `setHopCount(arbitrary)`), but the *policy* of when to call it lives in the DTN Engine. Do not add validation logic here beyond preventing obviously malformed writes (e.g. refuse a negative hop count at the repository boundary as a defensive check — that is acceptable and encouraged, distinct from protocol policy).

---

## 5. Dependencies

This module MAY use:
- The SQLite connection/bootstrap created in Module 1 (`storage/database.ts`).
- The migration mechanism started in Module 1 — extend it, do not fork it.
- Types defined in Module 1 (`protocol/types/node.ts`).
- New protocol types this module must define for the entities it persists (see §6) — these are the canonical shapes; do not let repository internals leak flat DB shapes to callers.

This module MUST NOT depend on: DTN Engine, Routing Engine, Transport Manager, Gateway Service, Security Service, or UI packages. It is a leaf/foundation-adjacent layer that everything else depends on, not vice versa.

---

## 6. Interfaces & Contracts

### 6.1 Schema (verbatim from Data Model doc §7–§25, plus the one additive column noted above)

```sql
-- peers
CREATE TABLE peers (
    node_id TEXT PRIMARY KEY NOT NULL,
    public_key TEXT,
    protocol_version TEXT,
    is_gateway INTEGER NOT NULL DEFAULT 0,
    battery_class TEXT,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    encounter_count INTEGER NOT NULL DEFAULT 0,
    successful_transfers INTEGER NOT NULL DEFAULT 0,
    failed_transfers INTEGER NOT NULL DEFAULT 0,
    average_contact_duration_ms INTEGER DEFAULT 0,
    last_signal_strength INTEGER,
    updated_at INTEGER NOT NULL
);

-- peer_transports
CREATE TABLE peer_transports (
    node_id TEXT NOT NULL,
    transport TEXT NOT NULL,
    supported INTEGER NOT NULL DEFAULT 1,
    last_seen_at INTEGER NOT NULL,
    signal_strength INTEGER,
    PRIMARY KEY (node_id, transport),
    FOREIGN KEY (node_id) REFERENCES peers(node_id) ON DELETE CASCADE
);

-- contacts
CREATE TABLE contacts (
    contact_id TEXT PRIMARY KEY NOT NULL,
    peer_node_id TEXT NOT NULL,
    transport TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration_ms INTEGER,
    signal_strength INTEGER,
    bundles_offered INTEGER DEFAULT 0,
    bundles_transferred INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    FOREIGN KEY (peer_node_id) REFERENCES peers(node_id) ON DELETE CASCADE
);

-- sessions
CREATE TABLE sessions (
    session_id TEXT PRIMARY KEY NOT NULL,
    local_node_id TEXT NOT NULL,
    peer_node_id TEXT NOT NULL,
    transport TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    state TEXT NOT NULL,
    protocol_version TEXT,
    created_at INTEGER NOT NULL
);

-- bundles  (NOTE: key_id column is an additive extension — see §2/§3 above)
CREATE TABLE bundles (
    bundle_id TEXT PRIMARY KEY NOT NULL,
    incident_id TEXT,
    origin_node_id TEXT NOT NULL,
    destination_type TEXT NOT NULL,
    destination_node_id TEXT,
    payload_type TEXT NOT NULL,
    priority INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    hop_count INTEGER NOT NULL DEFAULT 0,
    max_hop_count INTEGER NOT NULL,
    replication_budget INTEGER NOT NULL,
    state TEXT NOT NULL,
    payload TEXT NOT NULL,
    signature TEXT NOT NULL,
    key_id TEXT,                              -- ADDITIVE: supports SecurityMetadata.keyId (see conflict resolution)
    integrity_hash TEXT NOT NULL,
    created_locally INTEGER NOT NULL DEFAULT 0,
    received_at INTEGER,
    delivered_at INTEGER,
    updated_at INTEGER NOT NULL
);

-- bundle_hops
CREATE TABLE bundle_hops (
    hop_id TEXT PRIMARY KEY NOT NULL,
    bundle_id TEXT NOT NULL,
    from_node_id TEXT NOT NULL,
    to_node_id TEXT NOT NULL,
    transport TEXT NOT NULL,
    hop_number INTEGER NOT NULL,
    transferred_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY (bundle_id) REFERENCES bundles(bundle_id) ON DELETE CASCADE
);

-- bundle_acks
CREATE TABLE bundle_acks (
    ack_id TEXT PRIMARY KEY NOT NULL,
    bundle_id TEXT NOT NULL,
    ack_type TEXT NOT NULL,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT,
    created_at INTEGER NOT NULL,
    received_at INTEGER,
    FOREIGN KEY (bundle_id) REFERENCES bundles(bundle_id) ON DELETE CASCADE
);

-- transfers
CREATE TABLE transfers (
    transfer_id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    bundle_id TEXT NOT NULL,
    sender_node_id TEXT NOT NULL,
    receiver_node_id TEXT NOT NULL,
    transport TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    bytes_sent INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    error_code TEXT,
    FOREIGN KEY (bundle_id) REFERENCES bundles(bundle_id) ON DELETE CASCADE
);

-- sync_queue
CREATE TABLE sync_queue (
    bundle_id TEXT PRIMARY KEY NOT NULL,
    gateway_node_id TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER,
    next_attempt_at INTEGER,
    status TEXT NOT NULL,
    server_receipt_id TEXT,
    last_error TEXT,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (bundle_id) REFERENCES bundles(bundle_id) ON DELETE CASCADE
);

-- security_events
CREATE TABLE security_events (
    event_id TEXT PRIMARY KEY NOT NULL,
    peer_node_id TEXT,
    bundle_id TEXT,
    event_type TEXT NOT NULL,
    details TEXT,
    created_at INTEGER NOT NULL
);

-- protocol_events
CREATE TABLE protocol_events (
    event_id TEXT PRIMARY KEY NOT NULL,
    event_type TEXT NOT NULL,
    node_id TEXT,
    bundle_id TEXT,
    session_id TEXT,
    details TEXT,
    created_at INTEGER NOT NULL
);
```

### 6.2 Indexes (verbatim from Data Model doc §27, plus justified additions)

```sql
CREATE INDEX idx_bundles_state ON bundles(state);
CREATE INDEX idx_bundles_priority ON bundles(priority);
CREATE INDEX idx_bundles_expiry ON bundles(expires_at);
CREATE INDEX idx_bundles_origin ON bundles(origin_node_id);
CREATE INDEX idx_bundles_incident ON bundles(incident_id);
CREATE INDEX idx_hops_bundle ON bundle_hops(bundle_id);
CREATE INDEX idx_acks_bundle ON bundle_acks(bundle_id);
CREATE INDEX idx_transfers_bundle ON transfers(bundle_id);
CREATE INDEX idx_transfers_session ON transfers(session_id);
CREATE INDEX idx_contacts_peer ON contacts(peer_node_id);
CREATE INDEX idx_contacts_last_seen ON peers(last_seen_at);
CREATE INDEX idx_sync_status ON sync_queue(status);

-- ADDITIVE (justify in migration comment): needed for Gateway/Routing lookups not covered above
CREATE INDEX idx_sessions_peer ON sessions(peer_node_id);
CREATE INDEX idx_sessions_state ON sessions(state);
CREATE INDEX idx_peers_gateway ON peers(is_gateway);
```

Do not add indexes beyond what's justified by a concrete query in §6.3 — each additive index must have a one-line comment naming which repository method needs it.

### 6.3 Repository interfaces to implement

```typescript
// From Data Model doc §63 — implement verbatim
export interface BundleRepository {
  create(bundle: EmergencyBundle): Promise<void>;
  getById(bundleId: string): Promise<EmergencyBundle | null>;
  getPending(limit?: number): Promise<EmergencyBundle[]>;
  getSummaries(): Promise<BundleSummary[]>;
  markState(bundleId: string, state: BundleState): Promise<void>;
  incrementHop(bundleId: string): Promise<void>;
  decrementReplicationBudget(bundleId: string): Promise<void>;
  deleteExpired(): Promise<number>;
}

// From Data Model doc §64 — implement verbatim
export interface PeerRepository {
  upsert(peer: Peer): Promise<void>;
  getById(nodeId: string): Promise<Peer | null>;
  getRecentPeers(limit?: number): Promise<Peer[]>;
  recordEncounter(peerNodeId: string, durationMs: number): Promise<void>;
  recordTransferSuccess(peerNodeId: string): Promise<void>;
  recordTransferFailure(peerNodeId: string): Promise<void>;
}

// New — consistent with the pattern above, not in frozen docs verbatim,
// but required to cover tables the docs define without an explicit interface.
// Flag any deviation from this shape before implementing.
export interface ContactRepository {
  create(contact: Contact): Promise<void>;
  update(contactId: string, patch: Partial<Contact>): Promise<void>;
  getByPeer(peerNodeId: string, limit?: number): Promise<Contact[]>;
}

export interface SessionRepository {
  create(session: ProtocolSession): Promise<void>;
  updateState(sessionId: string, state: SessionState): Promise<void>;
  getActiveByPeer(peerNodeId: string): Promise<ProtocolSession | null>;
}

export interface TransferRepository {
  create(transfer: BundleTransfer): Promise<void>;
  updateStatus(transferId: string, status: TransferStatus, patch?: Partial<BundleTransfer>): Promise<void>;
  getByBundle(bundleId: string): Promise<BundleTransfer[]>;
}

export interface BundleAckRepository {
  create(ack: BundleAck): Promise<void>;
  getByBundle(bundleId: string): Promise<BundleAck[]>;
}

export interface SyncQueueRepository {
  enqueue(item: GatewaySyncItem): Promise<void>;
  getWaiting(limit?: number): Promise<GatewaySyncItem[]>;
  updateStatus(bundleId: string, status: SyncStatus, patch?: Partial<GatewaySyncItem>): Promise<void>;
}

export interface SecurityEventRepository {
  log(event: { peerNodeId?: string; bundleId?: string; eventType: string; details?: string }): Promise<void>;
}

export interface ProtocolEventRepository {
  log(event: { eventType: string; nodeId?: string; bundleId?: string; sessionId?: string; details?: string }): Promise<void>;
}
```

Also add a `BundleHopRepository` following the same pattern (`create`, `getByBundle`) — the schema table exists (`bundle_hops`) but no explicit TS interface was frozen for it either; treat it the same as `ContactRepository` (flag deviations, don't invent unrelated methods).

---

## 7. Implementation Requirements

- Every repository method must map flat SQLite rows to/from the nested domain interfaces (`EmergencyBundle.routing`, `.security`, `.payload` reconstructed from flat columns; `RoutingMetadata.ttlSeconds` derived as `(expires_at - created_at) / 1000`).
- `payload TEXT` column stores `JSON.stringify(EmergencyPayload)`; repository parses/serializes transparently — callers never see raw JSON strings.
- `incrementHop` and `decrementReplicationBudget` must be atomic single-statement updates (`UPDATE bundles SET hop_count = hop_count + 1 ...`), not read-modify-write from JS, to avoid races.
- `getPending(limit)` must order by priority ascending (0=CRITICAL first) then `expires_at` ascending (earliest expiry first) within the same priority — per SRS §17/§38 and EMP §38 (Priority → Expiry, not FIFO).
- `deleteExpired()` must only ever delete rows where `state` is not already a protected terminal state your later DTN module will define as "protect P0" — for this module, implement it as `expires_at < now`, full stop; any priority-based protection policy (SRS §66, "never blindly delete active P0 bundles") is a DTN Engine *policy* decision about *when* to call this method, not something this repository method should encode itself. Document this boundary in a code comment so the next agent doesn't conflate the two.
- Migration runner must record applied migrations in a `schema_migrations` table (`version INTEGER PRIMARY KEY, applied_at INTEGER`) and skip already-applied ones — must be safe to run on every cold start.
- All multi-table writes (e.g., inserting a bundle plus a `SecurityEvent` for an invalid signature) must be wrapped in a single SQLite transaction.

---

## 8. Data Flow

```
Caller (future: DTN Engine, Routing Engine, Gateway Service)
        │
        ▼
Repository interface method call
        │
        ▼
Row ↔ Domain mapper (serialize/deserialize payload, reconstruct nested objects)
        │
        ▼
SQLite statement (parameterized, never string-concatenated)
        │
        ▼
Result mapped back to typed domain object / primitive
        │
        ▼
Returned to caller
```

Migration flow (app cold start, after Module 1's `database.ts` opens the connection):

```
database.ts: open connection
        │
        ▼
MigrationRunner.applyPending()
        │
        ▼
schema_migrations checked → apply any migration file not yet recorded, in order
        │
        ▼
Repositories become safe to use
```

---

## 9. Error Handling & Edge Cases

- Foreign key violation (e.g. inserting a `contact` for a `peer_node_id` that doesn't exist yet) → surface a clear typed error; do not silently create a placeholder peer row (that's a policy decision for the caller, e.g. Peer discovery module, not this layer).
- Migration failure partway through → must not leave `schema_migrations` marked as applied for a migration that partially failed; wrap each migration file's statements in a transaction.
- Duplicate primary key insert (e.g. `BundleRepository.create()` called twice with the same `bundleId`) → must throw a distinguishable error (e.g. `DuplicateBundleError`) rather than a generic SQLite constraint error leaking upward — callers (DTN Engine's dedup logic) need to catch this specifically.
- Querying a non-existent `bundleId`/`nodeId`/etc. → return `null` (for single-item getters) or `[]` (for list getters), never throw.
- Corrupt/unparseable `payload` JSON in a stored bundle row → `getById`/`getPending` must not crash the whole query batch; log via `ProtocolEventRepository`-style mechanism (or console warning if that repo isn't wired yet) and skip/flag the row rather than throwing across the whole result set.
- Storage full (SQLite write failure due to disk space) → propagate error; do not implement eviction policy here (that's the DTN Engine's job per SRS §66, this module just executes `deleteExpired()`/whatever eviction calls it receives).

---

## 10. Security Requirements

- All queries must use parameterized statements — no string interpolation of any external/untrusted value (bundle payloads, peer-supplied IDs, etc.) into SQL.
- `security_events` logging must not itself become an attack vector — cap `details` field length to prevent a malicious peer from writing unbounded data into local storage via crafted event details.
- This module does not verify signatures or validate bundle authenticity — that's the Security Service. Do not add signature-checking logic here; only store what you're given.

---

## 11. Android / React Native Boundary

This entire module is **TypeScript/React Native side only**. No native code is required — SQLite access goes through whichever JS/TS SQLite binding the repo already uses (inspect Module 1's `database.ts` and reuse the same library/connection). Do not introduce native modules for this module.

---

## 12. Testing Requirements

**Unit tests (per repository):**
- CRUD round-trip for each repository (create → getById/getByX → matches input).
- `BundleRepository.getPending()` ordering: verify priority-then-expiry ordering with a mixed dataset (P0 with later expiry vs P1 with earlier expiry — P0 must come first; two P0s — earlier expiry first).
- `incrementHop` / `decrementReplicationBudget` atomicity: run concurrent increments (simulate via `Promise.all`) and assert the final count equals the number of calls (no lost updates).
- `deleteExpired()` deletes only rows with `expires_at < now`, leaves others untouched.
- Duplicate `create()` on same `bundleId` throws `DuplicateBundleError`, does not create a second row.
- Row↔domain mapping: round-trip a bundle with a full nested payload/routing/security object and assert deep equality after read-back.

**Integration tests:**
- Migration runner applied twice in a row (simulating two cold starts) results in identical schema state, no errors, `schema_migrations` has each version exactly once.
- Cross-table transaction (bundle insert + associated security event) either fully commits or fully rolls back on simulated mid-transaction failure.
- Foreign-key cascade: deleting a `peer` row cascades to `peer_transports` and `contacts` per `ON DELETE CASCADE`.

---

## 13. Acceptance Criteria

- [ ] All 11 tables in §6.1 exist with exact column names/types/constraints as specified (plus the one documented additive `key_id` column).
- [ ] All indexes in §6.2 exist, with additive ones commented with their justifying query.
- [ ] Every repository interface in §6.3 is implemented and passes its unit tests.
- [ ] No repository method accepts or returns a raw flat DB row shape to callers outside the storage module — only domain types.
- [ ] `getPending()` ordering verified correct by test.
- [ ] Migration runner is idempotent and transactional per test.
- [ ] Zero string-concatenated SQL anywhere in the module (grep-checked).
- [ ] No dedup/TTL-policy/routing-scoring logic exists in this module (only mechanism, not policy).

---

## 14. Files / Folder Structure

```
src/
├── protocol/
│   └── types/
│       ├── bundle.ts          # EmergencyBundle, BundleSummary, RoutingMetadata,
│       │                      # SecurityMetadata, EmergencyPayload, GeoLocation,
│       │                      # SenderMetadata, BundleState, Priority, DestinationType,
│       │                      # EmergencyType, Severity  (extend, don't duplicate, if
│       │                      # Module 1 already stubbed any of these)
│       ├── peer.ts            # Peer, PeerTransport, Contact, ContactStatus
│       ├── session.ts         # ProtocolSession, SessionState
│       ├── transfer.ts        # BundleTransfer, TransferStatus, BundleHop
│       └── ack.ts             # BundleAck, AckType, GatewaySyncItem, SyncStatus
│
├── storage/
│   ├── database.ts                      # EXTEND Module 1's file, do not replace
│   ├── MigrationRunner.ts               # new
│   ├── migrations/
│   │   ├── 0001_node_identity_and_local_config.sql   # from Module 1 (untouched)
│   │   └── 0002_core_protocol_tables.sql             # this module — all tables + indexes
│   └── repositories/
│       ├── BundleRepository.ts
│       ├── PeerRepository.ts
│       ├── ContactRepository.ts
│       ├── SessionRepository.ts
│       ├── TransferRepository.ts
│       ├── BundleAckRepository.ts
│       ├── BundleHopRepository.ts
│       ├── SyncQueueRepository.ts
│       ├── SecurityEventRepository.ts
│       └── ProtocolEventRepository.ts
│
└── storage/mappers/
    └── BundleMapper.ts        # row ↔ domain object translation, isolated for testability

tests/
└── storage/
    ├── BundleRepository.test.ts
    ├── PeerRepository.test.ts
    ├── MigrationRunner.test.ts
    └── ... (one per repository)
```

---

## 15. Implementation Order

1. Inspect Module 1's `storage/database.ts` and migration mechanism; confirm extension points.
2. Write `0002_core_protocol_tables.sql` (all tables + indexes from §6.1–§6.2), with the `key_id` addition commented.
3. Implement `MigrationRunner` (or extend Module 1's if one already exists) with `schema_migrations` tracking.
4. Define all new TypeScript types (§6.3 imports) in `protocol/types/`.
5. Implement `BundleMapper` (row↔domain translation) in isolation with its own unit tests first — everything else depends on it being correct.
6. Implement `BundleRepository` (most complex, most used downstream) fully, with tests.
7. Implement `PeerRepository`, `ContactRepository`, `SessionRepository`.
8. Implement `TransferRepository`, `BundleAckRepository`, `BundleHopRepository`.
9. Implement `SyncQueueRepository`, `SecurityEventRepository`, `ProtocolEventRepository`.
10. Run full migration idempotency + cascade integration tests.
11. Run full test suite; confirm Module 1's tests still pass unmodified.

---

## 16. Final Verification

- [ ] Every column name/type in the schema matches Data Model doc §7–§25 exactly, with only the one documented additive column (`bundles.key_id`).
- [ ] Every index in Data Model doc §27 is present; every additional index is justified by a named query in a comment.
- [ ] `BundleRepository` and `PeerRepository` method signatures match Data Model doc §63–§64 exactly — no renamed or added public methods without a documented reason.
- [ ] No business/policy logic (dedup decisions, TTL expiry decisions, eviction priority, routing scores) has leaked into this module — confirm by searching for any conditional logic that references `Priority`/`BundleState` for anything other than storage/sorting purposes.
- [ ] Confirm SRS §71 (DTN must not depend on Supabase) is not violated — this module has zero references to Supabase, HTTP, or any network client.
- [ ] Confirm Module 1's identity tables/migration are untouched and its tests still pass.
- [ ] Any deviation from this prompt is recorded in `DEVIATIONS.md` (append to the one from Module 1 if it exists) before proceeding to Module 3.

**Do not proceed to the Protocol Primitives module until every checkbox above is confirmed true.**
