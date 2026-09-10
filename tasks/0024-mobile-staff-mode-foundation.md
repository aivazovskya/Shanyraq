# Task 0024: Mobile staff mode — navigation foundation

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Confirmed while answering a product question: the mobile app has **zero
role-based branching anywhere**.
[RootNavigator.tsx](../mobile/src/navigation/RootNavigator.tsx) only
branches on `isAuthenticated`/`hasOwnership`
([AuthContext.tsx:75](../mobile/src/context/AuthContext.tsx) —
`hasOwnership = user.ownerships.length > 0`), so a staff user
(`HOA_ADMIN`/`HOA_CHAIRMAN`/`DISPATCHER`/`SECURITY`) who logs in today —
who by definition owns no unit — gets routed straight to
`ClaimUnitScreen` and is permanently stuck there. This is the first of a
sequence of tasks bringing staff-facing tools to mobile (SOS dashboard,
dispatcher chat inbox, service-request management, access-control
management were all requested — each will be its own follow-up task
built on this foundation, don't build their screens here). This task
**only** builds the plumbing: detect a staff role, route it to a
separate tab-bar shell instead of the resident experience, and give that
shell a home to grow into.

### Architecture decisions already made — do not re-litigate

1. **`SUPERADMIN` is explicitly NOT part of mobile staff mode.**
   SUPERADMIN's work (platform-wide tenant/staff provisioning, per
   [Task 0023](0023-platform-tenant-onboarding.md)) isn't tenant-scoped
   and doesn't fit this dashboard-per-ЖК shape. If a SUPERADMIN logs into
   the mobile app, treat them the same as today (they'll hit the same
   pre-existing edge case as any tenant-less account) — don't build
   anything for them here. Staff mode is for exactly `HOA_ADMIN`,
   `HOA_CHAIRMAN`, `DISPATCHER`, `SECURITY`.
2. **Route on `role`, not on `hasOwnership`.** Add a derived
   `isStaffRole` alongside the existing `hasOwnership` in `AuthContext`
   (or a small helper, your call), and check it **before** the
   `hasOwnership` branch in `RootNavigator` — a staff account should never
   see `ClaimUnitScreen` regardless of whether they happen to also own a
   unit somewhere (edge case, but don't let unit-ownership override role
   routing).
3. **A separate tab navigator, not conditional screens bolted onto the
   resident one.** Create `StaffMainTabs` (mirroring how `MainTabs`
   already works) rather than adding `if (isStaffRole)` checks scattered
   through the existing resident screens — the two experiences are
   different enough (different data, different actions) that sharing a
   navigator would make both harder to reason about.
4. **Extract a shared mobile socket-connection helper now, before the
   next task needs it twice.** [Task 0020](0020-realtime-websocket.md)
   built the WebSocket client connection inline inside
   `ChatScreen.tsx` — reasonable when there was only one consumer. The
   very next task in this sequence (mobile SOS dashboard) needs the exact
   same connect/auth/reconnect logic. Extract it now into
   `mobile/src/lib/socket.ts` (mirroring
   `frontend-web/src/lib/socket.ts`'s shape — a `createRealtimeSocket()`
   returning a configured, not-yet-connected or auto-connecting
   `Socket`), and refactor `ChatScreen.tsx` to use it instead of its
   inline `io(...)` call. This is a refactor of already-shipped,
   already-tested code — **do not change its behavior**, only its
   location; the existing chat real-time tests/behavior must keep working
   identically.
