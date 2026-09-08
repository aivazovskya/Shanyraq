# Task 0009: Booking of common spaces (бронирование общих пространств)

**Status:** Completed (Ready for Review)
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

[PRODUCT_SPEC.md](PRODUCT_SPEC.md) §3.7 requires: *"Бронирование гостевой
парковки, коворкинга, барбекю-зоны, детской комнаты (если предусмотрены в
ЖК); Календарь занятости."* See [PROGRESS.md](PROGRESS.md) — not started.

This is a per-tenant configurable amenity catalog (not every ЖК has the
same amenities) plus time-slot reservations against it, with double-booking
prevention.

### Architecture decisions already made — do not re-litigate

1. **Auto-confirmed, not a staff-approval workflow.** Unlike ownership
   claims or meter readings (money/legal rights → needs verification),
   reserving a BBQ area or a coworking desk is low-stakes. A booking is
   `CONFIRMED` the moment it's created (after passing validation) — no
   `PENDING` state, no staff approval step. Staff retain the power to
   **cancel** any booking (moderation for misuse/disputes), which is enough
   oversight for something this low-stakes.
2. **Booking access: any verified resident, owner or tenant** — same
   reasoning as Task 0007 (meter readings): using a shared amenity is an
   operational/occupancy matter, not a financial or voting right, so don't
   apply the OWNER-only restriction from the finance module here.
3. **Privacy: residents see availability, not identities.** A resident
   checking a resource's calendar sees which time slots are taken, but not
   *whose* booking it is — mirror the pattern already used in
   [votings.service.ts](../backend/src/modules/votings/votings.service.ts)
   `enrichMeetingWithResults()` (residents see aggregate results, not other
   voters' identities, unless they're staff). Staff see full details
   (who booked what) for moderation.
4. **Double-booking prevention is a range-overlap check done in the
   application, inside a transaction — not a DB-level exclusion
   constraint.** Prisma doesn't support Postgres exclusion constraints
   through its schema/migration tooling without dropping to raw SQL, and
   building that is disproportionate for a first cut of a low-stakes amenity
   feature. Check-then-create inside `prisma.$transaction(...)` narrows the
   race window; it doesn't eliminate a theoretical concurrent double-booking
   under extreme timing. That's an accepted, documented limitation for v1,
   not something to over-engineer away — note it in the PR description
   rather than silently declaring it "fully safe."
5. **No quota system** (e.g. "max 2 bookings per unit per week"). Keep the
   validation rules to: booking is in the future, `start < end`, duration
   within the resource's optional cap, within operating hours if set, and
   no overlap. Anything fancier (per-resident quotas, recurring bookings) is
   a future enhancement, not this task.

---

## Subtask A — Prisma schema

```prisma
enum BookableResourceType {
  GUEST_PARKING
  COWORKING
  BBQ_AREA
  KIDS_ROOM
  OTHER
}

enum BookingStatus {
  CONFIRMED
  CANCELLED
}

model BookableResource {
  id                  String               @id @default(uuid())
  tenantId            String
  name                String               // "Барбекю-зона", "Коворкинг", "Гостевой паркинг №3" — fully staff-defined
  type                BookableResourceType
  description         String?
  operatingHoursStart String?              // "08:00" — simple HH:mm string, no timezone complexity needed (single building, single local time)
  operatingHoursEnd   String?              // "22:00"
  maxDurationMinutes  Int?                 // optional cap per booking; null = no cap
  isActive            Boolean              @default(true)
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt

  tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  bookings Booking[]

  @@map("bookable_resources")
}

model Booking {
  id            String        @id @default(uuid())
  resourceId    String
  unitId        String
  bookedById    String
  startTime     DateTime
  endTime       DateTime
  status        BookingStatus @default(CONFIRMED)
  note          String?
  cancelledById String?
  cancelledAt   DateTime?
  createdAt     DateTime      @default(now())

  resource    BookableResource @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  unit        Unit             @relation(fields: [unitId], references: [id], onDelete: Cascade)
  bookedBy    User             @relation("BookingsMade", fields: [bookedById], references: [id], onDelete: Cascade)
  cancelledBy User?            @relation("BookingsCancelled", fields: [cancelledById], references: [id], onDelete: SetNull)

  @@map("bookings")
}
```

Add back-relations on `Tenant` (`bookableResources`), `Unit` (`bookings`),
`User` (`bookingsMade`, `bookingsCancelled`). `prisma db push`, same as
every prior task.

---

