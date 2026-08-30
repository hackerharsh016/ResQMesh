# MODULE PROMPT — Module 0: Project Bootstrap

**Project:** Offline Disaster Communication & Delay-Tolerant Emergency Mesh Network (DRM03)
**Protocol:** Emergency Mesh Protocol (EMP) v1.0
**Sequence position:** 0 of N — precedes everything, including `Foundation` (Module 1)
**Status:** Ready for implementation

---

## 1. Module Objective

Every subsequent module prompt (1 through 11) assumes a working React Native + TypeScript project already exists, with New Architecture enabled, a defined folder structure, and a small set of tooling decisions already made. None of that exists yet. This module creates it — a project that builds, runs on a device/emulator showing a blank smoke-test screen, and has zero protocol code in it. Its only job is to make Module 1 possible to start without Antigravity having to invent project conventions on the fly (which is how you end up with inconsistent structure by Module 5).

---

## 2. Context & Existing Architecture

Relevant frozen source documents:
- SRS's technology stack section establishes: React Native + TypeScript (mobile), SQLite (local persistence), Android as the initial target platform.
- Every subsequent module prompt's "Files / Folder Structure" section — this module must produce the folder skeleton every one of them assumes (`src/protocol/`, `src/storage/`, `src/identity/`, `src/dtn/`, `src/transport/`, `src/discovery/`, `src/routing/`, `src/gateway/`, `src/app/`, `src/screens/`, `android/native-modules/`, `tests/` mirroring `src/`).
- Modules 1, 3, 6, 9, 10 all define Turbo Native Module contracts (Keystore, BLE, Wi-Fi Direct, Wi-Fi Aware) — these require **New Architecture (Fabric + TurboModules) enabled from project creation**, not bolted on later. Retrofitting New Architecture onto an already-built Old Architecture app is significantly more painful than starting with it on.

**Tooling decisions this module makes that are NOT sourced from any frozen document** (the SRS fixes the stack, not specific vendor libraries — these choices sit behind abstractions Modules 2/5/9/11 already defined, so swapping any of them later doesn't ripple into protocol logic):
- **SQLite library:** a New-Architecture-compatible binding is required (Turbo Native Module-based, not legacy bridge). Use whichever the team has evaluated; if none, default to a JSI-based SQLite library with active React Native New Architecture support — confirm current compatibility before locking this in, since RN library support for New Architecture changes over time.
- **Local notifications + foreground service:** Module 11 needs both a notification API and Android foreground-service support; pick a single library that covers both rather than two separate ones, if a suitable one exists — confirm current New Architecture compatibility before locking this in.
- **Connectivity detection:** a standard, actively maintained React Native connectivity library for Module 9's `ConnectivityMonitor`.
- **Navigation:** a standard React Navigation-style library for Module 11's four screens.

Document whichever specific packages/versions get chosen in this module's own section of `DEVIATIONS.md` (starting that file here, since it doesn't exist until this module creates it) — every later module's "Dependencies" section that says "inspect repo first, reuse what's already there" is deferring to whatever gets decided right here.

---

## 3. Responsibilities

