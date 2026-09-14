# Task 0063: Resident phone visibility preference for community board listings

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[community-board.service.ts:59-97](../backend/src/modules/community-board/community-board.service.ts#L59-L97):**
`getListings` always includes `author.phone` in every returned
listing, for every viewer — a resident browsing the board to buy
someone's couch sees the seller's phone number with no way for the
seller to opt out. There is currently no privacy control here at all;
this task adds one.

**Scope, precisely — this is a peer-to-peer visibility control, not a
staff-data-minimization one.** The setting hides a resident's phone
from *other residents* viewing the general board feed. It does **not**
hide it from ЖК staff (`DISPATCHER`/`HOA_ADMIN`/`HOA_CHAIRMAN`/
`SUPERADMIN`) — staff already have broader access to resident contact
data throughout the app (the residents registry, guest pass history,
etc.), and moderation sometimes genuinely needs to contact a listing's
author. Don't build a staff-facing masking rule; this is
resident-to-resident only.

**Also confirmed — this narrows the actual code surface to touch:**
- [`getMyListings`](../backend/src/modules/community-board/community-board.service.ts#L329-L359)
  only ever returns the caller's own listings
  (`where: { authorId: user.id }`) — no masking needed, a resident
  always sees their own phone on their own posts.
- [`createListing`](../backend/src/modules/community-board/community-board.service.ts#L103-L161)'s
  and
  [`updateListing`](../backend/src/modules/community-board/community-board.service.ts#L166-L237)'s
  returned objects go back to the author who just created/edited the
  post (or a `SUPERADMIN`) — no masking needed there either.
- **`getListings` is the only method that needs to change** — it's
  the one place a listing is shown to viewers who are neither the
  author nor staff.

### Architecture decisions already made — do not re-litigate

1. **New `hidePhoneInListings Boolean @default(false)` column on
   `User`** in `schema.prisma`, `prisma db push` + `generate`. Not
   reusing the existing `notificationPreferences Json?` field — that
   field is purpose-built for
   [Task 0038](0038-notification-preferences.md)'s notification
   category opt-outs, a different concept (delivery preference, not a
   data-visibility rule); mixing them would blur what that JSON blob
   means. A dedicated boolean column is the right shape here, same as
   `isVerified`/`isActive` elsewhere on this model.
2. **New endpoint lives in the `community-board` module** —
   `PATCH /community-board/my-phone-visibility`, not a generic
   "user profile" endpoint (no such module exists in this project, and
   inventing one for a single field is out of scope). Any
   authenticated user may call it for their own account (`req.user.id`
   only — no `userId` param, so no BOLA surface).
3. **Masking only applies in `getListings`, and only to viewers who
   are neither the listing's author nor staff.** Per the Context
   section's analysis — `isStaff` is already computed at the top of
   `getListings` via `assertAccessToTenant`'s return value; reuse it
   directly, don't recompute staff-ness separately.
4. **When masking, return `phone: null` on the `author` object — don't
   omit the field or send an empty string.** `null` is the
   unambiguous "not available" signal the frontend can check for,
   consistent with how other nullable fields in this API already work
   (e.g. `price: null` for `GIVE_AWAY` listings).

---

## Subtask A — Backend: preference + masking

In [schema.prisma](../backend/prisma/schema.prisma), add
`hidePhoneInListings Boolean @default(false)` to `model User` (decision
#1). Run `prisma db push` and `prisma generate` in `backend/`.

In [community-board.service.ts](../backend/src/modules/community-board/community-board.service.ts):

- Add `updatePhoneVisibility(user, dto: { hidePhoneInListings: boolean })`:
  updates `this.prisma.user.update({ where: { id: user.id }, data: {
  hidePhoneInListings: dto.hidePhoneInListings } })`, returns the
  updated flag.
- In `getListings`, add `hidePhoneInListings: true` to the `author`
  `select`. After fetching, map the results: for each listing, if
  `!isStaff && listing.authorId !== user.id &&
  listing.author.hidePhoneInListings`, set `listing.author.phone =
  null` (decision #4) — then strip `hidePhoneInListings` itself out of
  the returned `author` object (it's an internal flag, not something
  the frontend needs to see per-listing).

In [community-board.controller.ts](../backend/src/modules/community-board/community-board.controller.ts):

- `PATCH /community-board/my-phone-visibility`, body
  `{ hidePhoneInListings: boolean }` (new
  `UpdatePhoneVisibilityDto` in
  [dto/community-board.dto.ts](../backend/src/modules/community-board/dto/community-board.dto.ts)),
  no `@Roles` restriction beyond the existing `JwtAuthGuard` (decision
  #2 — any authenticated user, acting on their own account only).

**Tests:** extend `community-board.service.spec.ts` —
- A listing authored by a resident with `hidePhoneInListings: true`
  shows `phone: null` to a *different* resident viewing the board.
- The same listing shows the real phone number to the author
  themselves (`getListings` called with the author as the viewer).
- The same listing shows the real phone number to staff
  (`DISPATCHER`/`HOA_ADMIN`) regardless of the flag — proves decision
  #3's "not a staff-facing rule."
- A listing authored by a resident with `hidePhoneInListings: false`
  (or unset/default) shows the real phone to everyone, unchanged from
  today's behavior.
- `getMyListings` always shows the real phone to the author regardless
  of the flag (sanity check that the masking logic wasn't accidentally
  applied there too).
- `updatePhoneVisibility` only ever updates the calling user's own
  `id` — never accepts or acts on a different user id.

---

## Acceptance criteria

- Setting `hidePhoneInListings: true` hides the phone from other
  residents on the general board feed, proven by the cross-resident
  test.
- The author always sees their own phone on their own listings
  (both via `getListings` and `getMyListings`).
- Staff always see the real phone regardless of the setting.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- Hiding the phone from staff — per decision #3, explicitly not what
  this task does.
- A similar visibility toggle for any other module (chat, bookings,
  guest passes) — this task is scoped to community board listings
  only, matching the specific gap identified.
- Mobile UI toggle and web UI toggle — this task is the backend
  mechanism only; a settings-screen entry point can follow separately
  if requested (same staged approach prior beyond-ТЗ tasks have used).

---

## Deliverable

- Single backend commit.
- PR description confirms both the cross-resident-masked test and the
  staff-still-sees-it test explicitly — those are the two properties
  that most distinguish this from a naive "always hide" implementation.

---

## Review addendum (2026-09-14) — accepted, no issues found

Independently verified by reading the full diff and re-running the checks myself:

- `hidePhoneInListings Boolean @default(false)` added to `User` in schema.prisma exactly as spec'd; `prisma generate` runs clean (no reachable Postgres in this environment to `db push` against — same known limitation flagged since Task 0057, left for the user to run separately).
- `getListings` matches decision #3/#4 exactly: masking computed post-fetch via `!isStaff && listing.authorId !== user.id && hidePhoneInListings`, reusing the existing `isStaff` from `assertAccessToTenant`; `phone` set to `null` (not omitted) when masked; the internal `hidePhoneInListings` flag is destructured out of the returned `author` object in every case, not just the masked one.
- `getMyListings`, `createListing`, `updateListing` were correctly left untouched, matching the Context section's scope analysis.
- `updatePhoneVisibility` acts only on `user.id` from the injected `req.user` — no `userId` in the DTO, no BOLA surface, matching decision #2.
- Controller: `PATCH /community-board/my-phone-visibility` has no `@Roles` beyond the class-level `JwtAuthGuard`/`RolesGuard`, correctly open to any authenticated user; doesn't collide with the `listings/:id` or `listings/:id/moderate` routes.
- Tests: 9 new (one more than the 6 spec'd — an extra check that `hidePhoneInListings` itself never leaks into the response — a harmless, useful addition, not a defect). Reran `community-board.service.spec.ts` in isolation (30/30, baseline was 21), the full backend suite (558/558, 31 suites, 0 regressions), and `tsc --noEmit` (clean).

Task accepted, no fixes required.
