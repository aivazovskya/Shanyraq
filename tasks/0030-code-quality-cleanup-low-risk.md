# Task 0030: Code-quality cleanup — low-risk items

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

A holistic, cross-cutting code-quality pass (not a security or
functional-correctness review — those already happened) surfaced several
maintainability issues that accumulated across 29 incremental tasks, each
individually reviewed but never looked at together. This task covers the
findings that are safe to fix mechanically, with no security-sensitive
logic touched. [Task 0031](0031-tenant-isolation-consolidation.md)
covers the higher-risk backend tenant-isolation consolidation
separately — don't pull that work into this task.

Every finding below was independently re-verified by reading the actual
code before being written into this task. One candidate finding from the
initial audit was checked and found to be a **false positive** —
`RequestDetailScreen.tsx`'s `canChangeStatus` (DISPATCHER/HOA_ADMIN only,
excluding HOA_CHAIRMAN) was flagged as a possible UI/backend mismatch,
but `service-requests.controller.ts:49`'s `@Roles(DISPATCHER, HOA_ADMIN,
SUPERADMIN)` confirms `HOA_CHAIRMAN` is genuinely blocked by `RolesGuard`
before the request ever reaches the service — the mobile UI is correct
as-is. Not part of this task.

### Architecture decisions already made — do not re-litigate

1. **This is cleanup, not a rewrite.** Every item below is a targeted,
   low-risk change (remove, extract, consolidate). Don't use this task
   as an excuse to restyle or reorganize surrounding code you touch along
   the way.
2. **Leave `*.spec.ts` `describe`/`it` string labels alone** (e.g.
   `"createStaff (Task 0023)"`, `"Subtask A"`). Those aid traceability
   back to when a test was added, which is a defensible, common practice
   (similar to referencing an issue number in a test name) — different
   from the production-code comment problem this task fixes. Only
   production source comments are in scope for Finding C below.

---

## Finding A — Dead route: unreachable `Chat` screen in staff navigation

**File:** [mobile/src/navigation/RootNavigator.tsx](../mobile/src/navigation/RootNavigator.tsx)
(around line 52, inside the `isStaffRole` branch)

`<Stack.Screen name="Chat" component={ChatScreen} />` is registered
under the staff (`isStaffRole`) branch, left over from before
[Task 0026](0026-mobile-chat-inbox.md) built the real staff chat inbox.
The only call site that navigates to `'Chat'`
(`mobile/src/screens/dashboard/DashboardScreen.tsx:318`) is the
**resident** dashboard, never rendered when `isStaffRole` is true. Staff
chat correctly uses `'StaffChatThread'` instead. This registration in the
staff branch is unreachable.

**Fix:** remove that one `<Stack.Screen>` line from the staff branch. The
identical registration in the resident branch (further down in the same
file) is legitimate and used — don't touch that one.

## Finding B — Mobile staff capability checks duplicated across files

**Files:** `mobile/src/navigation/StaffMainTabs.tsx`,
`mobile/src/screens/staff/StaffHomeScreen.tsx`,
`mobile/src/screens/staff/StaffAccessLogScreen.tsx`,
`mobile/src/screens/staff/StaffGuestPassScreen.tsx`

Several role-check booleans are independently re-typed, verbatim, in 2+
files instead of being defined once:
- `canAccessChat = user?.role === 'DISPATCHER' || user?.role === 'HOA_ADMIN'`
  — in both `StaffMainTabs.tsx` and `StaffHomeScreen.tsx`.
- `canAccessRequests` (adds `HOA_CHAIRMAN`) — same two files.
- `canAccessLogs = user?.role === 'SECURITY' || user?.role === 'HOA_ADMIN'`
  — in both `StaffHomeScreen.tsx` and `StaffAccessLogScreen.tsx`.
- The full four-staff-role check — spelled out as an OR-chain in both
  `StaffHomeScreen.tsx` and `StaffGuestPassScreen.tsx` — **this one
  duplicates logic that already exists**: `AuthContext.tsx` already
  exports `isStaffUser(role)` covering exactly these four roles; neither
  file calls it.

**Fix:** add named exports for each capability check (e.g.
`canAccessChat(role)`, `canAccessRequestsList(role)`, `canAccessLogs(role)`
— naming your call) to `mobile/src/context/AuthContext.tsx` alongside the
existing `isStaffUser`/`STAFF_ROLES`, and use `isStaffUser(user?.role)`
directly wherever the full four-role check is currently spelled out
inline. Update all four files above to import and use the shared
versions instead of re-deriving them locally. Keep the actual role sets
identical — this is a "define once" refactor, not a chance to change who
can access what.

**Test:** if any of these files have existing tests exercising role
gating, confirm they still pass after the refactor; if none exist (check
first), a new test isn't required for a same-behavior extraction like
this one.

## Finding C — Request category/status/priority labels triplicated (with a real bug)

**Files:** `mobile/src/screens/requests/RequestsListScreen.tsx` (lines
~29-53), `mobile/src/screens/staff/StaffRequestsListScreen.tsx` (lines
~68-104), `mobile/src/screens/requests/RequestDetailScreen.tsx` (lines
~52-88)

The same category/status/priority label-mapping switch statements are
duplicated near-verbatim across all three files — and the duplication
already caused real drift: `RequestsListScreen.tsx`'s `getCategoryLabel`
is missing the `YARD_TERRITORY`/`INTERCOM_ACCESS` legacy category
aliases that the other two files handle, falling through to `default:
return cat` — a resident viewing their own requests list would see the
raw enum string `"YARD_TERRITORY"` instead of a translated label, while
the same request looks correct in the detail screen or the staff list.

**Fix:** extract `getCategoryLabel`, `getStatusInfo`, and `getPriorityLabel`
into a shared module (e.g. `mobile/src/utils/requestLabels.ts`, taking
`t` as a parameter since these need the active `useTranslation` instance),
including the `YARD_TERRITORY`/`INTERCOM_ACCESS` aliases in the shared
version — this fixes `RequestsListScreen.tsx`'s gap as a side effect of
the extraction, not a separate patch. Update all three files to import
and use the shared functions.

**Test:** if you want to add one, a simple test asserting
`getCategoryLabel('YARD_TERRITORY')` and `getCategoryLabel('YARD')` both
resolve to the same non-raw label would directly cover the bug just
fixed — optional if this codebase has no existing test convention for
this kind of pure-function mobile utility (check first).

## Finding D — Subtask/Decision/Task-number references in production source comments

Confirmed via grep across `.ts`/`.tsx` files (excluding `tasks/*.md` and
`*.spec.ts`, per decision #2). Representative locations — **grep for
`Subtask`, `Decision #`, `Task 00`, `per Task` yourself to find the
complete set rather than treating this list as exhaustive**, since new
ones may exist beyond what a point-in-time audit caught:
- `backend/src/modules/chat/chat.service.ts` (multiple: doc comment
  admitting verbatim copy from `bookings.service.ts`, "Decision #6",
  "Subtask B")
- `backend/src/modules/sos/sos.service.ts` ("Subtask C", ×2)
- `backend/src/modules/service-requests/service-requests.service.ts`
  ("Subtask C2")
- `backend/src/modules/properties/properties.service.ts`,
  `properties.controller.ts` ("Subtask B3", "Subtask C1")
- `backend/src/modules/finance/finance-scheduler.service.ts`
  ("Subtask A", "Subtask B")
- `backend/src/modules/realtime/realtime.gateway.ts` ("Decision #5",
  "Decision #4", "Decision #2")
- `backend/src/main.ts` ("Subtask D2", ×2)
- `frontend-web/src/lib/api.ts` ("Subtask C5")
- `frontend-web/src/app/dashboard/page.tsx`, `dashboard/sos/page.tsx`,
  `dashboard/chat/page.tsx` ("Subtask D"/"Decision #7", several)
- `mobile/src/screens/chat/ChatScreen.tsx` ("Subtask E"/"Decision #7")
- `mobile/src/screens/dashboard/DashboardScreen.tsx` ("Architecture
  Decision #4")

**Fix:** for each, either delete the comment entirely (if it was purely
narrating "this exists because of task X," which the WHY doesn't need
once the code is just... the code) or rewrite it to explain the
non-obvious WHY without the task/decision numbering (e.g. `chat.service.ts`'s
"Скопировано verbatim из bookings.service.ts" comment becomes
unnecessary — or actively misleading — once
[Task 0031](0031-tenant-isolation-consolidation.md) removes the
duplication it's describing; if 0031 lands first, this comment is simply
deleted along with the duplicated method). Use your judgment per-comment
— some may have a genuine non-obvious WHY worth keeping in plain language
(e.g. "HOA_CHAIRMAN is intentionally read-only here" is worth keeping;
"Subtask B: added this" is not).

---

## Acceptance criteria

- The dead `Chat` route is gone from the staff navigation branch; the
  resident branch's registration is untouched.
- The four mobile staff-capability checks are defined once each and
  imported everywhere they're used; behavior (who can access what) is
  byte-for-byte unchanged.
- Request label mapping exists in one shared place; the
  `YARD_TERRITORY`/`INTERCOM_ACCESS` gap in the resident list screen is
  fixed as part of the extraction.
- No production-source comment references a Subtask/Decision/Task number
  (spec files exempted per decision #2).
- `npx tsc --noEmit` clean in `mobile/` (this task has no backend
  changes).
- All existing tests pass unmodified.

## Explicitly out of scope

- Backend `assertAccessToTenant` deduplication and
  `assertUserBelongsToTenant` adoption — that's
  [Task 0031](0031-tenant-isolation-consolidation.md), deliberately kept
  separate because it touches tenant-isolation authorization logic and
  deserves more careful, security-mindset review than a pure cleanup
  task.
- Any change to `*.spec.ts` describe/it string labels.
- The WebSocket connect/reconnect boilerplate repeated across
  `dashboard/chat/page.tsx`/`dashboard/sos/page.tsx`/`ChatScreen.tsx` —
  each instance is only ~10-15 lines and differs meaningfully per domain
  (chat vs. SOS event names/payloads); not worth extracting.
- `service-requests.service.ts`'s repeated inline staff-role array
  literal — folded into Task 0031 since fixing it properly means
  routing that module through the shared tenant-isolation helper, not a
  standalone extraction here.

## Deliverable

- One commit or PR (each finding is independent and low-risk enough to
  ship together).
- PR description lists each of the four findings (A-D) and confirms
  which was verified how (e.g. "Finding C: added a test proving both
  `YARD` and `YARD_TERRITORY` resolve to the same label").

---

## Review addendum (2026-09-10) — accepted, no issues found

**Verified good:** Finding A — only the dead staff-branch `Chat` route
removed, resident branch's identical registration untouched. Finding B —
`canAccessChat`/`canAccessRequests`/`canAccessLogs` added to
`AuthContext.tsx` with byte-identical role sets, all four consumer files
(`StaffMainTabs.tsx`, `StaffHomeScreen.tsx`, `StaffAccessLogScreen.tsx`,
`StaffGuestPassScreen.tsx`) now import and use them; the guest-pass
four-role check correctly switched to the pre-existing `isStaffUser`
rather than being re-defined as a fifth near-duplicate. Finding C — new
`mobile/src/utils/requestLabels.ts` correctly includes the
`YARD_TERRITORY`/`INTERCOM_ACCESS` aliases, fixing
`RequestsListScreen.tsx`'s gap as a side effect of the extraction exactly
as scoped; all three screens migrated. Finding D — grepped
`Subtask|Decision #|Task 00|per Task` across all `.ts`/`.tsx` post-fix:
zero hits in production source, only the expected hits remain in
`*.spec.ts` describe/it strings (correctly left alone per decision #2).
Also caught and fixed one instance not explicitly listed in the task
(`schema.prisma`'s `Payment.recordedById` comment referencing "this
task") — a legitimate extension of the same finding, not scope creep.
`tsc --noEmit` clean in `mobile/`, all existing tests pass unmodified.
Task accepted, no fixes required.
