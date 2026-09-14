# Task 0074: Mobile UI for booking waitlist

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, direct follow-up to
[Task 0070](0070-booking-waitlist.md), which shipped a backend-only
waitlist mechanism: `POST /bookings/resources/:resourceId/waitlist`
(join, body `{ startTime, endTime }`), `GET /bookings/my-waitlist`
(view own entries), `DELETE /bookings/waitlist/:id` (leave, own entry
only). There is currently no UI for any of this.

**Platform decision already settled — this is a mobile task, not
web.** Confirmed by reading both web dashboard booking pages: the web
app has no resident-facing "create a booking" flow at all —
[bookings/page.tsx](../frontend-web/src/app/dashboard/bookings/page.tsx)
is a staff moderation log (view + cancel, no creation) and
[bookings/resources/page.tsx](../frontend-web/src/app/dashboard/bookings/resources/page.tsx)
is staff catalog management (create/edit resource definitions, not
bookings of them). Residents only ever call `createBooking` from
[mobile/src/screens/bookings/BookingsScreen.tsx](../mobile/src/screens/bookings/BookingsScreen.tsx)
via [mobile/src/api/bookings.ts](../mobile/src/api/bookings.ts) — the
waitlist join action belongs exactly where that call already fails
with a slot conflict, which only exists on mobile.

**Confirmed by reading `BookingsScreen.tsx` in full:**
- `handleConfirmBooking` currently catches any `createBooking` failure
  generically: `Alert.alert(t('common.error'), getApiErrorMessage(err))`
  — no special handling for a full slot.
