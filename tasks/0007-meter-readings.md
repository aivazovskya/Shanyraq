# Task 0007: Meter readings (показания счётчиков) + consumption-based billing

**Status:** Ready for implementation
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)
**Depends on:** [0006-finance-personal-account.md](0006-finance-personal-account.md)
(extends `TariffItem`/`generateCharges` — read that task first, this one
assumes it's merged).

## Context

[PRODUCT_SPEC.md](PRODUCT_SPEC.md) §3.5 requires: *"Подача показаний
счётчиков (вода, электричество) с фото-подтверждением"*. See
[PROGRESS.md](PROGRESS.md) — not started.

**Don't build this as an inert, disconnected feature.** A resident
submitting a number that nobody ever uses is half a feature. Real utility
billing in practice is consumption-based (rate × metered usage), and Task
0006 already built a tariff/charge engine with `FLAT` and `PER_AREA`
calculation methods — this task adds the missing third method,
`PER_CONSUMPTION`, and wires meter readings into `generateCharges()` so
submitting a reading actually produces a charge. Building submission
without the billing connection, or billing without submission, would each
leave the other half meaningless.

### Scope boundary with Task 0006

This task **extends** the finance module rather than duplicating it:
`TariffItem` gets a new calculation method and an optional linked
`MeterType`; `FinanceService.generateCharges()` gets a new branch. It does
**not** touch `TariffItem`/`Charge`/`Payment`/`PersonalAccount` structurally
beyond that addition — everything else from Task 0006 (manual payments, no
online gateway, role split) stays as-is.

### Role access — different from Task 0006's finance split, on purpose

Meter reading submission and review are an **operational/service-desk
concern**, not a financial-control concern — treat them like service
requests, not like tariffs/payments:

- **Submission**: any resident with a **verified ownership of any type**
  on the unit — `RESIDENT_OWNER` *and* `RESIDENT_TENANT`, both allowed.
  This is a deliberate departure from Task 0006's OWNER-only finance access:
  whoever actually lives in the unit is the one reading the meter, and the
  ТЗ's owner-only restriction is specifically about voting rights and
  financial visibility, not about who can report a meter number. Mirror the
  ownership check style used in
  [service-requests.service.ts](../backend/src/modules/service-requests/service-requests.service.ts),
  not the OWNER-only check in `finance.service.ts`.
- **Review/verification** (approve or reject a submitted reading before
  it's usable for billing): `DISPATCHER`, `HOA_ADMIN`, `SUPERADMIN` — same
  role set as service-request status management, not the finance write
  role set. `HOA_CHAIRMAN` gets read access only, same transparency
  reasoning as the finance module.
- **Meter registration** (creating a `Meter` record for a unit — a
  property-setup action): `HOA_ADMIN`, `SUPERADMIN` only, matching how
  `addUnit()` is scoped in `properties.controller.ts`.

### Why readings need staff verification before billing

Residents self-report a number with a photo. Money follows from it. Mirror
the existing `UnitOwnership.isVerified` pattern (self-claim → staff
approval before it grants anything) rather than trusting submissions
outright: a reading starts `PENDING` and only counts toward
`generateCharges()` once a staff member marks it `VERIFIED`. Give staff a
`REJECTED` outcome too (e.g. "фото нечитаемо, повторите"), so a bad
submission doesn't just sit stuck forever — the resident should be able to
tell it was rejected and resubmit for the same still-open period.

---

## Subtask A — Prisma schema

Add to [schema.prisma](../backend/prisma/schema.prisma):

```prisma
enum MeterType {
  COLD_WATER
  HOT_WATER
  ELECTRICITY
  OTHER
}

enum ReadingStatus {
  PENDING
  VERIFIED
  REJECTED
}

model Meter {
  id           String    @id @default(uuid())
  unitId       String
  type         MeterType
  serialNumber String?
  initialValue Float     @default(0)  // baseline for the first reading's consumption calc
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())

  unit         Unit           @relation(fields: [unitId], references: [id], onDelete: Cascade)
  readings     MeterReading[]

  @@map("meters")
}

model MeterReading {
  id            String        @id @default(uuid())
  meterId       String
  submittedById String
  value         Float         // cumulative reading, not a delta
  photoUrl      String        // required — ТЗ calls for photo confirmation
  periodMonth   Int
  periodYear    Int
  status        ReadingStatus @default(PENDING)
  reviewedById  String?
  reviewNote    String?
  createdAt     DateTime      @default(now())

  meter         Meter  @relation(fields: [meterId], references: [id], onDelete: Cascade)
  submittedBy   User   @relation("SubmittedReadings", fields: [submittedById], references: [id], onDelete: Cascade)
  reviewedBy    User?  @relation("ReviewedReadings", fields: [reviewedById], references: [id], onDelete: SetNull)

  @@unique([meterId, periodMonth, periodYear])
  @@map("meter_readings")
}
```

And extend the existing `ChargeCalculationMethod` enum (from Task 0006)
with `PER_CONSUMPTION`, plus an optional `meterType` field on `TariffItem`:

```prisma
enum ChargeCalculationMethod {
  FLAT
  PER_AREA
  PER_CONSUMPTION   // new
}

// on TariffItem, add:
meterType  MeterType?   // required (validate in DTO) when calculationMethod = PER_CONSUMPTION
```

Add back-relations on `Unit` (`meters`) and `User` (`submittedReadings`,
`reviewedReadings`) per existing conventions. `prisma db push`, same as
every prior task.

---

## Subtask B — Backend: meters, readings, billing integration

New module `backend/src/modules/meters/` (service + controller + DTOs),
structured like the `finance` module from Task 0006.

**Meter management** (`HOA_ADMIN`, `SUPERADMIN`):
- `GET /meters/units/:unitId` — list a unit's meters. Tenant-scoped via the
  unit's building.
- `POST /meters/units/:unitId` — register a meter (`type`, optional
  `serialNumber`, `initialValue`).
- `PATCH /meters/:id` — edit (e.g. deactivate a decommissioned meter).

**Reading submission** (`RESIDENT_OWNER`, `RESIDENT_TENANT` with any
verified ownership on the meter's unit):
- `POST /meters/:meterId/readings`, body
  `{ value: number, photoUrl: string, month: number, year: number }`.
  - Reject if `value` is less than the last **verified** reading's value
    (or `meter.initialValue` if none exists yet) — meters are cumulative
    and can't decrease; a lower number means either a meter replacement
    (out of scope — handle manually via support for now) or a data-entry
    error, either way don't silently accept it.
  - Reject if a reading already exists for this meter+period **and isn't
    `REJECTED`** (rely on the unique constraint for the DB-level guarantee,
    but give a friendlier error than a raw constraint violation) — allow a
    resubmission only when the existing one was rejected (update it back to
    `PENDING` with the new value/photo rather than erroring, since the
    unique constraint would otherwise block a legitimate resubmission for
    the same period).
- `GET /meters/:meterId/readings` — history for a meter, same access rule
  as submission (resident of that unit) plus staff roles below.

**Reading review** (`DISPATCHER`, `HOA_ADMIN`, `SUPERADMIN` write;
`HOA_CHAIRMAN` read):
- `GET /meters/tenants/:tenantId/readings?status=PENDING` — review queue,
  tenant-scoped (`assertUserBelongsToTenant`), optional status filter.
- `PATCH /meters/readings/:id/review`, body
  `{ status: 'VERIFIED' | 'REJECTED', note?: string }` — sets
  `reviewedById` = acting staff user. Tenant-scoped via the reading's
  meter → unit → building chain.

**Billing integration** — modify `FinanceService.generateCharges()` (Task
0006) to handle `PER_CONSUMPTION` tariffs:
- For each unit, find its active `Meter` matching `tariffItem.meterType`.
  If the unit has no such meter, skip that specific charge (count as
  skipped, don't fail the batch — not every unit necessarily has every
  meter type).
- Find the `VERIFIED` `MeterReading` for that meter for the target
  month/year. If none exists, skip (count separately from the
  already-exists skip reason, so staff can tell "no reading submitted yet"
  apart from "already charged").
- `consumption = reading.value - previousValue`, where `previousValue` is
  the most recent **verified** reading strictly before this period, or
  `meter.initialValue` if this is the first-ever verified reading for that
  meter.
- `amount = tariff.rate * consumption`.
- Everything else (duplicate-charge skip, balance recomputation call)
  stays exactly as Task 0006 built it.

**Tests:** new `meters.service.spec.ts` covering: value-must-not-decrease
validation, resubmission after rejection, tenant isolation on registration/
review, resident-of-that-unit-only access (both OWNER and TENANT allowed,
a different unit's resident rejected), staff role checks (chairman
read-only, dispatcher can review). Extend `finance.service.spec.ts` for the
`PER_CONSUMPTION` branch: correct consumption-delta calculation, first
reading uses `meter.initialValue` as baseline, missing meter and missing
verified reading each skip gracefully without failing the batch.

---

## Subtask C — Web: readings review page

New page `frontend-web/src/app/dashboard/meters/page.tsx`, same
conventions as every prior web page in this codebase (`apiRequest`/
`getStoredSession`, table + modal pattern, i18n `t()` from the start —
add a `meters` namespace to all three locale files).

- Queue of pending readings (unit, meter type, submitted value, photo
  thumbnail/link, submitted-by, date) with Verify/Reject actions
  (`confirm()` guard on reject, matching `handleReject` in
  [verifications/page.tsx](../frontend-web/src/app/dashboard/verifications/page.tsx)).
- A way to view a meter's full reading history (verified/rejected/pending)
  per unit — reuse whatever modal/drawer pattern
  [residents/page.tsx](../frontend-web/src/app/dashboard/residents/page.tsx)
  already established.
- Add a "Показания счётчиков" nav entry in
  [dashboard/layout.tsx](../frontend-web/src/app/dashboard/layout.tsx),
  visible to the review-capable roles.
- Extend the existing tariffs page from Task 0006
  ([finance/tariffs/page.tsx](../frontend-web/src/app/dashboard/finance/tariffs/page.tsx))
  so creating/editing a tariff with `calculationMethod: PER_CONSUMPTION`
  also lets staff pick a `meterType` — the form needs that field
  conditionally, matching whatever pattern the existing FLAT/PER_AREA rate
  input already uses for conditional fields.

## Subtask D — Mobile: submit + view readings

New screen `mobile/src/screens/meters/MetersScreen.tsx` (new `meters` i18n
namespace), reached from the existing
[finance/AccountScreen.tsx](../mobile/src/screens/finance/AccountScreen.tsx)
(a natural place — consumption charges show up there) or a Dashboard
quick-link card, whichever reads more naturally once you see both screens
side by side. **Not** a new bottom tab.

- Lists the resident's unit's meters with each one's last reading
  (value, period, status) and a "Подать показания" action.
- Submission form: numeric value input, required photo (reuse whatever
  photo-picker pattern
  [CreateRequestScreen.tsx](../mobile/src/screens/requests/CreateRequestScreen.tsx)
  already uses for attaching photos to a service request — don't invent a
  new upload flow, this is the same `/uploads` endpoint), month/year
  (default to current period).
- Shows submission status (pending/verified/rejected) with the staff note
  if rejected, and lets the resident resubmit for a rejected reading.
- Empty state (no meters registered for the unit yet) rather than an error.

---

## Acceptance criteria

- A resident (owner or tenant, verified) can submit a reading with a photo
  for their unit's meter; a resident of a different unit cannot.
- Submitting a lower value than the last verified reading is rejected with
  a clear error.
- Staff (dispatcher/admin/superadmin) can verify or reject a pending
  reading; chairman can view the queue but not act on it; a different
  tenant's staff cannot see or act on it.
- A rejected reading can be resubmitted for the same period without
  hitting the unique-constraint error.
- Running `generateCharges()` for a period with a `PER_CONSUMPTION` tariff
  correctly charges `rate × (verified reading − previous verified reading
  or meter.initialValue)`, skips units with no matching meter or no
  verified reading for that period (without failing the whole batch), and
  never double-charges on a re-run (same guarantee as Task 0006).
- Web and mobile both ship with full kk/ru/en keys from the start — no new
  i18n backlog.
- `npm test` passes in `backend/` (including the extended
  `finance.service.spec.ts`); `npx tsc --noEmit` clean in `backend/`,
  `mobile/`, and `frontend-web/`.

## Deliverable

- Subtask A+B (backend) can ship separately from C/D (frontend), same as
  prior multi-platform tasks.
- PR description should confirm: role split matches the operational
  (service-desk-style) roles specified above, not Task 0006's stricter
  finance roles; both `RESIDENT_OWNER` and `RESIDENT_TENANT` can submit
  readings; the value-must-not-decrease and resubmit-after-rejection
  behaviors were tested explicitly.

---

## Review addendum (2026-09-08) — one leftover unit-of-measure string

**Verified good:** schema, RBAC (owner+tenant submission, operational
review roles distinct from Task 0006's finance roles, chairman read-only),
value-must-not-decrease and resubmit-after-rejection both correctly
implemented and tested, `PER_CONSUMPTION` billing integration (delta calc,
`initialValue` baseline for first reading, graceful skip on missing
meter/reading) fully covered by tests, no new bottom tab added, 130/130
backend tests pass, `tsc --noEmit` clean in all three apps, full kk/ru/en
key parity (367 mobile / 399 web).

**Found:** [MetersScreen.tsx:315](../mobile/src/screens/meters/MetersScreen.tsx#L315)
— `` meter.type === 'ELECTRICITY' ? 'кВт⋅ч' : 'м³' `` is hardcoded rather
than run through `t()`. Unlike a proper noun or sample data, a unit-of-measure
abbreviation genuinely differs by language convention (English typically
writes "kWh", not "кВт⋅ч") — this is the same class of finding as the
`common.iin`/`common.block` fixes from Task 0005's addenda: a short label
that looks like it could be left as-is, but actually needs a locale-specific
value. Add `meters.unitElectricity`/`meters.unitWater` (or similar) keys to
all three locale files and use them here.

**Required fix:** that one line. Nothing else needs re-checking.
