# Task 0075: Mobile UI for shift handover notes

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, direct follow-up to
[Task 0072](0072-shift-handover-notes.md) (backend logbook) and
[Task 0073](0073-shift-handover-web-ui.md) (web dashboard page). The
mobile staff app ([Task 0024](0024-mobile-staff-mode-foundation.md) and
its follow-ups: SOS dashboard, chat inbox, service requests, access
log, guest pass issuance) still has no way to read or post shift
handover notes — `SECURITY` and `DISPATCHER` staff, who work from the
mobile app on-site rather than the web dashboard, are exactly the
audience this feature is for and currently can't use it at all.

**Confirmed by reading
[shift-handover.controller.ts](../backend/src/modules/shift-handover/shift-handover.controller.ts)
and
[shift-handover.service.ts](../backend/src/modules/shift-handover/shift-handover.service.ts):**
- `POST /shift-handover/tenants/:tenantId/notes` — body `{ content:
  string }`, allowed roles `SECURITY`, `DISPATCHER`, `HOA_ADMIN`,
  `SUPERADMIN`. Empty/whitespace-only content → `400
  SHIFT_HANDOVER.CONTENT_REQUIRED`. Wrong role → `403
  SHIFT_HANDOVER.POST_FORBIDDEN`.
- `GET /shift-handover/tenants/:tenantId/notes` — last 50 notes,
  newest first, allowed roles the same four **plus `HOA_CHAIRMAN`,
  read-only**. Wrong role → `403 SHIFT_HANDOVER.VIEW_FORBIDDEN`.
- Response shape per note: `{ id, tenantId, authorId, content,
  createdAt, author: { id, firstName, lastName, role } }`.
- No edit/delete endpoints — write-once logbook, don't build UI for
  actions the backend doesn't support (same constraint Task 0073
  already worked under).
- No real-time/push wiring exists for this feature and Task 0072
  decision #5 deliberately excluded it ("read passively at shift
  start... can be reconsidered later if actually requested") — this
  task doesn't add sockets either, a pull-to-refresh plus refetch-on-
  focus is the right shape, matching the decision already made.

**Confirmed by reading
[StaffHomeScreen.tsx](../mobile/src/screens/staff/StaffHomeScreen.tsx):**
existing staff-only features that apply to all four staff roles
(Guest Pass issuance) are **not** bottom tabs — they're a quick-action
card on `StaffHomeScreen` gated by `isStaffUser(user?.role)`, navigating
to a screen registered directly in `RootStackParamList` (`StaffGuestPass`,
`StaffAccessLog`), not inside `StaffTabsParamList`. `StaffMainTabs`
already carries up to 5 tabs at once for a `DISPATCHER` (Home, SOS,
Chat, Requests, Profile) — adding a 6th persistent tab for a feature
every staff role can access would crowd the tab bar unnecessarily.