- The screen already has a two-tab switcher (`activeTab: 'SPACES' |
  'MY'`) and already imports `Layers` from `lucide-react-native`
  ([BookingsScreen.tsx:25](../mobile/src/screens/bookings/BookingsScreen.tsx#L25))
  **but never uses it** — this is the natural icon for a third
  "Waitlist" tab, use it rather than adding a new icon import.
- `getApiErrorMessage`
  ([mobile/src/api/client.ts:126-140](../mobile/src/api/client.ts#L126-L140))
  reads `error?.response?.data?.code` and looks up `errors.${code}` in
  i18n — the same field (`err?.response?.data?.code`) is what a
  slot-conflict-specific branch needs to check
  (`'BOOKINGS.SLOT_CONFLICT'`).
- `mobile/src/i18n/locales/ru.json`'s `errors.BOOKINGS` block already
  has a translated `SLOT_CONFLICT` entry
  ([ru.json:626](../mobile/src/i18n/locales/ru.json#L626)) — the new
  backend codes from Task 0070 (`SLOT_NOT_FULL`,
  `ALREADY_ON_WAITLIST`, `WAITLIST_ENTRY_NOT_FOUND`,
  `WAITLIST_LEAVE_FORBIDDEN`) need the same treatment, added to the
  same `errors.BOOKINGS` block in all three mobile dictionaries.

### Architecture decisions already made — do not re-litigate

1. **Third tab on the existing `BookingsScreen`, not a new screen/
   route.** `activeTab: 'SPACES' | 'MY' | 'WAITLIST'` — matches the
   screen's own existing two-tab pattern exactly, avoids new
   navigation wiring for what is conceptually a third view of the same
   "my bookings" concept.
2. **On `BOOKINGS.SLOT_CONFLICT`, offer joining the waitlist via
   `Alert.alert` with two actions** — "Отмена" and "Встать в очередь"
   — rather than silently failing with just an error message. The
   waitlist join call uses the *exact same* `startTime`/`endTime` the
   failed booking attempt used (the same `startDate`/`endDate` values
   already computed in `handleConfirmBooking`, not re-derived).
3. **`joinWaitlist`/`getMyWaitlist`/`leaveWaitlist` added to
   `BookingsApi`** (mobile/src/api/bookings.ts), matching the backend
   contract from [Task 0070](0070-booking-waitlist.md) exactly — same
   method-naming convention as the existing `createBooking`/
   `getMyBookings`/`cancelBooking`.
4. **No notification-tap deep-linking for
   `BOOKING_WAITLIST_SLOT_AVAILABLE`.** Confirmed by reading
   `NotificationsScreen.tsx`: this app has no existing per-`data.type`
   tap-routing infrastructure for any notification type — building one
   now, for one notification type, would be a disproportionate amount
   of new infrastructure for what this task needs. The push already
   works (Task 0070 shipped it); the resident opens the app and checks
   the new Waitlist tab like any other push-prompted check. A generic
   deep-linking system can be its own task later if actually wanted
   across all notification types.

---

## Subtask A — API client

In [mobile/src/api/bookings.ts](../mobile/src/api/bookings.ts), add:

```ts
export interface WaitlistEntry {
  id: string;
  resourceId: string;
  unitId: string;
  userId: string;
  startTime: string;
  endTime: string;
  createdAt: string;
  resource?: { id: string; name: string; type: string };
}
```

- `joinWaitlist(resourceId, data: { startTime: string; endTime: string }): Promise<WaitlistEntry>`
  → `POST /bookings/resources/${resourceId}/waitlist`.
- `getMyWaitlist(): Promise<WaitlistEntry[]>` → `GET /bookings/my-waitlist`.
- `leaveWaitlist(id: string): Promise<{ success: boolean }>` →
  `DELETE /bookings/waitlist/${id}`.

## Subtask B — Screen changes

In [BookingsScreen.tsx](../mobile/src/screens/bookings/BookingsScreen.tsx):

- `activeTab` type gains `'WAITLIST'` (decision #1); add a third tab
  button using the already-imported `Layers` icon.
- `fetchData`'s `Promise.all` gains `BookingsApi.getMyWaitlist()`,
  stored in a new `myWaitlist` state array.
- `handleConfirmBooking`'s catch block: if
  `err?.response?.data?.code === 'BOOKINGS.SLOT_CONFLICT'` (decision
  #2), show `Alert.alert(t('bookings.slotFullTitle'),
  t('bookings.waitlistJoinPrompt'), [{ text: t('common.cancel'),
  style: 'cancel' }, { text: t('bookings.waitlistJoinBtn'), onPress:
  async () => { ...call joinWaitlist(selectedResource.id, {
  startTime: startDate.toISOString(), endTime: endDate.toISOString()
  }), then Alert.alert success, close the booking modal, switch
  activeTab to 'WAITLIST', fetchData() } }])` — otherwise fall back to
  the existing generic `getApiErrorMessage` alert unchanged.
- New `WAITLIST` tab content: list `myWaitlist` entries (resource
  name, formatted slot time range via the existing
  `formatSlotTime`/`formatDateLabel` helpers already in this file,
  don't reinvent date formatting), each with a "Покинуть очередь"
  button that confirms (matching `handleCancelBooking`'s existing
  `Alert.alert` confirm-then-act pattern) then calls `leaveWaitlist`
  and refetches. Empty-state card matching the existing
  `emptyCard`/`emptyText` style used for the other two tabs' empty
  states.

**i18n:** add to the `bookings` namespace in all three mobile
dictionaries (ru/kk/en) — `tabWaitlist`, `emptyWaitlist`,
`slotFullTitle`, `waitlistJoinPrompt`, `waitlistJoinBtn`,
`waitlistJoinSuccess`, `waitlistLeaveBtn`, `waitlistLeaveConfirm`,
`waitlistLeaveSuccess`, `waitlistSlotLabel`. Add
`SLOT_NOT_FULL`/`ALREADY_ON_WAITLIST`/`WAITLIST_ENTRY_NOT_FOUND`/
`WAITLIST_LEAVE_FORBIDDEN` to the existing `errors.BOOKINGS` block in
all three files. Full parity required — verify with the same
flatten-and-diff key-count comparison used throughout this project.

---

## Acceptance criteria

- Attempting to book a genuinely full slot offers joining the
  waitlist inline, using the exact slot that was attempted.
- The new Waitlist tab lists the resident's own entries and lets them
  leave one.
- `npx tsc --noEmit` clean in `mobile/`; full kk/ru/en i18n parity
  maintained.
- Manually exercised — this is a UI task; at minimum trace the new
  conditional branches carefully since a live device/simulator run may
  not be practical in this environment.

## Explicitly out of scope

- Notification tap deep-linking — per decision #4.
- Any web UI — per the Context section's platform research, the web
  dashboard has no equivalent resident booking flow to attach this to.
- Any change to `createBooking`'s own conflict-detection logic on the
  backend — untouched; this task is UI-only, consuming Task 0070's
  existing endpoints as-is.

---

## Deliverable

- Single commit.
- PR description confirms the slot-conflict-to-waitlist-join flow was
  traced end-to-end (same `startTime`/`endTime` values flow from the
  failed attempt into the join call) — that's the property most worth
  calling out, since re-deriving the slot instead of reusing the
  original values would be an easy, hard-to-notice mistake.

---

## Implementation Summary (Completed)

- **API client (`mobile/src/api/bookings.ts`):**
  - Added `WaitlistEntry` interface.
  - Added `joinWaitlist(resourceId, { startTime, endTime })` calling `POST /bookings/resources/${resourceId}/waitlist`.
  - Added `getMyWaitlist()` calling `GET /bookings/my-waitlist`.
  - Added `leaveWaitlist(id)` calling `DELETE /bookings/waitlist/${id}`.
- **Screen (`mobile/src/screens/bookings/BookingsScreen.tsx`):**
  - Added `'WAITLIST'` to `activeTab` union and added `myWaitlist` state.
  - Extended `fetchData` to fetch `getMyWaitlist()` in `Promise.all`.
  - Added third tab button using the `Layers` icon with badge counter.
  - In `handleConfirmBooking`'s catch block: if `err?.response?.data?.code === 'BOOKINGS.SLOT_CONFLICT'`, shows confirmation alert offering to join the waitlist with the exact same `startDate.toISOString()` and `endDate.toISOString()` values. On join success, closes modal, alerts success, switches to `'WAITLIST'` tab, and refetches data.
  - Added `'WAITLIST'` tab view: renders waitlist cards with resource name, formatted slot times (`formatDateLabel`, `formatSlotTime`), `waitlistSlotLabel` warning badge, and a "Покинуть очередь" button with confirmation alert calling `leaveWaitlist`. Empty state card displayed when no waitlist entries exist.
- **i18n (`ru.json`, `kk.json`, `en.json`):**
  - Added 10 keys to `bookings`: `tabWaitlist`, `emptyWaitlist`, `slotFullTitle`, `waitlistJoinPrompt`, `waitlistJoinBtn`, `waitlistJoinSuccess`, `waitlistLeaveBtn`, `waitlistLeaveConfirm`, `waitlistLeaveSuccess`, `waitlistSlotLabel`.
  - Added 4 keys to `errors.BOOKINGS`: `SLOT_NOT_FULL`, `ALREADY_ON_WAITLIST`, `WAITLIST_ENTRY_NOT_FOUND`, `WAITLIST_LEAVE_FORBIDDEN`.
  - Maintained 100% key parity across all 3 mobile locale files (807 keys each, 0 diffs).
- **Verification:**
  - `npx tsc --noEmit` in `mobile/`: 0 errors.
  - Static and contract verification script passed all checks, confirming exact ISO date/time flow into `joinWaitlist` on conflict, leave confirmation and deletion, and all localization strings.
