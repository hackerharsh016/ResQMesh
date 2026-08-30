# Module Deviations Log

## Module 03: Protocol Primitives
- Created a pseudo-crypto stub for `integrityHash` using `String.charCodeAt` since `react-native-quick-crypto` is not present in standard Node.js without polyfills. A comment indicates where to insert `createHash('sha256')` in the real app.

## Module 04: DTN Engine
- When performing manual eviction due to storage pressure (`STORAGE_FULL`), `BundleRepository` (from Module 02) lacks a `deleteById` method. The DTN engine satisfies the eviction requirement by transitioning the evicted bundle's state to `EXPIRED` so it gets garbage collected during `deleteExpired()`, instead of forcibly deleting it via raw SQL in the DTN layer.

## Module 05: Transport Abstraction
- Added PeerTransportRepository as specified in the Module 05 specification. This was missing from Module 02 specification but was added here to support multi-transport peer tracking.

## Module 06: BLE Transport
- BLE UUIDs (Service, Write, Notify) were not defined in the frozen core EMP specifications provided previously, so the placeholder UUIDs from the Module 06 prompt were retained as the official v1 UUIDs.

## Module 07: Peer Discovery
- Extended TransportManager (Module 05) with sendToAddress, onRawPeerDiscovered, onRawMessageReceived, and implemented registerPeerIdentity to support pre-identity handshake logic.
- Finalized SessionState enum in discovery/types.ts which was previously a placeholder in Module 02.