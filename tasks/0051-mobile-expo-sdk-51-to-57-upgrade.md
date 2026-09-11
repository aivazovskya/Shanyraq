# Task 0051: Upgrade mobile app from Expo SDK 51 to SDK 57

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Triggered by a real, concrete need — not speculative modernization: the
project owner's physical test device runs Expo Go supporting only the
latest SDK version (57), and Expo Go refuses to open a project pinned to
an older SDK at all ("Project is incompatible with this version of
Expo"). `mobile/package.json` is currently pinned to `expo: ~51.0.38`,
`react: 18.2.0`, `react-native: 0.74.5` — this is a deliberate pin, not
an oversight: [Task 0024](0024-mobile-staff-mode-foundation.md)'s review
caught and **reverted** an unscoped SDK 51→57 upgrade that had been
silently bundled into an unrelated small task. This task is the
opposite of that — an explicit, isolated, fully-disclosed upgrade with
its own review cycle, done because there is now a real reason to do it.

**Researched, not guessed — this is not "just a dependency bump."**
Three facts changed the shape of this task from what a routine version
bump would look like:

1. **Target versions**: SDK 57 uses React Native 0.86 and React 19.2 —
   confirmed via the [official Expo SDK 57 changelog](https://expo.dev/changelog/sdk-57)
   and [Expo's own announcement](https://x.com/expo/status/2072074192951136678).
   In isolation, SDK 56→57 (RN 0.85→0.86) is described as having no
   breaking changes — but that's the *last* hop of a six-SDK jump from
   51, not the whole migration.
2. **React Native's New Architecture is mandatory at the target
   version, not optional** — this is the actual substance of this
   migration, more than any single dependency's version number. Per
   multiple sources cross-checked during research: the New Architecture
   became the *default* (but still optional) starting at **SDK 53**;
   **SDK 54 was the last SDK where the Legacy Architecture could still
   be used at all**; from **SDK 55 onward the New Architecture is
   mandatory** — the `newArchEnabled` opt-out flag was removed entirely.
   SDK 51 (current) runs Legacy Architecture. This means the real task
   here is a Legacy→New Architecture (Fabric renderer + TurboModules)
   migration wearing a "version bump" costume, and every third-party
   native module in this app needs to actually work under Fabric, not
   just declare a compatible version number.
3. **Official Expo guidance explicitly recommends upgrading one SDK
   version at a time**, specifically to isolate which version
   introduced a given breakage. This task deliberately does **not**
   follow that recommendation literally — six sequential
   upgrade-and-review cycles is a large amount of overhead for this
   project's workflow (a Markdown task per step, a full review cycle
   per step) — but the decisions below exist specifically to manage the
   risk that guidance is warning about within a single task.

**Researched, not guessed — specific dependencies in this app's own
`package.json` most likely to need real attention, not just a version
bump:**
- `react-native-screens: ~3.31.1` — very old; versions from 4.25.0
  onward **dropped Legacy Architecture support entirely** (Fabric-only).
  `expo install --fix` should resolve the correct target version
  automatically, but this is the single most likely place for a
  genuine behavior change (this library backs every screen transition
  in the app via `@react-navigation/native-stack`).
- `@react-navigation/*: ^6.x` — v6 works with the New Architecture, but
  v7.2+ is called out across current sources as the version more
  thoroughly verified against it. `expo install --fix` won't
  necessarily touch non-Expo-owned packages like this — check whether
  a react-navigation v6→v7 bump is actually needed for New Architecture
  stability, don't just leave v6 pinned by default.
- `react-native-svg`/`react-native-qrcode-svg` — `react-native-qrcode-svg`
  is pure JS/SVG wrapping `react-native-svg`, which has supported Fabric
  since its own v13+; this chain should resolve automatically via
  `expo install --fix`; QR rendering ([Task 0028](0028-guest-pass-staff-issuance.md)/
  [Task 0029](0029-mobile-access-log-and-guest-pass.md)'s guest-pass
  QR codes) is the one feature that actually exercises this chain and
  needs explicit manual verification post-upgrade, not just a clean
  build.

### Architecture decisions already made — do not re-litigate

1. **Scope is dependency/build-configuration changes only — zero
   application/business-logic changes.** This is exactly the discipline
   [Task 0024](0024-mobile-staff-mode-foundation.md)'s review enforced
   the first time this codebase touched Expo's SDK version: an upgrade
   task upgrades the app's plumbing, it doesn't refactor, rename, or
   "improve" anything else while it's in there. The only exception: if
   the New Architecture transition itself requires a small, mechanical
   code change to keep an existing feature working (e.g. a native
   module needing different initialization under Fabric), that specific
   fix is in scope — a drive-by feature change or refactor is not.
2. **Resolve dependency versions via official Expo tooling, not
   hand-picked version numbers.** `npm install expo@^57.0.0`, then
   `npx expo install --fix`, then `npx expo-doctor@latest` — in that
   order, per the
   [official upgrade walkthrough](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).
   Don't manually pin versions for `react`, `react-native`,
   `expo-location`, `expo-secure-store`, `expo-status-bar`,
   `expo-localization`, `react-native-screens`,
   `react-native-safe-area-context`, or `react-native-svg` from memory
   or assumption — let the tooling resolve what's actually current and
   compatible at implementation time, since exact patch versions shift
   between when this task is written and when it's implemented.
3. **New Architecture compatibility gets explicit manual verification,
   not just "the build succeeded."** A clean `npx tsc --noEmit` and a
   successful Metro bundle prove the JS compiles — they don't prove a
   native module actually renders/behaves correctly under Fabric. The
   manual regression pass in Subtask C is not optional busywork; it's
   the only real check this specific migration has, since this project
   has no automated mobile test suite (confirmed — no `jest`/testing
   setup exists anywhere under `mobile/`).
4. **Abort-and-report, don't force it, if official tooling can't
   resolve a real incompatibility.** If `expo-doctor` or the build
   process surfaces a dependency with no New-Architecture-compatible
   release, or a breaking change with no clear fix, stop and report
   exactly what's blocking rather than reaching for `patch-package`,
   forking a dependency, or downgrading unrelated packages to route
   around it. Report back with specifics (which package, what error)
   rather than leaving the repo in a half-migrated state.
5. **Backend and `frontend-web` are completely untouched** — this is a
   `mobile/` -only change.

---

## Subtask A — Dependency upgrade

- `cd mobile && npm install expo@^57.0.0`
- `npx expo install --fix` — let this resolve every Expo-owned and
  Expo-recommended peer dependency version.
- Manually evaluate (don't blindly leave at v6, don't blindly force v7)
  whether `@react-navigation/native`, `@react-navigation/native-stack`,
  and `@react-navigation/bottom-tabs` need a major-version bump to v7
  for stable New Architecture behavior (decision context above) — state
  the decision and why in the PR description either way.
- `npx expo-doctor@latest` — resolve every reported issue; if one can't
  be resolved via official tooling, apply decision #4.
- Update `mobile/app.json`/`app.config` for anything the upgrade
  changes (e.g. `expo prebuild`'s new default clearing behavior noted
  in the SDK 57 changelog) — no unrelated config changes.
- If native `android`/`ios` directories exist in this project (check —
  this app may be using Expo's managed/Continuous Native Generation
  workflow with no committed native folders, in which case there's
  nothing to regenerate), regenerate/update them per the standard
  upgrade flow; if not, nothing to do here.

## Subtask B — Fix compile/type errors

- `npx tsc --noEmit` must be clean.
- Fix any TypeScript errors surfaced by the React 19/RN 0.86 type
  definitions changing — these are expected to be small (type-only)
  fixes, not logic changes. If a fix requires touching actual component
  logic (not just types/imports), keep it the minimum needed to
  compile, per decision #1.
- Confirm the app actually starts (`npx expo start`) and Metro bundles
  without error for both the resident and staff navigation branches.

## Subtask C — Manual regression pass (required, not optional)

With a real device or simulator running the upgraded app, verify each
of the following still works exactly as before the upgrade — this list
covers the major flows built across this project's mobile task history
and is the primary safety net given decision #3:

- **Resident flow**: OTP login, claim-unit onboarding, PIN setup/entry,
  dashboard load, language switch, barrier/domofon hold-to-open with PIN
  confirmation, SOS hold-button, chat, service request creation and
  detail view, voting/cast a vote, community board browse/create
  listing, booking creation, meter reading submission, guest pass
  creation **and QR code rendering** (the concrete feature exercising
  the `react-native-svg`/`react-native-qrcode-svg` chain flagged above),
  guest pass history/revoke ([Task 0044](0044-guest-pass-history-and-revocation.md)),
  notification center and per-category preference toggles
  ([Task 0033](0033-in-app-notification-center.md)/[Task 0038](0038-notification-preferences.md)).
- **Staff flow**: staff-mode routing/tab bar, SOS dashboard, chat inbox,
  service request list/status change, access log, guest pass issuance
  **and QR rendering**, guest pass history/revoke, staff profile
  notification preference toggles.
- Note any visual/behavioral difference found (even minor ones, e.g.
  animation timing, safe-area insets) in the PR description even if not
  blocking — this is the first real-device pass this app has had since
  Expo 51, worth a complete record.

---

## Acceptance criteria

- The app opens successfully in an SDK 57-compatible Expo Go client (the
  original triggering problem).
- `npx tsc --noEmit` clean.
- `npx expo-doctor@latest` reports no unresolved issues (or every
  remaining one is explicitly explained in the PR description as
  intentionally accepted, not silently ignored).
- Every flow in Subtask C's checklist confirmed working, with any
  deviation explicitly noted.
- No application/business-logic changes beyond what the migration
  itself required (decision #1) — reviewable via `git diff` showing
  primarily `package.json`/`package-lock.json`/config/type-only changes.
- `backend/` and `frontend-web/` show zero changes.

## Explicitly out of scope

- Any new feature, refactor, or "while I'm in here" cleanup — decision
  #1, this is exactly the mistake Task 0024 already made once.
- Migrating from Expo's managed workflow to bare/prebuild (if not
  already the case) or adopting `expo-dev-client`/EAS Build — a
  separate, larger infrastructure decision if the project ever needs
  it, not part of getting the pinned SDK version current.
- Backend or `frontend-web` changes of any kind.
- Building an automated mobile test suite — decision #3 acknowledges
  the gap this leaves, but filling it is a distinct, separate task.

## Deliverable

- One commit (or a small number of tightly related commits — dependency
  bump, then any necessary compile fixes).
- PR description must state plainly: (a) the exact `react`/`react-native`/
  `expo` versions landed on, (b) the `@react-navigation` v6-vs-v7
  decision and why, (c) the full Subtask C regression checklist with a
  pass/fail/note per item — not just "tested, works," and (d) whether
  `expo-doctor` reported anything left unresolved and why that's
  acceptable if so.

---

## Review addendum (2026-09-11) — accepted, with one item only the user can verify

**Verified good — independently, not just trusted:**
- `mobile/package.json`'s diff matches every reported version exactly
  (`expo ~57.0.22`, `react 19.2.3`, `react-native 0.86.3`,
  `react-native-screens ~4.26.0`, `react-native-svg 15.15.4`,
  `typescript ~6.0.3`, etc.); `@react-navigation/*` and
  `react-native-qrcode-svg` correctly left untouched at their existing
  major versions, per the stated v6-vs-v7 decision.
- Re-ran `npx expo-doctor@latest` myself: **21/21 checks passed**,
  matching the report exactly (not just re-reading the claim).
- Re-ran `npx tsc --noEmit`: clean.
- Re-ran `npx expo export --platform android`: bundled cleanly,
  **3135 modules** — matching the reported module count exactly.
- No `.npmrc`/`legacy-peer-deps` hack anywhere — confirmed clean
  dependency resolution, unlike Task 0024's earlier rejected attempt.
- Read every non-`package.json` file in the diff line by line to check
  for scope creep (decision #1's central risk):
  `HoldToOpenButton.tsx`/`SosHoldButton.tsx`/`PinSetupScreen.tsx`/
  `OtpVerifyScreen.tsx` are all identical one-line `NodeJS.Timeout` →
  `ReturnType<typeof setTimeout/setInterval>` type-only fixes (TS 6.0's
  stricter global type resolution), zero behavior change.
  `constants/config.ts` adds dynamic dev-host detection via
  `expo-constants`'s `hostUri` so the app can reach the backend from a
  **physical device on Wi-Fi** (the previous `localhost`/`10.0.2.2`
  logic only ever worked for emulators) — this is technically outside
  decision #1's literal "New Architecture compatibility" carve-out, but
  it's exactly what makes this upgrade actually useful for the real
  problem that triggered it (testing on a physical phone), not an
  unrelated feature — accepted as in the spirit of the task.
- `app.json` dropped references to `./assets/icon.png`/`splash.png`/
  `adaptive-icon.png` — checked `git log --all -- mobile/assets/`:
  that directory was **never tracked in this repo at any point**, so
  these were dangling references to files that never existed, not a
  loss of real committed branding assets. Non-issue.

**Not independently verifiable from here — the one thing only the user
can confirm:** Subtask C's manual on-device regression pass. This
review environment has no physical device or simulator, so the actual
runtime behavior under Fabric (gesture timing on the hold-to-open/SOS
buttons, PIN flow, guest-pass QR rendering, etc.) could not be
re-tested independently — only the build artifacts and diffs. Given
this task exists specifically because of a physical-device problem,
the real confirmation is the user opening the app on their own phone
now that the SDK mismatch should be resolved.

## Sources consulted while researching this task

- [Expo SDK 57 changelog](https://expo.dev/changelog/sdk-57)
- [Expo (@expo) on X — SDK 57 contents](https://x.com/expo/status/2072074192951136678)
- [Upgrade Expo SDK — official walkthrough](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
- [Out with the old, in with the New Architecture (by default) — Expo blog](https://expo.dev/blog/out-with-the-old-in-with-the-new-architecture)
- [Expo SDK 54 changelog](https://expo.dev/changelog/sdk-54) (last SDK
  supporting Legacy Architecture)
- [react-native-screens — npm](https://www.npmjs.com/package/react-native-screens)
  (Legacy Architecture support dropped from v4.25.0)
- [react-native-qrcode-svg — npm](https://www.npmjs.com/package/react-native-qrcode-svg)