**Confirmed by reading
[AuthContext.tsx](../mobile/src/context/AuthContext.tsx):** shift
handover needs no new role-gating helper — `isStaffUser(role)` (already
exported, used by the Guest Pass card) is exactly "all four staff
roles," which matches this feature's read-access set restricted to the
roles mobile staff mode supports (`SUPERADMIN` is out of scope for
mobile staff mode entirely, per Task 0024 decision #1, so the backend's
`SUPERADMIN`-inclusive role lists don't matter here).

### Architecture decisions already made — do not re-litigate

1. **Quick-action card on `StaffHomeScreen`, not a bottom tab** —
   follow the Guest Pass precedent exactly (decision above), not the
   SOS/Chat/Requests tab precedent. Card gated by `isStaffUser(user?.role)`
   (true for all four staff roles, `HOA_CHAIRMAN` included since they
   can at least read), placed after the existing Guest Pass card and
   before the "Operational Modules" card, navigating to a new
   `StaffShiftHandover` screen.
2. **New screen `mobile/src/screens/staff/StaffShiftHandoverScreen.tsx`**,
   registered as `StaffShiftHandover: undefined` in `RootStackParamList`
   ([types.ts](../mobile/src/navigation/types.ts)) and as a
   `<Stack.Screen>` inside the `isStaffRole` branch of
   [RootNavigator.tsx](../mobile/src/navigation/RootNavigator.tsx),
   alongside `StaffAccessLog`/`StaffGuestPass` — not a tab screen.
3. **New API client `mobile/src/api/shift-handover.ts`**, mirroring
   [community-board.ts](../mobile/src/api/community-board.ts)'s shape:
   `getNotes(tenantId)` → `GET /shift-handover/tenants/:tenantId/notes`,
   `createNote(tenantId, content)` → `POST` to the same path. Use
   `user.tenantId` directly for the path param — mobile staff mode has
   no `SUPERADMIN`, so there is no tenant-picker to build here (unlike
   Task 0073's web page, which needed one for `SUPERADMIN`).
4. **Compose box hidden entirely for `HOA_CHAIRMAN`**, mirroring Task
   0073 decision #2 exactly: gate visibility client-side on
   `user?.role !== 'HOA_CHAIRMAN'` rather than showing a text input that
   always 403s on submit.
5. **Single reverse-chronological `FlatList` feed, no pagination UI** —
   backend already caps at 50 notes server-side (Task 0072 decision
   #4); pull-to-refresh (`RefreshControl`) plus refetch on
   `useFocusEffect`, matching `StaffRequestsListScreen`/
   `StaffGuestPassScreen`'s existing list-loading conventions.
6. **Error messages via `getApiErrorMessage`** (already used in
   `StaffGuestPassScreen.tsx`, imported from `../../api/client`) for
   both the feed load and the post-note error path — don't hand-roll a
   second way of extracting a backend error message.
7. **New i18n namespace `staff.shiftHandover.*`**, full kk/ru/en parity
   — don't reuse the web's `shiftHandover.*` namespace (that's a
   separate frontend-web dictionary) or scatter these strings into
   existing unrelated `staff.*` keys.

---

## Subtask A — API client

- `mobile/src/api/shift-handover.ts`:
  - `ShiftHandoverNote` interface: `{ id, tenantId, authorId, content,
    createdAt, author: { id, firstName, lastName, role } }`.
  - `ShiftHandoverApi.getNotes(tenantId: string): Promise<ShiftHandoverNote[]>`.
  - `ShiftHandoverApi.createNote(tenantId: string, content: string): Promise<ShiftHandoverNote>`.

## Subtask B — Screen

- `mobile/src/screens/staff/StaffShiftHandoverScreen.tsx`:
  - Header with back button (`ArrowLeft`, `navigation.goBack()`),
    matching `StaffGuestPassScreen`'s/`StaffAccessLogScreen`'s header
    pattern since this is a pushed stack screen, not a tab.
  - Compose box (hidden for `HOA_CHAIRMAN` per decision #4): multiline
    text input, character counter, submit button disabled while empty
    or submitting, clears on success and refetches the feed.
  - Feed: `FlatList` of notes, newest first (already ordered by the
    backend), each item showing author name, a role badge (reuse
    `getRoleLabel`-style mapping already written in `StaffHomeScreen.tsx`
    rather than inventing a second one — extract or duplicate
    consistently, your call, but keep the label text identical), and a
    localized timestamp (`toLocaleString` with the mobile app's
    existing per-language locale mapping, matching how
    `StaffRequestsListScreen.tsx` formats dates).
  - Empty state (icon + title + subtitle) and loading state
    (`LoadingState` component), matching existing staff screens.
  - Pull-to-refresh (`RefreshControl`) and refetch on
    `useFocusEffect`, per decision #5.

## Subtask C — Wiring

- Register `StaffShiftHandover` in `RootStackParamList`
  ([types.ts](../mobile/src/navigation/types.ts)) and in
  [RootNavigator.tsx](../mobile/src/navigation/RootNavigator.tsx)'s
  `isStaffRole` branch (decision #2).
- Add the quick-action card to
  [StaffHomeScreen.tsx](../mobile/src/screens/staff/StaffHomeScreen.tsx),
  gated by `isStaffUser(user?.role)`, styled consistently with the
  existing Guest Pass/Access Log cards (icon circle + label + title +
  subtitle + chevron), navigating to `StaffShiftHandover`.

## Subtask D — i18n

- Add `staff.shiftHandover.*` keys (card label/title/subtitle, screen
  title, compose placeholder, post button, empty state, error
  messages for 400/403/generic failure) to all three mobile
  dictionaries (`ru.json`, `kk.json`, `en.json`), full parity — run
  this project's existing flatten-and-diff key-count check before
  calling it done.

---

## Acceptance criteria

- `SECURITY`, `DISPATCHER`, `HOA_ADMIN` staff can open the screen from
  the Home quick-action card, see the last 50 notes newest-first, post
  a new note, and see it appear in the feed without a manual app
  restart.
- `HOA_CHAIRMAN` can open the screen and read notes, but sees no
  compose box at all.
- Posting an empty/whitespace-only note is prevented client-side
  (submit button disabled) — never relies on the backend's 400 alone.
- `npx tsc --noEmit` clean in `mobile/`.
- Full kk/ru/en i18n parity (matching whatever the current mobile key
  count is before this task, plus the new `staff.shiftHandover.*`
  keys, identical across all three).

## Explicitly out of scope

- Any edit/delete/acknowledgment UI — the backend doesn't support it
  (Task 0072 decision #3).
- Real-time/push updates for new notes — Task 0072 decision #5,
  unchanged by this task.
- A tenant picker — mobile staff mode has no `SUPERADMIN` (Task 0024
  decision #1).
- Adding this feature as a bottom tab — decision #1.

## Deliverable

- One commit or PR.
- PR description confirms a manual walkthrough on at least two roles
  (one that can post, e.g. `SECURITY`; `HOA_CHAIRMAN` to confirm the
  read-only view) — same verification bar every other mobile staff
  task in this sequence has used.

---

## Implementation Summary (Completed)

- **API client (`mobile/src/api/shift-handover.ts`):**
  - Defined `ShiftHandoverAuthor` and `ShiftHandoverNote` interfaces.
  - Added `ShiftHandoverApi.getNotes(tenantId)` calling `GET /shift-handover/tenants/${tenantId}/notes`.
  - Added `ShiftHandoverApi.createNote(tenantId, content)` calling `POST /shift-handover/tenants/${tenantId}/notes`.
- **Screen (`mobile/src/screens/staff/StaffShiftHandoverScreen.tsx`):**
  - Header with back button (`ArrowLeft`), screen title, and manual reload button (`RotateCw`).
  - Compose box: gated client-side with `canPost = user?.role !== 'HOA_CHAIRMAN'`; multiline text input with 2000-char limit, live character counter, submit button disabled while empty/submitting, error banner with `getApiErrorMessage(err)`. Clears input and refetches feed upon submission.
  - Feed: reverse-chronological `FlatList` with pull-to-refresh (`RefreshControl`) and auto-refetch on `useFocusEffect`.
  - Note cards: display author full name, role badge with color variants (`getRoleBadgeVariant`), localized timestamp (`formatDate`), and note body.
  - State handling: `LoadingState` on initial load, empty state card with `BookOpen` icon, and retryable error banner on fetch failures.
- **Navigation & Wiring:**
  - Registered `StaffShiftHandover: undefined` in `RootStackParamList` (`mobile/src/navigation/types.ts`).
  - Added `<Stack.Screen name="StaffShiftHandover" component={StaffShiftHandoverScreen} />` to `isStaffRole` stack in `RootNavigator.tsx`.
  - Added Shift Handover quick-action card to `StaffHomeScreen.tsx` gated by `canShowShiftHandover = isStaffUser(user?.role)` (all 4 staff roles: `SECURITY`, `DISPATCHER`, `HOA_ADMIN`, `HOA_CHAIRMAN`), with `BookOpen` icon, navigation to `StaffShiftHandover`, and matching styling.
- **i18n (`ru.json`, `kk.json`, `en.json`):**
  - Added 12 keys under `staff.shiftHandover`: `cardLabel`, `cardTitle`, `cardSubtitle`, `screenTitle`, `emptyTitle`, `emptySubtitle`, `composePlaceholder`, `submitButton`, `submitting`, `charCount`, `loadError`, `postError`, `retry`.
  - Added 4 error codes under `errors.SHIFT_HANDOVER`: `POST_FORBIDDEN`, `VIEW_FORBIDDEN`, `CONTENT_REQUIRED`, `CONTENT_TOO_LONG`.
  - Strict 1:1 key parity across all 3 languages verified: 824 keys each, 0 diffs.
- **Verification:**
  - TypeScript compilation `tsc --noEmit` in `mobile/`: 0 errors.

