# Task 0011: Residents' community board (доска объявлений жильцов)

**Status:** Completed (Ready for Review)
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

[PRODUCT_SPEC.md](PRODUCT_SPEC.md) §3.6 requires: *"Доска объявлений жильцов
(продать/сдать/отдать) — опционально для MVP+1"*, and §4.7 explicitly lists
*"Модерация доски объявлений"* as a web-panel requirement. See
[PROGRESS.md](PROGRESS.md).

**This is a different feature from the existing `Announcement` model** —
don't confuse the two or try to merge them. `Announcement` (built already,
see [announcements.service.ts](../backend/src/modules/announcements/announcements.service.ts))
is УК-authored news/alerts pushed to residents (one-directional, staff →
everyone). This task is a **peer-to-peer classifieds board** — residents
posting to other residents ("продаю диван", "сдам парковку", "отдам
книги"), with staff moderation power but not staff authorship. Separate
Prisma model, separate module, separate web/mobile screens.

### Architecture decisions already made — do not re-litigate

1. **Posting requires verified ownership (owner or tenant), viewing does
   too.** Unlike SOS (deliberately ungated) or meter readings/bookings
   (posting ungated on verification, only ownership type), a public-facing
   marketplace has real spam/scam risk, so require the same bar for both
   reading and posting: a verified `UnitOwnership` (any type) somewhere in
   the tenant. Mirror the `assertAccessToTenant`-style helper already
   built in
   [bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts)
   (staff: `tenantId` match; residents: verified ownership check; SUPERADMIN:
   unrestricted) — same shape, don't invent a new pattern.
2. **No in-app chat/messaging between residents.** Contact happens via the
   listing author's phone number (already known — pull it from the
   `author` relation), off-platform, the same way a physical corkboard
   works. Resident-to-resident chat is a distinct, much larger feature
   (and explicitly a separate future Phase 3 item — "чат с диспетчером" —
   which is staff-facing, not peer-to-peer, and isn't this task either).
   Don't build any messaging here.
3. **No formal "report/flag" workflow.** Staff moderate by browsing the
   full listing feed directly (see Subtask C) and removing what violates
   the rules. A resident-facing "report this listing" button is a
   reasonable future enhancement, not required for v1 — don't add it now.
4. **No auto-expiry.** There's no scheduled-job/cron infrastructure in this
   codebase to expire old listings automatically, and building one just for
   this would be disproportionate. The author manually marks their own
   listing `CLOSED` when it's sold/given away/no longer relevant. Staff
   moderation (`REMOVED`) handles anything that shouldn't be up regardless
   of age.
5. **Soft removal, not deletion.** A moderated-away listing is marked
   `REMOVED` with a reason, kept for audit — same convention as
   `TariffItem.isActive`, `MeterReading` rejection, etc. throughout this
   codebase. Never hard-delete a listing.

---

## Subtask A — Prisma schema

```prisma
enum ListingType {
  SELL
  RENT
  GIVE_AWAY
  OTHER
}

enum ListingStatus {
  ACTIVE
  CLOSED    // author marked resolved (sold / given away / no longer needed)
  REMOVED   // moderator took it down
}

model CommunityListing {
  id            String        @id @default(uuid())
  tenantId      String
  authorId      String
  type          ListingType
  title         String
  description   String
  price         Float?        // null for GIVE_AWAY or a non-priced OTHER post
  photoUrls     String[]      @default([])
  status        ListingStatus @default(ACTIVE)
  removedById   String?
  removedReason String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  tenant    Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  author    User   @relation("ListingsAuthored", fields: [authorId], references: [id], onDelete: Cascade)
  removedBy User?  @relation("ListingsRemoved", fields: [removedById], references: [id], onDelete: SetNull)

  @@map("community_listings")
}
```

Add back-relations on `Tenant` (`communityListings`), `User`
(`listingsAuthored`, `listingsRemoved`). `prisma db push`, same convention
as every prior task.

---

## Subtask B — Backend

New module `backend/src/modules/community-board/`.

**Access helper:** copy the exact shape of `assertAccessToTenant()` from
[bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts)
— don't reinvent it, don't subtly diverge from it (that inconsistency is
exactly what Task 0009's review caught the first time around).

**Endpoints:**
- `GET /community-board/tenants/:tenantId/listings?type=&status=` —
  tenant-scoped via the access helper. Non-staff callers only ever see
  `ACTIVE` listings regardless of the `status` filter they pass (don't let
  a resident query for `REMOVED` posts); staff can filter across all
  statuses for moderation.
- `POST /community-board/tenants/:tenantId/listings` — requires the
  resident branch of the access helper to pass (i.e. verified ownership,
  not just "any authenticated user"). Validate `price` is only accepted
  for `SELL`/`RENT` (reject or silently ignore `price` on `GIVE_AWAY` —
  your call, just be consistent and validated, not silently wrong data).
- `PATCH /community-board/listings/:id` — author only (edit fields, or set
  `status: CLOSED`). Reject if the caller isn't `authorId`.
- `PATCH /community-board/listings/:id/moderate`, body
  `{ reason: string }` — `DISPATCHER`, `HOA_ADMIN`, `SUPERADMIN` only, sets
  `status: REMOVED`, `removedById`, `removedReason`. Tenant-scoped via the
  listing's own `tenantId`. Reject if already `REMOVED`.
- `GET /community-board/my-listings` — the caller's own posts, any status.

**Tests:** new `community-board.service.spec.ts` covering: verified
resident (owner or tenant) can post, unverified resident cannot, a
different tenant's resident can't view or post, non-staff `status` filter
is ignored/forced to `ACTIVE`, author can edit/close their own listing,
a different resident cannot edit someone else's, staff can moderate any
listing in their tenant, staff from another tenant cannot, can't moderate
an already-removed listing twice.

## Subtask C — Web: moderation view

New page `frontend-web/src/app/dashboard/community-board/page.tsx`
(`DISPATCHER`, `HOA_ADMIN`, `SUPERADMIN`), same conventions as every prior
page (`apiRequest`/`getStoredSession`, i18n `t()` from the start, new
`communityBoard` namespace in all three locale files):

- Full feed (all statuses, filterable by type/status), author identity and
  phone visible, a Remove action with a required reason
  (`confirm()`/prompt pattern matching `handleReject` in
  [verifications/page.tsx](../frontend-web/src/app/dashboard/verifications/page.tsx)).
- Add a "Доска объявлений" nav entry in
  [dashboard/layout.tsx](../frontend-web/src/app/dashboard/layout.tsx),
  visible to the moderation roles.

## Subtask D — Mobile: browse, post, manage own listings

New screens under `mobile/src/screens/community-board/` (new
`communityBoard` i18n namespace), reached from a Dashboard quick-link card
(same pattern as finance/meters/bookings), **not** a new bottom tab:

- Feed of `ACTIVE` listings, filterable by type (Продать/Сдать/Отдать),
  showing photo(s), title, price (if set), author name + phone (tap to
  call, standard `Linking.openURL('tel:...')` — no in-app messaging, see
  decision #2).
- Create-listing form: type, title, description, price (shown/hidden based
  on type), photos — reuse the same upload flow already established for
  service-request attachments
  ([CreateRequestScreen.tsx](../mobile/src/screens/requests/CreateRequestScreen.tsx))
  and meter-reading photos, don't build a new upload mechanism.
- "Мои объявления" — the author's own posts (any status) with Edit/Close
  actions.

---

## Acceptance criteria

- A verified resident (owner or tenant) can post, edit, and close their own
  listing; an unverified resident cannot post; a resident of a different
  tenant cannot view or post to this tenant's board.
- Non-staff callers never see `REMOVED` listings, regardless of query
  params.
- Staff (`DISPATCHER`/`HOA_ADMIN`/`SUPERADMIN`) can remove any listing in
  their own tenant with a reason; cannot touch another tenant's; cannot
  remove the same listing twice.
- Web and mobile both ship with full kk/ru/en keys from the start.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in all three
  apps; full kk/ru/en key parity.

## Explicitly out of scope

- Resident-to-resident or resident-to-staff chat — see decision #2.
- Report/flag workflow — see decision #3.
- Auto-expiry / scheduled cleanup — see decision #4.
- Payment/escrow for sales — this is a classifieds board, not a
  marketplace with in-app transactions; buyers and sellers settle
  off-platform, same as any physical bulletin board.

## Deliverable

- Subtask A+B (backend) can ship separately from C/D (frontend), same as
  prior multi-platform tasks.
- PR description should confirm: the access-control helper matches
  Task 0009's `assertAccessToTenant()` shape exactly (don't diverge), and
  non-staff callers cannot retrieve `REMOVED` listings under any query
  parameters.

---

## Review addendum (2026-09-08) — the exact same hardcoded-tenant bug as Task 0010

**Verified good:** backend is excellent — the access helper is a faithful
copy of Task 0009's, `createListing` correctly closes a gap the shared
helper alone wouldn't (a staff member who isn't `SUPERADMIN` still needs
their own verified ownership to post, since `assertAccessToTenant`'s staff
branch only checks `tenantId`, not ownership), price validation is
consistent on both create and update, an author can't self-assign
`REMOVED` to dodge the moderation-with-reason flow, double-moderation is
blocked. 196/196 backend tests, `tsc --noEmit` clean, mobile fully i18n
clean, full kk/ru/en parity (464 mobile / 556 web).

**Found — a repeat of the exact bug fixed in
[Task 0010](0010-sos-button.md)'s review:**
[frontend-web/src/app/dashboard/community-board/page.tsx:116](../frontend-web/src/app/dashboard/community-board/page.tsx#L116)
— `` const targetTenantId = effectiveTenantId || 'tenant-1'; ``. This one is
narrower in blast radius than the SOS instance (a guard clause above it
already stops non-`SUPERADMIN` staff with a missing `tenantId` from
reaching this line), but it still means: a `SUPERADMIN` viewing this
moderation page — a real, exercised code path, `SUPERADMIN` has no single
`tenantId` by design — silently loads and moderates `tenant-1`'s listings
specifically, a hardcoded demo tenant, rather than being shown a tenant
selector or an appropriate empty/cross-tenant state. Same root cause as
before: a hardcoded fallback to seed data that shouldn't ship.

**Required fix:** remove the `'tenant-1'` fallback. For the `SUPERADMIN`
case specifically (no single tenant), show a clear state asking them to
pick a tenant (a simple dropdown of tenants via the existing
`GET /properties/tenants` endpoint is enough — don't build a new tenant-
picker component if a plain `<select>` does the job) rather than silently
guessing one.

**Please also do this once, given this is the second occurrence:** grep
this codebase's own recent work for any other `'tenant-1'` (or similar
hardcoded demo-id) fallbacks before resubmitting — a targeted self-check
now is cheaper than finding the third occurrence in the next task's review.
