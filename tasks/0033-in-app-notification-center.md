# Task 0033: In-app notification center (web + mobile)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. Confirmed by reading
[notifications.service.ts](../backend/src/modules/notifications/notifications.service.ts):
every push notification in this app (SOS alerts, chat replies, service-
request updates, overdue-balance reminders from
[Task 0021](0021-scheduled-charge-generation.md), etc.) goes through
exactly three fan-out methods (`sendToUser`, `sendToTenant`,
`sendToTenantRoles`) and is **never persisted anywhere** — it's
fire-and-forget to Expo's push API. Once a push notification is dismissed
from the phone's tray or the app is opened elsewhere, there is no way to
see "what did I miss" inside the app. This task adds persistent history
with read/unread state, surfaced as a notification center on both web and
mobile.

### Architecture decisions already made — do not re-litigate

1. **One integration point, not one per feature.** Persistence is added
   **inside** `NotificationsService`'s three existing fan-out methods,
   not by touching every caller (SOS, chat, votings, finance-scheduler,
   etc.). Every one of those callers keeps working with zero changes —
   this is the entire reason those three methods already exist as a
   shared choke point.
2. **Persist once per recipient *user*, not once per device token.** A
   user with two registered devices must get **one** `Notification` row
   per send, not two — `sendToTenant`/`sendToTenantRoles` currently
   collect `DeviceToken` rows (which can have duplicate `userId`s across
   multiple devices); dedupe to unique user IDs before writing
   `Notification` rows, even though the push dispatch itself still
   fans out to every device token as it does today.
3. **No real-time for this feature in v1.** Don't wire this into
   [Task 0020](0020-realtime-websocket.md)'s WebSocket infrastructure —
   that would mean adding a new event type touched by every caller of
   the three fan-out methods (SOS, chat, votings, finance-scheduler,
   announcements), which is exactly the fan-out-of-changes this task's
   decision #1 avoids. Fetch-on-open/focus plus a manual refresh is
   enough for a notification history screen; if live-updating unread
   counts are wanted later, that's a follow-up task.
4. **No migration file — this project doesn't use them.** Confirmed: no
   `backend/prisma/migrations/` directory exists anywhere in this repo
   (every prior schema change, e.g. `mustChangePassword` in
   [Task 0023](0023-platform-tenant-onboarding.md), went straight into
   `schema.prisma` and relied on `prisma db push`/`generate`). Match that
   convention, don't introduce `prisma migrate dev` as a new pattern here.
5. **Simple offset pagination, no cursor-based scheme.** This codebase
   doesn't use cursor pagination anywhere (e.g. `take: 100` caps
   elsewhere with no `skip`/cursor) — a plain `take`/`skip` with a
   reasonable page size is consistent with house style, don't introduce
   a new pagination convention for just this feature.
6. **Retention/cleanup is out of scope.** Notifications accumulate
   unbounded for now — acceptable for a first version, flag as a known
   future concern in the PR rather than building a cleanup job here.

---

## Subtask A — Schema

Add a `Notification` model to `schema.prisma`: `id`, `userId` (FK to
`User`, cascade delete), `title`, `body`, `data` (JSON, nullable — carries
whatever deep-link info the original push payload had, e.g.
`{ type: 'SOS_ALERT', alertId: '...' }`), `isRead` (default `false`),
`createdAt`. Index on `(userId, createdAt)` for the list query and
`(userId, isRead)` for the unread-count query.

## Subtask B — Persist inside the fan-out methods

- `sendToUser(userId, payload)`: after dispatching, write one
  `Notification` row for `userId`.
- `sendToTenant(tenantId, payload)` / `sendToTenantRoles(tenantId, roles,
  payload)`: dedupe the resolved device tokens down to unique `userId`s
  (decision #2) and write one `Notification` row per unique user.
- `payload.data` (already an existing field on `PushPayload`) becomes the
  `Notification.data` column directly — no new payload shape needed.
- Do this so persistence failure doesn't break the push itself (wrap in
  its own try/catch, log and continue) — a DB hiccup here shouldn't
  prevent an SOS push from going out.