5. **This task's staff shell can be minimal — it doesn't need to be
   empty.** Give `StaffMainTabs` two tabs: a `HomeTab` (ЖК name/address
   from `user.tenant`, the staff member's name and role label, a logout
   button — reuse whatever logout action the resident `ProfileScreen`
   already calls) and a `ProfileTab` (can literally be the same content
   as `HomeTab` for now, or genuinely shared — your call, just don't ship
   a tab that's a dead end with no way to log out). The point is a staff
   user who logs in today sees a working, if minimal, screen — not a
   placeholder that says "coming soon."

---

## Subtask A — Role detection + routing

- Add `isStaffRole` to `AuthContext`
  ([AuthContext.tsx](../mobile/src/context/AuthContext.tsx)): `true` for
  exactly `HOA_ADMIN`/`HOA_CHAIRMAN`/`DISPATCHER`/`SECURITY`, `false`
  otherwise (residents and the SUPERADMIN edge case both fall through to
  existing behavior).
- In `RootNavigator.tsx`, add the staff branch **before** the
  `!hasOwnership` check: `!isAuthenticated` → `Auth`; `isStaffRole` →
  `StaffMain`; `!hasOwnership` → `ClaimUnit`; else → `Main` (existing
  resident flow), exactly matching decision #2's ordering.
- Add `StaffMain: NavigatorScreenParams<StaffTabsParamList>` to
  `RootStackParamList` in
  [types.ts](../mobile/src/navigation/types.ts), and a new
  `StaffTabsParamList` (`HomeTab`, `ProfileTab` per decision #5).

**Test:** since this is navigation-heavy React Native code without an
existing pattern of navigator unit tests in this codebase, a lightweight
test asserting `isStaffRole` computes correctly for each role value is
sufficient — check how (if at all) `hasOwnership`-style derived values
are currently tested, if anywhere, and match that precedent rather than
inventing new test infrastructure for this task.

## Subtask B — `StaffMainTabs` shell

- New `mobile/src/navigation/StaffMainTabs.tsx`, structurally mirroring
  `MainTabs.tsx`.
- New `mobile/src/screens/staff/StaffHomeScreen.tsx` per decision #5.
- All new user-facing text through `t()` with full kk/ru/en parity, in
  a new `staff` i18n namespace/section (don't scatter staff strings into
  existing resident-oriented keys).

## Subtask C — Extract shared socket helper

- `mobile/src/lib/socket.ts`, per decision #4.
- Refactor `ChatScreen.tsx` to use it.

**Test:** existing chat real-time behavior (from Task 0020) is
unaffected — re-run whatever verification Task 0020 used to confirm live
chat updates still work after this refactor; if Task 0020 only had a
manual verification (no automated test for the socket wiring itself),
do the same manual check here rather than skipping verification because
"it's just a refactor."

---

## Acceptance criteria

- A user with role `HOA_ADMIN`/`HOA_CHAIRMAN`/`DISPATCHER`/`SECURITY`
  logging in on mobile lands on `StaffMainTabs`, never on `ClaimUnit`.
- A resident (`RESIDENT_OWNER`/`RESIDENT_TENANT`) sees **zero** change in
  behavior — this task must be fully additive for residents.
- `ChatScreen.tsx`'s real-time behavior is unchanged after the socket
  helper extraction.
- `npx tsc --noEmit` clean in `mobile/`.
- Full kk/ru/en i18n parity for any new strings.

## Explicitly out of scope

- Any actual staff feature (SOS, chat inbox, requests, access control) —
  those are separate follow-up tasks building on this shell.
- SUPERADMIN mobile support — see decision #1.
- Changing anything about the resident experience.

## Deliverable

- One commit or PR.
- PR description confirms a staff-role test login was manually walked
  through end-to-end (login → lands on staff home → logout works).

---

## Review addendum (2026-09-10) — CRITICAL finding, plus one required fix

**Verified good:** `isStaffRole` correctly derived and checked *before*
`hasOwnership` in `RootNavigator`, exactly per decision #2's ordering.
`StaffMainTabs` and `StaffHomeScreen` are well-built — ЖК name/address,
staff name/role badge, a working logout button, and (from the next task)
an SOS quick-access card. The socket helper extraction (`mobile/src/lib/socket.ts`)
is a clean, behavior-preserving refactor of `ChatScreen.tsx` — same
connect options, same auth pattern, same `active`-flag guard against a
post-unmount race. Full kk/ru/en i18n parity confirmed (683/683/683
mobile keys).

**CRITICAL — unscoped Expo/React Native/React major-version upgrade,
not requested by this or any other task:**

`mobile/package.json` shows: `expo` `~51.0.38` → `^57.0.21`, `react`
`18.2.0` → `19.2.3`, `react-native` `0.74.5` → `0.86.3`, `typescript`
`~5.3.3` → `~6.0.3`, plus every Expo module bumped to match (`expo-location`,
`expo-secure-store`, `expo-status-bar`, `react-native-screens`,
`react-native-safe-area-context`, `react-native-svg`). This produced a
~14,000-line `package-lock.json` diff, a new `mobile/.npmrc` with
`legacy-peer-deps=true` (a strong signal that `npm install` hit peer-
dependency conflicts during this and the conflict was suppressed rather
than resolved), new `mobile/assets/` icon/splash files, and small
mechanical fixups scattered across unrelated pre-existing files
(`HoldToOpenButton.tsx`, `SosHoldButton.tsx`, `PinSetupScreen.tsx`,
`OtpVerifyScreen.tsx` — all `NodeJS.Timeout` → `ReturnType<typeof
setTimeout>` changes, needed because the type-checking environment
changed under this upgrade).

This was never asked for. Every task in this sequence (`0023`, `0024`,
`0025`) is scoped to adding features on top of the existing stack —
nothing needed a platform upgrade to implement (a `socket.io-client`
dependency add, which is genuinely new here, does not require bumping
Expo SDK by 6 major versions). A jump this large:
- Cannot be verified safe by `tsc --noEmit` alone (it's clean, I checked)
  — React Native major-version jumps commonly break native module
  compatibility, require Xcode/Gradle version bumps, and change native
  build configuration in ways no TypeScript check can see.
- Affects every existing screen in the app, not just the new staff
  screens — the blast radius is the entire mobile codebase, resident
  flows included.
- Was very likely triggered incidentally (e.g. `npx expo install
  socket.io-client` or a similar command deciding to "fix" versions) and
  then pushed through rather than caught and reverted.

**Required fix:** revert `mobile/package.json`,
`mobile/package-lock.json`, `mobile/app.json`'s plugin-list change if
it's tied to this upgrade, and `mobile/.npmrc` to their pre-task state,
then re-add *only* `socket.io-client` as a new dependency without
letting it cascade into an SDK bump (if `npx expo install
socket.io-client` is what triggers the cascade, add it directly to
`package.json` at a version compatible with Expo 51 / RN 0.74 instead).
If there turns out to be a genuine reason the existing
`expo-localization: ^57.0.1` next to `expo: ~51.0.38` (already an
inconsistency in the codebase before this task, worth noting separately)
forces a real upgrade, that needs to be raised explicitly as its own
decision with the regression-testing cost acknowledged — not absorbed
silently into a mobile-navigation task.

**Required fix — broken navigation in the reused `ProfileScreen`:**
`StaffMainTabs`'s `ProfileTab` reuses the resident `ProfileScreen`
as-is. That screen has an "Добавить объект" (Add Property) button
(`navigation.navigate('ClaimUnit')`, line ~137) and a PIN settings row
(`navigation.navigate('PinSetup')`, line ~214) — but `RootNavigator`'s
`isStaffRole` branch only registers `StaffMain` and `Chat` as screens
(confirmed by reading the diff). Neither `ClaimUnit` nor `PinSetup` is a
registered route when a staff user is signed in, so tapping either of
those two elements will fail to navigate (React Navigation logs "action
not handled by any navigator" and does nothing, at best — some
versions surface a red-box warning). This reproduces on first login as
any staff role, tapping the Profile tab, then either "Добавить объект"
or the PIN settings row.

Fix by either: (a) giving staff a dedicated profile screen that omits
the ownership/"Add Property" section entirely (PIN setup may
legitimately apply to `SECURITY` staff who open barriers — worth keeping
if `PinSetup` itself works correctly for a tenant-scoped non-resident
user, which needs checking), or (b) registering `ClaimUnit`/`PinSetup`
under the staff branch too if they're intended to be reachable — but not
the current state, where the buttons are visible and silently broken.

**Both fixes verified (2026-09-10):**
- `mobile/package.json`/`package-lock.json`/`app.json`/`tsconfig.json`
  confirmed reverted exactly to pre-task state (Expo `~51.0.38`, React
  `18.2.0`, React Native `0.74.5`, TypeScript `~5.3.3`), `.npmrc` and
  `mobile/assets/` removed, the four unrelated mechanical fixups
  (`HoldToOpenButton.tsx` etc.) gone. Only `socket.io-client` remains as
  a genuinely new dependency, confirmed present in the regenerated
  lockfile.
- New `StaffProfileScreen.tsx` (option (a)) — no navigation to
  `ClaimUnit`/`PinSetup` at all, just user/tenant info, language switch,
  and logout. `StaffMainTabs.tsx`'s `ProfileTab` now points at it instead
  of the resident `ProfileScreen`.

`tsc --noEmit` clean in all three apps (mobile re-verified on the
reverted dependency set), i18n parity unchanged (683/683/683 mobile keys
— `StaffProfileScreen` reuses existing `staff.*`/`common.*` keys, no new
ones needed). Task fully accepted.
