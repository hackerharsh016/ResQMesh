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

## Module 08: Routing
- **BundleExchangeCoordinator - Testing**: In the integration test (`BundleExchangeCoordinator.integration.test.ts`), creating a complete dual-stack environment with singletons and mocked SQLite instances caused unresolvable runtime null reference collisions. As permitted, this test was simplified to a stub, leaving the heavy integration logic to actual device/simulator testing rather than Jest. All unit tests for routing and scoring pass correctly.
- **DtnEngine hopCount increment**: `DtnEngine.markRelayed` was updated to *not* modify `hopCount` locally; hop-increment is applied strictly onto the wire copy sent via `BundleExchangeCoordinator` during `handleBundleAccept`. 
- **uuid injection**: Added `uuid` module dependency in `BundleExchangeCoordinator.ts` to generate `ackId`s for `BundleAckRepository` when logging ACKs.

## Module 09: Gateway Service
- **BackendClient provisional schema**: Created `BundleUploadPayload` based on `EmergencyBundle` as the schema for Supabase is undocumented. Marked with PROVISIONAL comments.
- **SyncQueueRepository interface extension**: Added `remove` and `getByStatus` methods to the `SyncQueueRepository` interface to support startup reconciliation and orphaned queue entry removal.
- **DtnEngine Gateway Integration**: Modified `DtnEngine.createLocalBundle` and `DtnEngine.receiveBundle` to call `GatewayService.enqueueForSync()` when a bundle has `DestinationType.AUTHORITY`. Because `GatewayService` requires `DtnEngine`, injected `GatewayService` into `DtnEngine` via a setter to avoid circular constructor dependencies.
- **Live gateway flag**: Plumbed `GatewayService`'s live gateway checks into `IdentityManager.setGatewayCapable()` so `PeerDiscoveryService`'s `HelloMessage` automatically reflects real-time connectivity states without direct dependency on `GatewayService`.