## Subtask B — Backend

New module `backend/src/modules/bookings/`, structured like the `meters`
module from Task 0007 (closest precedent: staff-configured catalog +
resident self-service submissions + staff moderation).

**Resource catalog** (`HOA_ADMIN`, `SUPERADMIN`):
- `GET /bookings/tenants/:tenantId/resources` — list, tenant-scoped.
  Residents can also call this (need to see what's bookable) — no `@Roles`
  restriction on the GET, same "let the service handle resident vs. staff"
  pattern already used for `getUnitMeters` in
  [meters.service.ts](../backend/src/modules/meters/meters.service.ts).
- `POST /bookings/tenants/:tenantId/resources` — create.
- `PATCH /bookings/resources/:id` — edit / deactivate.

**Bookings** (residents: any verified ownership on the unit, owner or
tenant; staff: `HOA_ADMIN`, `DISPATCHER`, `SUPERADMIN` for moderation):
- `GET /bookings/resources/:resourceId/availability?from=&to=` — returns
  busy time ranges for a resource in the given window. For a resident
  caller, strip booker identity (just `{ startTime, endTime }`); for staff,
  include `unitId`/`bookedBy`. Reuse the "two response shapes based on
  caller role" pattern from
  [votings.service.ts](../backend/src/modules/votings/votings.service.ts)
  `enrichMeetingWithResults()`.
- `POST /bookings/resources/:resourceId/bookings`, body
  `{ startTime, endTime, note? }` (authenticated resident with a verified
  ownership — owner or tenant — on some unit in this tenant; the unit used
  is resolved from their ownership, same as
  `MetersService.submitReading()` resolves the acting resident's unit):
  - Reject if `startTime` is in the past, `startTime >= endTime`, duration
    exceeds `resource.maxDurationMinutes` (if set), or falls outside
    `operatingHoursStart`/`End` (if set).
  - Inside a `prisma.$transaction`, check for any existing `CONFIRMED`
    booking on the same resource where
    `existing.startTime < newEnd AND existing.endTime > newStart`
    (standard interval overlap), reject with a clear "слот уже занят" error
    if found, otherwise create.
- `GET /bookings/my-bookings` — the caller's own bookings (past + upcoming),
  resolved the same way as Task 0006's `getMyAccounts()` resolves the
  caller's units, but for **any verified ownership** (owner or tenant),
  not owner-only.
- `GET /bookings/tenants/:tenantId/bookings?resourceId=&from=&to=` (staff
  only) — full moderation view with booker identity, tenant-scoped.
- `PATCH /bookings/:id/cancel` — the booking's own `bookedById` **or** staff
  (`HOA_ADMIN`, `DISPATCHER`, `SUPERADMIN`) of that tenant. Sets `status:
  CANCELLED`, `cancelledById`, `cancelledAt`. A cancelled booking's slot
  becomes available again (the overlap check only looks at `CONFIRMED`
  bookings).

**Tests:** new `bookings.service.spec.ts` covering: overlap rejection
(exact match, partial overlap, adjacent-but-not-overlapping should
succeed), past-start rejection, duration-cap rejection, operating-hours
rejection, owner and tenant can both book, a different unit's resident
can't cancel someone else's booking, staff can cancel any booking in their
tenant, staff from another tenant cannot, availability response strips
identity for residents but not staff.

## Subtask C — Web: resource catalog + bookings moderation

Two pages under `frontend-web/src/app/dashboard/bookings/`, same
conventions as every prior page (`apiRequest`/`getStoredSession`, i18n
`t()` from the start with a new `bookings` namespace in all three locale
files):

- `resources/page.tsx` — CRUD for the amenity catalog (`HOA_ADMIN`/
  `SUPERADMIN`).
- `page.tsx` — moderation view: filterable list of bookings (by resource,
  date range), showing unit/resident/time, with a Cancel action
  (`confirm()` guard, matching the pattern in
  [verifications/page.tsx](../frontend-web/src/app/dashboard/verifications/page.tsx)).
- Add a "Бронирования" nav entry in
  [dashboard/layout.tsx](../frontend-web/src/app/dashboard/layout.tsx).

## Subtask D — Mobile: browse + book + manage own bookings

New screens under `mobile/src/screens/bookings/` (new `bookings` i18n
namespace), reached from a Dashboard quick-link card (same pattern as
finance/meters), **not** a new bottom tab:

- Resource list for the tenant.
- Per-resource view: a simple day-by-day list of taken time slots (not a
  full drag-and-drop calendar widget — don't pull in a new charting/calendar
  dependency for this, a plain list of busy ranges per day is enough) plus
  a start/end time picker to create a booking.
- "Мои бронирования" — upcoming and past, with a Cancel action on upcoming
  ones.

---

## Acceptance criteria

- A verified owner or tenant of a unit can book an available slot on a
  resource in their tenant; a resident with no verified ownership cannot.
- Booking an already-taken slot (exact, or any overlap) is rejected with a
  clear error; booking immediately-adjacent, non-overlapping slots
  succeeds.
- Cancelling a booking frees the slot for a new booking.
- A resident can cancel their own booking; cannot cancel someone else's;
  staff of the same tenant can cancel any booking in their tenant; staff of
  a different tenant cannot see or cancel it.
- The resident-facing availability view never exposes another resident's
  identity; the staff moderation view does.
- Duration-cap and operating-hours validation reject bookings outside the
  configured limits when a resource has them set, and impose no limit when
  unset.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in all three
  apps; full kk/ru/en key parity.

## Explicitly out of scope

- Per-resident booking quotas or recurring bookings — future enhancement.
- A true DB-level exclusion constraint against overlapping ranges — see
  architecture decision #4.
- Payment/deposit for bookings — not asked for in the ТЗ, and would depend
  on the still-unresolved monetization model (see
  [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §8, question №1) — don't fold it in.

## Deliverable

- Subtask A+B (backend) can ship separately from C/D (frontend), same as
  prior multi-platform tasks.
- PR description should confirm: booking access is owner+tenant (not
  owner-only), auto-confirm with no approval step, and the accepted
  race-condition limitation on the overlap check (decision #4) is noted,
  not silently glossed over.

---

## Review addendum (2026-09-08) — cross-tenant leak on the read-only browse endpoints

**Verified good:** the actually consequential paths are correctly isolated
— `createBooking()` requires a verified ownership specifically in the
*resource's* tenant (so a resident can't book another tenant's amenity even
by guessing a `resourceId`), and `cancelBooking()` correctly scopes staff
access to `booking.resource.tenantId`. Overlap prevention (exact/partial/
adjacent), duration cap, operating hours, and past-time rejection are all
correct and tested. 156/156 backend tests pass.

**Found:** the three **read-only catalog/availability** endpoints skip
tenant isolation entirely for residents:

- [bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts)
  `getResources(tenantId, user)` — `isStaffUser()` checks
  `user.tenantId === tenantId` for staff roles, but a **resident** caller
  falls through with no equivalent check at all. Any authenticated resident
  can pass any tenant's ID and get that tenant's full active resource
  catalog (names, types, descriptions, operating hours).
- `getResourceById(id, user)` — no tenant check whatsoever, for anyone.
- `getAvailability(resourceId, ...)` — same gap: a resident from a
  different tenant gets the anonymized `{startTime, endTime}` view (so no
  PII leaks), but still sees another tenant's private occupancy schedule,
  which they have no legitimate reason to see at all.

This breaks the tenant-isolation invariant every other module in this
codebase enforces rigorously (properties, finance, meters,
access-control — all BOLA-tested explicitly). The closest existing
precedent for "resident access to shared, not per-unit, infrastructure" is
`getCameraStream()` in
[access-control.service.ts](../backend/src/modules/access-control/access-control.service.ts):
a resident must hold **some** verified ownership within that access
point's tenant before they can see anything about it — cameras aren't
tied to one unit either, same shape as a shared bookable resource.

**Required fix:** apply the same check to all three methods — a resident
caller must have a verified `UnitOwnership` (any type) in the resource's/
tenant's buildings before the catalog, resource detail, or availability is
returned; otherwise `ForbiddenException`, mirroring `getCameraStream()`'s
resident branch exactly. Staff keep the existing `isStaffUser()` tenant
check; `SUPERADMIN` stays unrestricted.

**Test to add:** a resident with a verified ownership in tenant A gets
`ForbiddenException` (or an empty/blocked result — pick the same shape
`getCameraStream()` uses) when calling `getResources`/`getResourceById`/
`getAvailability` for tenant B's resource.

**Optional, not blocking (same class of thing as Task 0008's aliases):**
the controller has both `tenant/:tenantId/...` and `tenants/:tenantId/...`
route pairs for resources and bookings — four routes doing two things
again. Feel free to drop the extra aliases while touching this file, but
not worth a re-review cycle on its own.
