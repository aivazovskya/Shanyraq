# Task 0038: Per-category notification preferences (web + mobile)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, explicit follow-up flagged in
[Task 0033](0033-in-app-notification-center.md)'s "Explicitly out of
scope": "Per-notification-type user preferences (e.g. 'don't notify me
about chat messages')". Today every push notification a user is eligible
for is delivered unconditionally — there's no way to mute one category
(e.g. chat messages) while keeping others.

**Researched, not guessed — the real category taxonomy.** Grepped every
call site of `NotificationsService`'s three fan-out methods
(`sendToUser`/`sendToTenant`/`sendToTenantRoles`) across the whole
backend. Exactly five modules send push notifications today:
[sos.service.ts](../backend/src/modules/sos/sos.service.ts) (sets
`data.type: 'SOS_ALERT'`),
[chat.service.ts](../backend/src/modules/chat/chat.service.ts) (two call
sites, both set `data.type: 'CHAT_MESSAGE'`),
[finance-scheduler.service.ts](../backend/src/modules/finance/finance-scheduler.service.ts)
(sets `data.type: 'DEBT_REMINDER'`),
[announcements.service.ts](../backend/src/modules/announcements/announcements.service.ts)
(**no `type` field set at all** — only `announcementId`/`tenantId`/
`isUrgent`), and
[service-requests.service.ts](../backend/src/modules/service-requests/service-requests.service.ts)
(five call sites, **none set a `type` field** — only `requestId`/
`status`/etc.). `bookings`, `votings`, and `community-board` don't send
push notifications at all today, despite
[NotificationsScreen.tsx](../mobile/src/screens/notifications/NotificationsScreen.tsx)'s
routing heuristic already having dead branches for `BOOKING`/`VOTING` —
that's pre-existing, harmless dead code from Task 0033, not something
this task needs to touch.

### Architecture decisions already made — do not re-litigate

1. **SOS is never user-configurable — this is the #1 way this task goes
   wrong.** `SOS_ALERT` notifications go to on-duty `SECURITY`/
   `DISPATCHER`/`HOA_ADMIN` staff for another resident's emergency —
   letting a staff member silently mute this category would be a
   life-safety regression, not a convenience feature. `SOS_ALERT` must
   never appear in the user-facing preferences list, and the filtering
   logic (Subtask A) must unconditionally deliver it regardless of any
   stored preference — enforce this in code (a short-circuit before any
   preference lookup for this one type), not just by omitting it from
   the UI.
2. **Reuse `payload.data.type` as the category signal — don't introduce
   a second parallel field.** Three of five senders already set
   `data.type`; standardize the other two
   (`announcements.service.ts` → `type: 'ANNOUNCEMENT'`,
   `service-requests.service.ts`'s five call sites → `type: 'SERVICE_REQUEST'`)
   rather than inventing a `category` parameter alongside it. This is a
   small, additive, non-breaking change to those two files (adds a field
   to an existing `data` object, doesn't change anything else) — and as
   a side benefit, it also makes
   [NotificationBell.tsx](../frontend-web/src/components/NotificationBell.tsx)'s/
   [NotificationsScreen.tsx](../mobile/src/screens/notifications/NotificationsScreen.tsx)'s
   existing deep-link routing (which checks `type.includes(...)` first,
   falling back to id-presence) more reliable for these two categories
   too, though fixing that routing isn't this task's goal.
3. **Four user-configurable categories, mapped from `data.type` inside
   `NotificationsService`**: `CHAT` (from `CHAT_MESSAGE`),
   `SERVICE_REQUEST` (from `SERVICE_REQUEST`), `ANNOUNCEMENT` (from
   `ANNOUNCEMENT`), `FINANCE` (from `DEBT_REMINDER`). Keep this mapping
   as a small static object in `notifications.service.ts`, not spread
   across each caller.
4. **Unknown or missing `type` values default to allowed (fail-open),
   not filtered.** If a future caller sends a payload with no `type` or
   a `type` not in the mapping, treat it as unfiltered/always-delivered
   — the preference system is a specific, known opt-out list, not a
   default-deny allowlist. A categorization gap must never silently
   drop a real notification (e.g. a future SOS-adjacent type someone
   forgets to map).
5. **Storage: a single nullable `Json` column on `User`, not a new
   table.** Add `User.notificationPreferences Json?` — `null` or a
   missing key inside it means "enabled" (default). This avoids a
   backfill step for existing users (matches how `Notification.data
   Json?` is already nullable) and this project's "no migrations"
   convention — a plain `schema.prisma` edit + `db push`, same as every
   prior schema change here. A relational table would be overkill for
   4 boolean flags per user.
6. **Filtering happens per-recipient inside the three fan-out methods,
   not as a global skip.** `sendToTenant`/`sendToTenantRoles` fan out to
   *multiple* users' devices in one call — muting a category must
   exclude only the device tokens belonging to users who disabled that
   specific category (both from persistence and from the actual push
   dispatch), while still delivering to everyone else in the same call.
   `sendToUser` checks the one target user's preference the same way.
   This is the natural extension of Task 0033's existing
   dedupe-by-user logic in the same three methods — same integration
   point, no caller changes needed beyond decision #2's `type`
   standardization.
7. **No new nav entry on web — extend `NotificationBell.tsx`.** This
   platform has no user-settings/profile page on web at all today
   (confirmed — no `frontend-web/src/app/dashboard/profile` route
   exists). Rather than inventing one for four toggles, add a small
   settings affordance (a gear icon) inside the existing notification
   bell's dropdown panel that reveals the four category toggles inline
   — matches [Task 0035](0035-superadmin-platform-overview.md)'s
   "extend, don't add a nav entry" precedent.
8. **Mobile: replace the existing static "Push: Активны" badge, don't
   add a separate screen.**
   [ProfileScreen.tsx](../mobile/src/screens/profile/ProfileScreen.tsx)
   already has a "Push-уведомления" row under its security/system-info
   section (currently just a hardcoded green "Активны" badge with no
   real toggle behind it) — replace that row's content with the four
   real category switches. `StaffProfileScreen.tsx` has no equivalent
   row today; add one there too so staff get the same control. Use
   React Native's built-in `Switch` component (confirmed — no `Switch`
   used anywhere in this codebase yet, so this is the first one; don't
   pull in a UI library for it, the built-in component is sufficient
   for four on/off toggles).

---

## Subtask A — Backend: schema + preference-aware filtering

- Add `notificationPreferences Json?` to `User` in `schema.prisma`
  (decision #5) — no other schema change.
- In [notifications.service.ts](../backend/src/modules/notifications/notifications.service.ts):
  - Add a `CATEGORY_MAP: Record<string, string>` constant (decision #3)
    and a helper `resolveCategory(type?: string): string | null`
    returning `null` for `SOS_ALERT` and unmapped/missing types
    (decision #1/#4 — `null` means "always deliver, don't filter").
  - Add `getEffectivePreferences(userId)` (or inline logic) resolving
    the four categories' enabled state from `User.notificationPreferences`,
    defaulting every category to `true` when the column is `null` or a
    key is absent.
  - In `sendToUser`: if the resolved category is non-null, look up that
    one user's preference for it; if disabled, skip both persistence
    and dispatch for that user (return `{ sent: 0 }`), matching the
    existing early-return shape used when a user has no devices.
  - In `sendToTenant`/`sendToTenantRoles`: after fetching the device
    list, if the resolved category is non-null, fetch preferences for
    the distinct `userId`s involved and filter out devices (and exclude
    those `userId`s from `persistNotifications`) belonging to users who
    disabled that category — everyone else in the same call still gets
    it (decision #6).
- Add `GET /notifications/preferences` and
  `PATCH /notifications/preferences` to
  [notifications.controller.ts](../backend/src/modules/notifications/notifications.controller.ts)
  (existing `JwtAuthGuard`, `@CurrentUser('id')`):
  - `GET` returns the resolved four-category map (all `true` by default
    for a user who never touched their preferences).
  - `PATCH` accepts a partial `{ CHAT?: boolean; SERVICE_REQUEST?:
    boolean; ANNOUNCEMENT?: boolean; FINANCE?: boolean }` (validate
    against exactly these four keys — reject/ignore an attempt to set
    `SOS`, decision #1's defense against a client bug) and merges it
    into the stored JSON, returning the resulting resolved map.
  - Add the DTO to
    [notifications.dto.ts](../backend/src/modules/notifications/dto/notifications.dto.ts).

**Tests:** extend `notifications.service.spec.ts` —
- A user who disabled `CHAT` does not receive a `CHAT_MESSAGE`-typed
  `sendToUser` call (no persisted row, no dispatch), while a user who
  didn't touch preferences still does.
- `sendToTenantRoles` with 3 target users where one disabled `FINANCE`:
  that one user's device is excluded from both `persistNotifications`
  and the dispatched token list, the other two still receive it.
- **`SOS_ALERT` is delivered even when the user has explicitly set
  every other category to disabled** — this is the direct regression
  test for decision #1, and it should attempt to set `SOS` false via
  the preferences map directly in the mock data (not just via the
  PATCH endpoint) to prove the *fan-out* logic itself never consults a
  preference for this type, not merely that the PATCH endpoint refuses
  to accept it.
- An unmapped/missing `type` is always delivered regardless of stored
  preferences (decision #4).
- `PATCH /notifications/preferences` with `{ SOS: false }` in the body
  either rejects the field or silently ignores it — either way, `SOS`
  never ends up `false` in the stored/returned map.

## Subtask B — Web: settings toggle in the notification bell

In [NotificationBell.tsx](../frontend-web/src/components/NotificationBell.tsx):

- Add a small gear/settings icon in the dropdown panel's header (next
  to the existing "mark all read" control).
- Clicking it reveals (inline, or a small nested panel — implementer's
  call) the four category toggles with their current state, fetched via
  `GET /notifications/preferences` when first opened; toggling one
  calls `PATCH /notifications/preferences` immediately (no separate
  "save" button, matching the instant-feedback pattern the rest of this
  bell already uses for mark-read).
- Full kk/ru/en i18n parity for all new text (extend the `notifications`
  namespace).

## Subtask C — Mobile: real toggles in both profile screens

- `mobile/src/api/notifications.ts`: add `getPreferences()`/
  `updatePreferences(partial)`.
- [ProfileScreen.tsx](../mobile/src/screens/profile/ProfileScreen.tsx):
  replace the static "Push-уведомления: Активны" row (decision #8) with
  four rows, each a label + `Switch`, fetched on mount/focus and calling
  `updatePreferences` on toggle (optimistic UI update, revert on error).
- [StaffProfileScreen.tsx](../mobile/src/screens/staff/StaffProfileScreen.tsx):
  add the equivalent section (this screen has no notification-settings
  row today).
- Full kk/ru/en i18n parity for all new text.

---

## Acceptance criteria

- Disabling a category stops both persistence and push dispatch for
  that user/category, verified per-recipient in a multi-user fan-out
  call — other recipients in the same call are unaffected.
- `SOS_ALERT` notifications are delivered unconditionally regardless of
  any stored preference, proven by a test that cannot pass by accident
  (checks the fan-out logic directly, not just the PATCH endpoint's
  input validation).
- An unmapped/missing notification `type` is never accidentally
  filtered.
- Web and mobile both expose working toggles for the four
  user-configurable categories, without a new page/nav entry on web.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in all three
  apps; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- Any UI/preference control for `SOS` — decision #1.
- Retroactively fixing `NotificationsScreen.tsx`'s dead `BOOKING`/
  `VOTING` routing branches — unrelated pre-existing dead code, not
  introduced or worsened by this task.
- Per-device preferences (e.g. muting chat only on one phone) — this is
  a per-user setting, consistent with how `Notification` rows are
  already deduped per-user rather than per-device (Task 0033).
- A "do not disturb" time-window feature — a distinct, larger feature if
  ever wanted.
- Adding push notifications to `bookings`/`votings`/`community-board`
  (which don't send any today) — out of scope, this task only adds
  preference filtering to what already exists.

## Deliverable

- Backend, web, and mobile can ship as separate commits.
- PR description explicitly confirms the SOS-always-delivered test
  result — this is the property most worth calling out given decision
  #1.

---

## Review addendum (2026-09-11) — accepted, no issues found

**Verified good:** `resolveCategory` returns `null` unconditionally for
`SOS_ALERT` (and for missing/unmapped types), and this is proven, not
assumed — a dedicated test stores `{ SOS: false, CHAT: false,
SERVICE_REQUEST: false, ANNOUNCEMENT: false, FINANCE: false }` directly
in the mocked user record (not via the PATCH endpoint) and confirms
`sendToUser` still persists and dispatches; a second test proves the
same for `sendToTenantRoles`'s multi-recipient fan-out. This is exactly
the right way to test decision #1 — it exercises the fan-out logic
itself, not just input validation. `type: 'ANNOUNCEMENT'`/
`'SERVICE_REQUEST'` were correctly added to the two senders that
previously had no `type` at all, with zero other behavior change to
those call sites. Per-recipient filtering in `sendToTenant`/
`sendToTenantRoles` correctly narrows both `uniqueUserIds` (for
persistence) and `eligibleDevices` (for dispatch) together, proven with
a 3-user fixture where only the one user with `FINANCE: false` is
excluded. Unknown/missing `type` fail-open is tested directly.
`updatePreferences` strips `SOS`/`SOS_ALERT` from the stored object even
if a caller's DTO somehow carried it (defense-in-depth beyond the DTO's
own typed shape). `DeviceToken.userId` is a required (non-nullable)
field, so the `.filter(Boolean)`/`Set`-based exclusion logic in the
multi-recipient methods has no reachable edge case where a legitimate
device is silently dropped for lack of a `userId`. Web adds the
preferences panel inline in the existing `NotificationBell` dropdown
(gear icon, back button, no new route) with immediate-apply-and-revert
toggle semantics matching the bell's existing mark-read pattern; mobile
correctly replaces the previously-static "Push: Активны" row in
`ProfileScreen.tsx` with four real `Switch` controls and adds an
equivalent section to `StaffProfileScreen.tsx`, both with the same
optimistic-update/revert-on-error handling.

**Noted, not blocking:** `profile.pushTitle`/`profile.pushSub` i18n keys
(the old static badge's text) are now unused in all three locale files
— harmless orphaned keys, fine to clean up in a future pass, not worth
a fix cycle on their own.

**Verified independently:** re-ran the full suite (367/367 pass, 10 new
tests), `tsc --noEmit` clean in `backend/`, `frontend-web/`, and
`mobile/`, full kk/ru/en parity (986/986/986 web keys, 777/777/777
mobile keys). Task accepted, no fixes required.