**Test:** `sendToUser` creates exactly one `Notification` row with the
right `userId`/`title`/`body`/`data`; `sendToTenant` with a mock user who
has two device tokens creates exactly one row for that user, not two;
existing tests for every caller of these three methods (SOS, chat,
votings, finance-scheduler, wherever they're used) still pass unmodified
— confirms decision #1 held.

## Subtask C — Endpoints

New controller (or extend the existing `notifications.controller.ts`):
- `GET /notifications?take=&skip=` — the current user's notifications,
  newest first.
- `GET /notifications/unread-count` — a single number.
- `PATCH /notifications/:id/read` — mark one as read; must verify the
  notification belongs to the requesting user (straightforward IDOR
  check, same spirit as every other per-resource ownership check in this
  codebase).
- `PATCH /notifications/read-all` — mark all of the current user's
  unread notifications as read.

**Test:** the mark-read ownership check rejects marking another user's
notification; unread-count reflects reality after marking some read.

## Subtask D — Web: bell icon + panel

- Add a bell icon with an unread-count badge to
  `frontend-web/src/app/dashboard/layout.tsx`'s existing top `<header>`
  bar (around where the "systemOnline" badge already lives).
- Clicking it opens a dropdown/panel listing recent notifications
  (title, body, relative time, read/unread visual state). Opening the
  panel (or a per-item click) marks it read via the new endpoint;
  refetch the list/unread-count after loading and after marking read.
- If a notification's `data` contains something actionable and it's
  straightforward to route to (e.g. an SOS alert → the SOS dashboard, a
  chat message → that conversation), wire that up; if the mapping isn't
  obvious for a given `data.type`, just show the notification text
  without a click-through rather than guessing at a route.
- Full kk/ru/en i18n parity for all new UI text.

## Subtask E — Mobile: notifications screen + badge

- A notifications screen (reachable from wherever makes sense — the
  resident's existing tab bar and `StaffMainTabs` both need an entry
  point; check whether one shared screen component can serve both
  audiences the way [Task 0027](0027-mobile-service-requests.md)'s
  `RequestDetailScreen` extension did, since the underlying data — "my
  notifications" — is identical for residents and staff, unlike
  chat/SOS/requests which had genuinely different staff-vs-resident
  shapes).
- Same list/mark-read/unread-count behavior as web, fetched on
  mount/focus (decision #3 — no socket).
- A badge on the relevant tab icon showing the unread count, if React
  Navigation's tab-badge API is straightforward to wire up here; a
  simple in-screen unread count is an acceptable fallback if not.
- Full kk/ru/en i18n parity.

---

## Acceptance criteria

- Every existing push-sending call site (SOS, chat, votings,
  finance-scheduler, wherever `sendToUser`/`sendToTenant`/
  `sendToTenantRoles` is called) needed zero code changes — persistence
  happens transparently inside `NotificationsService`.
- A user with multiple registered devices gets one persisted notification
  per send, not one per device.
- Mark-read endpoints reject acting on another user's notifications.
- Both web and mobile can list notification history, see unread counts,
  and mark items read.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in all three
  apps.
- Full kk/ru/en i18n parity on both apps for all new UI text.

## Explicitly out of scope

- Real-time/WebSocket-pushed live updates to the notification list —
  decision #3.
- Notification retention/cleanup — decision #6.
- Any change to the actual push-sending logic (Expo dispatch, device
  token registration) — this task only adds a persistence layer
  alongside it.
- Per-notification-type user preferences (e.g. "don't notify me about
  chat messages") — a distinct, larger feature if ever wanted.

## Deliverable

- Can ship as separate commits (backend persistence + endpoints, web UI,
  mobile UI) or one PR — your call.
- PR description confirms which existing test suites (SOS, chat, votings,
  finance-scheduler) were re-run and passed unmodified, proving the
  single-integration-point decision held in practice.

---

## Review addendum (2026-09-10) — accepted, no issues found

**Backend:** `schema.prisma`'s `Notification` model matches the spec
exactly — both `(userId, createdAt)` and `(userId, isRead)` indexes
present, cascade delete on `User`. `persistNotifications` is correctly
wired into all three fan-out methods (`sendToUser`, `sendToTenant`,
`sendToTenantRoles`), wrapped in its own try/catch with a defensive guard
so a persistence failure can never block a push from going out (decision
#1's single-integration-point requirement held — confirmed via `git diff
--stat` that `sos`, `chat`, `votings`, and `finance-scheduler` modules
have zero changes). Dedup-by-user (decision #2) is implemented via
`Array.from(new Set(devices.map(d => d.userId).filter(Boolean)))` before
persisting, and proven by dedicated tests: a mock user with two device
tokens produces exactly one `Notification` row, both for `sendToTenant`
and `sendToTenantRoles`. `markAsRead` correctly rejects acting on another
user's notification (404 if missing, 403 `NOTIFICATIONS.FORBIDDEN` if
owned by someone else) — the IDOR check the spec asked for. Route
ordering between the static `read-all` and dynamic `:id/read` PATCH
routes is unambiguous. 324/324 backend tests pass, `tsc --noEmit` clean.

**Web:** `NotificationBell.tsx` implements the bell+badge+dropdown
pattern correctly — 99+ cap on the badge, click-outside-to-close, marks
read on item click before navigating, `getTargetRoute` maps known
`data.type`/id-field combinations to dashboard routes and falls through
to no-click-through for anything unrecognized (matches the spec's "don't
guess" instruction exactly). Wired cleanly into `dashboard/layout.tsx`'s
header next to the existing `systemOnline` badge.

**Mobile:** confirmed the spec's suggested reuse — `NotificationsScreen.tsx`
is a single shared screen for both residents and staff (not forked),
branching only on `isStaffRole` to route a chat-type notification to
`StaffChatThread` vs. the resident `Chat` screen, mirroring Task 0027's
`RequestDetailScreen` extension pattern as intended. Registered as a
stack screen in both `RootNavigator.tsx` branches (resident and staff)
with matching `types.ts` entry. Entry points: both `DashboardScreen.tsx`
(resident) and `StaffHomeScreen.tsx` (staff) got a bell icon with an
unread-count badge in their header, refetched on `useFocusEffect` and on
pull-to-refresh — a reasonable, spec-permitted fallback to a full
tab-icon badge (spec explicitly allowed "a simple in-screen unread count
... if not [straightforward to wire up]"). No real-time wiring was added
anywhere (decision #3 held).

**Verified:** full kk/ru/en i18n parity — 941/941/941 keys in
`frontend-web`, 767/767/767 keys in `mobile`. `npx tsc --noEmit` clean in
both `frontend-web` and `mobile`. Task accepted, no fixes required.