This module MUST implement:
1. **Project initialization** — a React Native + TypeScript project with **New Architecture enabled** (Fabric + TurboModules on) and Hermes as the JS engine.
2. **TypeScript configuration** — `tsconfig.json` in strict mode (`strict: true`, `noImplicitAny`, `strictNullChecks` — several later modules' type contracts depend on strict mode actually catching mismatches, not silently allowing `any`).
3. **Testing infrastructure** — Jest configured for React Native + TypeScript, with a trivial passing test to prove the pipeline works, and fake-timer support available (several later modules' tests need it — e.g. reassembly timeouts, backoff schedules).
4. **Lint/format tooling** — ESLint + Prettier with a baseline config; not exhaustive rule-tuning, just enough that all eleven modules produce stylistically consistent code.
5. **Folder skeleton** — every directory every later module's "Files / Folder Structure" section references, created empty (with `.gitkeep` or a placeholder `index.ts` where needed) so Module 1 doesn't have to guess where things go.
6. **Android manifest baseline** — permission declarations for everything Modules 1, 6, 9, 10, 11 will need at runtime (Bluetooth, location, nearby-Wi-Fi-devices, internet, network state, foreground service) declared in the manifest now (runtime *requesting* of dangerous permissions stays each module's own job — the manifest just needs the declarations to exist).
7. **Gradle/build configuration** — New Architecture flags set correctly in `gradle.properties`, minimum SDK version set high enough for Keystore/BLE/Wi-Fi Aware APIs (Wi-Fi Aware requires API 26+; confirm the project's `minSdkVersion` reflects this and document the trade-off if it means dropping support for older Android versions — SRS's target device range should be checked here).
8. **Turbo Native Module scaffolding convention** — establish and document how native modules under `android/native-modules/` actually get linked into the app (codegen config in `package.json`, local module registration) so Modules 1/6/9/10 can each drop in a native implementation using the same established pattern rather than each inventing its own linking approach.
9. **Smoke-test app** — a minimal `App.tsx` that renders a single "Hello, mesh" screen, proving the whole toolchain (TypeScript compiles, Metro bundles, Gradle builds, app launches on a real device/emulator) works before any real code exists.
10. **Git hygiene** — `.gitignore` covering build artifacts, `node_modules`, local keystores/secrets, and a `DEVIATIONS.md` file created (empty template) for every later module to append to.

---

## 4. Non-Responsibilities / Scope Boundaries

Do **NOT** implement in this module:
- Any protocol, storage, identity, transport, routing, DTN, or gateway code — that's Modules 1–10, in order, starting from the skeleton this module produces.
- Any actual UI screens beyond the single smoke-test placeholder (Module 11 owns real screens).
- Any native BLE/Wi-Fi/Keystore implementation — only the *scaffolding convention* for where such code will live, not the code itself.
- CI/CD pipeline setup (GitHub Actions, etc.) — useful, but out of scope for this prompt; a local, working build is the bar here.
- iOS support of any kind (per the earlier conversation — this stack is Android-only as designed; do not spend effort on iOS-specific configuration).

---

## 5. Dependencies

This module has no dependencies on any other module — it is the foundation everything else, including Module 1, builds on.

---

## 6. Interfaces & Contracts

There are no TypeScript interfaces in this module (nothing to type yet) — the "contract" this module delivers is structural: the folder layout, config files, and build pipeline every later module assumes exist. Key config contracts:

```jsonc
// tsconfig.json — key settings later modules depend on
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "baseUrl": "./src",
    "paths": {
      "@protocol/*": ["protocol/*"],
      "@storage/*": ["storage/*"],
      "@identity/*": ["identity/*"],
      "@dtn/*": ["dtn/*"],
      "@transport/*": ["transport/*"],
      "@discovery/*": ["discovery/*"],
      "@routing/*": ["routing/*"],
      "@gateway/*": ["gateway/*"],
      "@app/*": ["app/*"]
    }
  }
}
```

```properties
# android/gradle.properties — key flags
newArchEnabled=true
hermesEnabled=true
```

Path aliases above are optional convenience (confirm the team wants them — every later module's prompt uses relative-style paths like `dtn/types.ts`, so aliases are a nice-to-have, not a requirement any later prompt depends on; if adopted, document it since it changes how import statements should look versus this document's plain relative-path examples).

---

## 7. Implementation Requirements

- New Architecture must be verified actually working end-to-end (not just flagged on) before this module is considered done — a Turbo Native Module "hello world" test (a trivial native method callable from JS) should be built and torn down as part of verification, even though it's not kept in the final skeleton, specifically to prove Module 1's Keystore bridge won't hit a New Architecture configuration problem on day one.
- `minSdkVersion` must be set with Wi-Fi Aware's API 26 requirement in mind (Module 10) — if the project needs to support older devices too, document that Wi-Fi Aware will simply report `isSupported() === false` there (per Module 10's own capability-detection design) rather than lowering `minSdkVersion` in a way that breaks other native APIs Modules 1/6 need.
- The folder skeleton must match every later module's stated file paths exactly — cross-check each of Modules 1–11's "Files / Folder Structure" sections against what gets created here; a mismatch here means every later module's prompt needs silent path corrections, which defeats the purpose of scaffolding it up front.
- Jest must be configured to support the testing patterns later modules require: fake timers (Module 6/10's timeout tests), and straightforward mocking of native modules (every module from 1 onward tests against mocked native bridges, never real native code, in unit tests).

---

## 8. Build & Verification Flow

*(This module has no runtime data flow — it produces a build pipeline instead.)*

```
npx react-native init (or equivalent) with New Architecture + TypeScript template
        │
        ▼
Configure tsconfig, ESLint/Prettier, Jest
        │
        ▼
Create full src/ + android/native-modules/ + tests/ folder skeleton
        │
        ▼
Declare Android manifest permissions (unrequested at runtime — just declared)
        │
        ▼
Build a throwaway "hello world" Turbo Native Module → verify JS can call it → remove it
        │
        ▼
Build the smoke-test App.tsx
        │
        ▼
npx react-native run-android → verify app launches on emulator/device showing the smoke screen
        │
        ▼
Module 0 complete — Module 1 can now begin
```

---

## 9. Error Handling & Edge Cases

- New Architecture build failure (common causes: Gradle/AGP version mismatch, Node/RN CLI version mismatch, incompatible third-party library still requiring the old bridge) → resolve before proceeding; do not fall back to Old Architecture as a workaround, since Modules 1/3/6/9/10's native bridge contracts are written assuming Turbo Native Modules.
- A chosen library (SQLite, notifications, connectivity) turns out not to support New Architecture yet → do not silently fall back to Old Architecture for that one dependency; pick a different library that does, and document why the first choice was rejected in `DEVIATIONS.md`.
- `minSdkVersion` conflicts between different native requirements (e.g., one chosen library requires a higher minimum than another) → resolve by raising the project's `minSdkVersion` to the highest requirement among all chosen dependencies, and document the resulting minimum supported Android version clearly, since it's a product decision (which real-world devices get excluded) as much as a technical one.
- Metro bundler path-alias resolution issues if TypeScript path aliases (§6) are adopted → verify Metro's config is updated to match `tsconfig.json`'s `paths`, since these are two separate systems that don't sync automatically in React Native.

---

## 10. Security Requirements

- `.gitignore` must exclude any Android signing keystore, `local.properties`, and any `.env`-style secret files from day one — before any code exists, before there's any actual secret to leak, so the habit and the guard are both in place before Module 9 ever needs a Supabase key.
- Android manifest should not declare `usesCleartextTraffic="true"` — all network calls (Module 9's backend upload) must be HTTPS-only per that module's own security requirements; setting this restrictively now prevents an accidental regression later.
- No secrets, API keys, or credentials are created or stored in this module — there's nothing to protect yet; this module just ensures the scaffolding doesn't make protecting them harder later.

---

## 11. Android / React Native Boundary

This entire module **is** the boundary-setting exercise. The key decision to get right and document clearly: where native module code physically lives (a `android/native-modules/<name>/` convention was used consistently across Modules 1/6/9/10's prompts) and how it's registered/linked into the main app's Gradle build and RN's codegen — establish this pattern once, here, so every later module's native bridge just follows the same steps instead of re-deriving them.

---

## 12. Testing Requirements

**Automated:**
- `npm test` runs Jest successfully with at least one trivial passing test.
- `npx tsc --noEmit` passes with strict mode on, on the empty skeleton (nothing to fail yet, but proves the config itself is valid).
- ESLint runs cleanly against the skeleton.

**Manual/device:**
- `npx react-native run-android` builds and launches the smoke-test screen on an emulator or physical device.
- The throwaway Turbo Native Module "hello world" test (§7) is built, confirmed callable from JS, and its result logged/displayed, proving New Architecture is genuinely functional — then removed before this module is considered complete (it's a verification step, not a deliverable).

---

## 13. Acceptance Criteria

- [ ] Project builds and runs on Android with New Architecture confirmed functional (via the throwaway native module test).
- [ ] `tsconfig.json` strict mode is on and `tsc --noEmit` passes cleanly on the empty skeleton.
- [ ] Jest, ESLint, and Prettier are configured and run without error.
- [ ] Full folder skeleton exists matching every one of Modules 1–11's stated file paths (cross-checked, not assumed).
- [ ] Android manifest declares every permission Modules 1/6/9/10/11 will need to request at runtime.
- [ ] `minSdkVersion` is set with Wi-Fi Aware's API 26 requirement considered and documented.
- [ ] Chosen SQLite/notifications/connectivity/navigation libraries are confirmed New-Architecture-compatible and recorded in `DEVIATIONS.md`.
- [ ] `.gitignore` and empty `DEVIATIONS.md` exist.
- [ ] Smoke-test app launches successfully on a real device/emulator.

---

## 14. Files / Folder Structure

```
<project-root>/
├── android/
│   ├── app/
│   │   └── src/main/AndroidManifest.xml   # permissions declared per §3.6
│   ├── native-modules/                     # convention home for Modules 1/6/9/10's native bridges
│   ├── gradle.properties                   # newArchEnabled=true, hermesEnabled=true
│   └── build.gradle
│
├── src/
│   ├── protocol/
│   │   └── types/
│   ├── storage/
│   │   ├── migrations/
│   │   └── repositories/
│   ├── identity/
│   ├── dtn/
│   ├── transport/
│   │   ├── ble/
│   │   ├── wifi-direct/
│   │   ├── wifi-aware/
│   │   ├── shared/
│   │   └── mocks/
│   ├── discovery/
│   ├── routing/
│   ├── gateway/
│   ├── app/
│   │   ├── scheduler/
│   │   ├── permissions/
│   │   ├── notifications/
│   │   └── foreground-service/
│   ├── screens/
│   └── native/
│
├── tests/
│   ├── identity/
│   ├── storage/
│   ├── protocol/
│   ├── dtn/
│   ├── transport/
│   │   ├── ble/
│   │   ├── wifi-direct/
│   │   ├── wifi-aware/
│   │   └── shared/
│   ├── discovery/
│   ├── routing/
│   ├── gateway/
│   └── app/
│
├── App.tsx                       # smoke-test screen
├── tsconfig.json
├── jest.config.js
├── .eslintrc.js
├── .prettierrc
├── .gitignore
├── package.json
└── DEVIATIONS.md                 # empty template, appended to by every subsequent module
```

---

## 15. Implementation Order

1. Initialize the React Native + TypeScript project with New Architecture enabled from the start.
2. Configure `tsconfig.json` (strict mode), ESLint, Prettier.
3. Configure Jest (including fake-timer support).
4. Build and verify the throwaway Turbo Native Module "hello world" test; remove it once confirmed working.
5. Create the full folder skeleton, cross-checked against every one of Modules 1–11's file structure sections.
6. Declare Android manifest permissions.
7. Set `minSdkVersion` and document the Wi-Fi Aware trade-off.
8. Evaluate and lock in SQLite/notifications/connectivity/navigation libraries; document choices in `DEVIATIONS.md`.
9. Build the smoke-test `App.tsx`.
10. Verify `run-android` launches successfully on a device/emulator.
11. Commit with `.gitignore` in place before any secrets could possibly exist.

---

## 16. Final Verification

- [ ] Confirm New Architecture is genuinely functional, not just flagged on in config (the throwaway native test is the proof).
- [ ] Confirm the folder skeleton has been cross-checked against all eleven subsequent module prompts' file structures, not just this prompt's own guess at what they'll need.
- [ ] Confirm no protocol/business logic of any kind exists anywhere in the skeleton.
- [ ] Confirm every tooling decision in §2 is recorded in `DEVIATIONS.md` with the reasoning, so Module 1 onward never has to ask "wait, why this library?"
- [ ] Confirm `.gitignore` is committed before any real secret could exist in the repo's history.

**Once every checkbox above is confirmed true, Module 1 (Foundation) may begin.**
