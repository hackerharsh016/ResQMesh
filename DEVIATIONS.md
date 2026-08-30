# Module Deviations Log

## Module 00: Project Bootstrap
- **Folder Structure Redesign**: Converted the standard `src/` boilerplate into a modular top-level root format (`frontend/`, `backend/`, `android/`) to isolate mobile specific code and ease API scaling.
- **SQLite Library**: Selected `react-native-quick-sqlite` due to its active JSI and New Architecture support.
- **Local Notifications & Foreground**: Selected `@notifee/react-native` which is actively maintained and supports New Architecture, solving both notification UI and foreground background processing robustly.
- **Connectivity Detection**: Selected `@react-native-community/netinfo` since it exposes Native Modules cleanly to React Native New Architecture.
- **Navigation**: Selected `react-navigation` stack for robust and widely supported screen transition.
- **Android Networking Setup**: Android native code generation (BLE, Wifi Direct, Wifi Aware) placed directly in `android/app/src/main/java/com/resqmesh/networking/` as React Context Base Java Modules, correctly registered via `ResQMeshPackage`.

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

## Module 10: Advanced Transports
- **Service Name Resolution**: No frozen EMP specification provided a specific Wi-Fi Aware service name, so the provisional `emp-mesh-v1` was retained in `constants.ts`.
- **Manual Device-Level Testing**: Blocked due to execution in a pure Node.js simulated environment. Physical hardware fleet validations (two devices linking via P2P and Aware socket servers) are deferred to the native instrumentation phase.

## Module 11: UI & Advanced Features
- **Pure JS Environment Mocks**: To allow `MeshRuntime.integration.test.ts` to construct the entire app stack seamlessly within the Node test runner, several missing SQLite repository implementations (e.g. `SQLiteProtocolEventRepository`, `SQLiteSyncQueueRepository`) were synthesized as in-memory mocks (`Mocks.ts`). Native SDK wrappers (for Bluetooth and WiFi Direct/Aware) were also implemented as pure object literals.
- **React Native Ecosystem**: The standard React/React-Native `.tsx` view layer screens (`ReportIncidentScreen`, `FeedScreen`, `MeshStatusScreen`, `SettingsScreen`) were correctly scaffolded with proper hooks into `DtnEngine` and `GatewayService` events, but their compilation is not explicitly verified via Jest to bypass the lack of a React DOM polyfill in the current harness.
- **DtnEngine Event Hooks**: Added `onBundleAccepted` and `onBundleStateChanged` tracking as per the Module 11 spec, replacing prior polling strategies in the UI feeds.