# Task 0084: Mobile settings toggle for community board phone visibility

**Status:** Done
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, direct follow-up to
[Task 0063](0063-community-board-phone-visibility.md), which built the
backend mechanism (`hidePhoneInListings` on `User`, `PATCH
/community-board/my-phone-visibility`, masking in `getListings`) but
explicitly deferred the UI entry point: "Mobile UI toggle and web UI
toggle — this task is the backend mechanism only; a settings-screen
entry point can follow separately if requested." **Found by an audit
sweep, not a fresh request** — grepping the whole repo for
`phoneVisib`/`hidePhoneInListings` turns up nothing outside the
backend file itself; the setting has been unreachable from any UI
since it shipped.

**Confirmed by reading
[mobile/src/screens/profile/ProfileScreen.tsx](../mobile/src/screens/profile/ProfileScreen.tsx):**
this screen already has a notification-preferences section (lines
~50-71, 227-280) — a `NotificationPreferences` state object loaded via
`NotificationsApi`, rendered as a row of labeled `Switch` toggles
(`CHAT`/`SERVICE_REQUEST`/`ANNOUNCEMENT`/`FINANCE`), each calling
`handleTogglePreference(key, value)` on change. This is the exact
established pattern for "a persistent per-user boolean setting with a
switch in the profile screen" — the phone-visibility toggle is
structurally identical (one boolean, one switch, one PATCH call) and
belongs in the same screen, not on
[CreateListingScreen.tsx](../mobile/src/screens/community-board/CreateListingScreen.tsx)
(a one-off listing-creation form, not where a persistent account
setting should live).

**Web is out of scope for this task — confirmed, not assumed.**
Community board is a resident-facing feature; residents have no web
presence anywhere in this project (`frontend-web` is exclusively the
staff/board dashboard). Task 0063's own "Explicitly out of scope" line
mentioned "mobile UI toggle **and** web UI toggle" generically, but
there is no resident-facing web surface for this setting to live on —
only mobile needs this task.

### Architecture decisions already made — do not re-litigate

1. **Lives in
   [ProfileScreen.tsx](../mobile/src/screens/profile/ProfileScreen.tsx),
   in a new small section near the existing notification-preferences
   `Switch` block** — same visual pattern (label + `Switch`), not a
   new screen, not on the listing-creation form. Per the Context
   section's precedent.
2. **New `mobile/src/api/community-board.ts` method
   `updatePhoneVisibility(hidePhoneInListings: boolean)`** calling
   `PATCH /community-board/my-phone-visibility` — the existing file
   ([community-board.ts](../mobile/src/api/community-board.ts)) has no
   method for this yet, add it alongside `getListings`/`createListing`/
   `getMyListings`.
3. **Load the current value from `user` if already present on the
   auth profile response, otherwise default to `false` and let the
   toggle write-through.** Check whether `GET /auth/me` /
   `UserProfile` already includes `hidePhoneInListings` (it's a plain
   column on `User`, so it may already come through if that endpoint
   selects all scalar fields — verify by reading
   `AuthService`'s profile-fetching method and
   `mobile/src/api/auth.ts`'s `UserProfile` interface before assuming
   either way). If it's not currently returned, add it to whichever
   query builds that response — don't invent a separate "get my
   current visibility setting" endpoint when the existing profile
   fetch is the natural place for it.
4. **Optimistic UI with rollback on failure** — flip the switch
   immediately on tap, call the API, and revert the switch state if
   the call fails (with a brief error toast/alert), matching the
   existing `handleTogglePreference`'s pattern in this same screen (
   check its exact optimistic/rollback shape and mirror it, don't
   invent a different one for this one new toggle).
5. **Full kk/ru/en i18n parity**, new keys in the existing
   `communityBoard.*` or `profile.*` namespace (check which one the
   existing notification-preferences section actually uses and follow
   that, for consistency within the same screen).

---

## Subtask A — API client

- `mobile/src/api/community-board.ts`: add
  `updatePhoneVisibility(hidePhoneInListings: boolean): Promise<{
  hidePhoneInListings: boolean }>` per decision #2.
- If needed per decision #3, add `hidePhoneInListings` to
  `mobile/src/api/auth.ts`'s `UserProfile` interface.

## Subtask B — Screen

- [ProfileScreen.tsx](../mobile/src/screens/profile/ProfileScreen.tsx):
  add the toggle per decisions #1/#3/#4, with a short explanatory
  subtitle (e.g. "Скрыть номер телефона от других жильцов в
  объявлениях на доске") so the setting's scope is clear — per Task
  0063's own decision #3, this only hides the phone from *other
  residents* on the board feed, not from staff; the UI copy should
  reflect that distinction so a resident doesn't mistakenly believe
  it hides their number from the ЖК too.
- Full kk/ru/en i18n parity per decision #5.

---

## Acceptance criteria

- A resident can toggle phone visibility from `ProfileScreen`, the
  setting persists (reload the app / refetch profile and confirm it
  stuck), and it actually affects what other residents see on the
  board feed (manually cross-check against the already-tested backend
  behavior from Task 0063 — no backend test changes expected here).
- The toggle's label/subtitle makes clear this doesn't hide the number
  from ЖК staff.
- `npx tsc --noEmit` clean in `mobile/`; full kk/ru/en i18n parity
  maintained.

## Explicitly out of scope

- Any backend change — the endpoint and masking logic already exist
  and are already tested (Task 0063).
- Web UI — no resident-facing web surface exists in this project.
- Any other per-listing or per-module visibility control — this task
  only wires up the one existing community-board setting.

## Deliverable

- Single mobile commit.
- PR description confirms the setting was manually toggled and its
  effect verified against a second resident account viewing the same
  listing.
