-- peers
CREATE TABLE IF NOT EXISTS peers (
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
CREATE TABLE IF NOT EXISTS peer_transports (
    node_id TEXT NOT NULL,
    transport TEXT NOT NULL,
    supported INTEGER NOT NULL DEFAULT 1,
    last_seen_at INTEGER NOT NULL,
    signal_strength INTEGER,
    PRIMARY KEY (node_id, transport),
    FOREIGN KEY (node_id) REFERENCES peers(node_id) ON DELETE CASCADE
);

-- contacts
CREATE TABLE IF NOT EXISTS contacts (
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
CREATE TABLE IF NOT EXISTS sessions (
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

-- bundles  (NOTE: key_id column is an additive extension — see conflict resolution)
CREATE TABLE IF NOT EXISTS bundles (
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
    key_id TEXT,                              -- ADDITIVE: supports SecurityMetadata.keyId
    integrity_hash TEXT NOT NULL,
    created_locally INTEGER NOT NULL DEFAULT 0,
    received_at INTEGER,
    delivered_at INTEGER,
    updated_at INTEGER NOT NULL
);

-- bundle_hops
CREATE TABLE IF NOT EXISTS bundle_hops (
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
CREATE TABLE IF NOT EXISTS bundle_acks (
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
CREATE TABLE IF NOT EXISTS transfers (
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
CREATE TABLE IF NOT EXISTS sync_queue (
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
CREATE TABLE IF NOT EXISTS security_events (
    event_id TEXT PRIMARY KEY NOT NULL,
    peer_node_id TEXT,
    bundle_id TEXT,
    event_type TEXT NOT NULL,
    details TEXT,
    created_at INTEGER NOT NULL
);

-- protocol_events
CREATE TABLE IF NOT EXISTS protocol_events (
    event_id TEXT PRIMARY KEY NOT NULL,
    event_type TEXT NOT NULL,
    node_id TEXT,
    bundle_id TEXT,
    session_id TEXT,
    details TEXT,
    created_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bundles_state ON bundles(state);
CREATE INDEX IF NOT EXISTS idx_bundles_priority ON bundles(priority);
CREATE INDEX IF NOT EXISTS idx_bundles_expiry ON bundles(expires_at);
CREATE INDEX IF NOT EXISTS idx_bundles_origin ON bundles(origin_node_id);
CREATE INDEX IF NOT EXISTS idx_bundles_incident ON bundles(incident_id);
CREATE INDEX IF NOT EXISTS idx_hops_bundle ON bundle_hops(bundle_id);
CREATE INDEX IF NOT EXISTS idx_acks_bundle ON bundle_acks(bundle_id);
CREATE INDEX IF NOT EXISTS idx_transfers_bundle ON transfers(bundle_id);
CREATE INDEX IF NOT EXISTS idx_transfers_session ON transfers(session_id);
CREATE INDEX IF NOT EXISTS idx_contacts_peer ON contacts(peer_node_id);
CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON peers(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status);

-- ADDITIVE: needed for SessionRepository.getActiveByPeer
CREATE INDEX IF NOT EXISTS idx_sessions_peer ON sessions(peer_node_id);
-- ADDITIVE: needed for SessionRepository state lookups/cleanup
CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
-- ADDITIVE: needed for Gateway discovery querying
CREATE INDEX IF NOT EXISTS idx_peers_gateway ON peers(is_gateway);
