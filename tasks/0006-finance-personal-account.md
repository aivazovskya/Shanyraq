# Task 0006: Finance module — personal account (лицевой счёт) per unit

**Status:** Completed (Ready for Review)
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

[PRODUCT_SPEC.md](PRODUCT_SPEC.md) §3.5 (mobile) and §4.3 (web) describe the
Phase 2 "Финансы" module: charges/начисления, payment history, online
payment, and (§4.3) "Финансовые отчёты для собственников (обязательное
требование прозрачности для ОСИ)". See [PROGRESS.md](PROGRESS.md) — nothing
exists yet, no data model, no module.

**Scope framing — read carefully, this determines what NOT to build:**

Open question №1 (monetization) is only partially resolved: the direction is
a per-unit personal account ("лицевой счёт") for Shanyraq's own fee, billed
like intercom/elevator line items — but the actual tariff/pricing is still
being negotiated with each УК/ОСИ (see [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §8).

**This task builds the generic, tenant-configurable "лицевой счёт" feature
that ТЗ §3.5/§4.3 already unambiguously calls for — utility charges,
intercom, elevator, and any other itemized line the УК wants to bill through
the app.** It does **not** attempt to model or hardcode Shanyraq's own
platform fee, its pricing, or any special protection rules around it — that
depends on business terms that aren't settled yet. The schema is generic
enough (`TariffItem` is a tenant-configurable list) that once those terms
are locked in, Shanyraq's own fee slots in as just one more `TariffItem` —
no schema change needed then. Don't speculatively add a `PLATFORM_FEE`
category, admin-lock, or anything Shanyraq-specific now.

**Also explicitly out of scope for this task** (separate future work):
- **Online payment gateway integration (Kaspi Pay/Halyk).** No merchant
  credentials or sandbox access exist yet — same situation as the barrier/
  domofon hardware integrations. Follow the same pattern already
  established for that problem: define an adapter interface and ship a
  manual/mock implementation now, real gateway integration later. See
  Architecture decision below.
- **Meter readings (показания счётчиков).** Related Phase 2 item, tracked
  separately in [PROGRESS.md](PROGRESS.md) — don't fold it into this task.
- **Payment reconciliation exports for accounting software (1C etc.)** —
  not asked for yet.

### Architecture decision — payment recording

Mirror the existing `IBarrierAdapter`/`MockBarrierAdapter` pattern in
[access-control.service.ts](../backend/src/modules/access-control/access-control.service.ts):
payments in this task are **manually recorded by staff** (cash, bank
transfer, whatever happened outside the app) — there is no "Pay now" button
anywhere in this task. Do not add a disabled/"coming soon" pay button either
— per the no-half-finished-features principle, ship what actually works
(read-only balance/history for residents, manual recording for staff) and
leave the online-payment UI for the task that actually wires up a gateway.

### Role access — follow the ТЗ's own role table precisely

Per [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §2/§6: *"Администратор УК — Полный
доступ: финансы..."* and *"Арендатор — ...без финансового модуля (если не
делегировано собственником)"* (delegation isn't implemented anywhere in this
codebase, so treat it as: tenants get no access at all, full stop, for now).
§4.3 also requires financial transparency for ОСИ, so the chairman needs at
least read access.

- **Write access** (manage tariffs, generate monthly charges, record
  payments): `HOA_ADMIN`, `SUPERADMIN`.
- **Read access** (view any account/charges/payments in their tenant):
  additionally `HOA_CHAIRMAN` (transparency requirement).
- **`DISPATCHER`**: no access to this module at all (not in the ТЗ's finance
  role list).
- **Residents**: read-only, **own account(s) only**, and only for ownerships
  with `ownershipType: OWNER` and `isVerified: true` — mirror the exact
  ownership-type check already used in
  [votings.service.ts](../backend/src/modules/votings/votings.service.ts)
  `castVote()`. `RESIDENT_TENANT` gets nothing from this module, per the ТЗ
  quote above.

---

## Subtask A — Prisma schema

Add to [schema.prisma](../backend/prisma/schema.prisma):

```prisma
enum ChargeCalculationMethod {
  FLAT       // fixed amount per unit, regardless of area
  PER_AREA   // rate × unit.area
}

enum PaymentMethod {
  MANUAL     // recorded by staff — cash, bank transfer, anything off-platform
}

model TariffItem {
  id                String                   @id @default(uuid())
  tenantId          String
  name              String                   // "Коммунальные услуги", "Домофон", "Лифт", etc. — fully staff-defined
  calculationMethod ChargeCalculationMethod  @default(FLAT)
  rate              Float                    // flat amount, or per-m² rate depending on calculationMethod
  isActive          Boolean                  @default(true)
  createdAt         DateTime                 @default(now())
  updatedAt         DateTime                 @updatedAt

  tenant            Tenant                   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  charges           Charge[]

  @@map("tariff_items")
}

model PersonalAccount {
  id             String    @id @default(uuid())
  unitId         String    @unique
  accountNumber  String    @unique   // human-readable, e.g. derived from building+unit — generate on create
  balance        Float     @default(0)  // positive = credit, negative = debt; always recomputed, never trust a manual write
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  unit           Unit      @relation(fields: [unitId], references: [id], onDelete: Cascade)
  charges        Charge[]
  payments       Payment[]

  @@map("personal_accounts")
}

model Charge {
  id            String    @id @default(uuid())
  accountId     String
  tariffItemId  String
  periodMonth   Int       // 1-12
  periodYear    Int
  amount        Float
  createdAt     DateTime  @default(now())

  account       PersonalAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  tariffItem    TariffItem      @relation(fields: [tariffItemId], references: [id], onDelete: Restrict)

  @@unique([accountId, tariffItemId, periodMonth, periodYear])
  @@map("charges")
}

model Payment {
  id             String        @id @default(uuid())
  accountId      String
  amount         Float
  method         PaymentMethod @default(MANUAL)
  recordedById   String        // staff member who recorded it — always required, this task has no unattended payment source
  note           String?
  paidAt         DateTime      @default(now())
  createdAt      DateTime      @default(now())

  account        PersonalAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  recordedBy     User            @relation(fields: [recordedById], references: [id], onDelete: Restrict)

  @@map("payments")
}
```

Add the corresponding back-relations (`tariffItems`, `personalAccount`,
`charges`/`payments` as needed) on `Tenant`, `Unit`, and `User` per existing
schema conventions. Use `prisma db push` (repo convention, confirmed in
prior tasks — no `prisma migrate` history exists here).

**`PersonalAccount` creation:** auto-create one when a `Unit` is created
(in `PropertiesService.addUnit()`), so every unit has exactly one account
from day one — no lazy/on-demand creation path to keep track of. Generate
`accountNumber` deterministically (e.g. `{buildingBlockName}-{unitNumber}`
sanitized, or a simple incrementing scheme — your call, just make it
human-readable and stable).

---

## Subtask B — Backend: tariffs, charge generation, payments, resident read API

New module `backend/src/modules/finance/` (service + controller + DTOs),
following the exact structural conventions of the existing modules (e.g.
[properties](../backend/src/modules/properties/), which already has the
closest-matching mix of staff-write/tenant-scoped/resident-facing patterns
to copy from).

**Tariff management** (`HOA_ADMIN`, `SUPERADMIN` only):
- `GET /finance/tenants/:tenantId/tariffs` — list, tenant-scoped
  (`assertUserBelongsToTenant`, same as `properties.controller.ts`).
- `POST /finance/tenants/:tenantId/tariffs` — create.
- `PATCH /finance/tariffs/:id` — update (validate the tariff belongs to the
  acting staff member's tenant before allowing the edit).
- `DELETE /finance/tariffs/:id` (or just set `isActive: false` — prefer
  soft-delete since `Charge.tariffItemId` has `onDelete: Restrict`, so a
  tariff with historical charges literally can't be hard-deleted anyway;
  make the "delete" action in the API just flip `isActive`).

**Charge generation** (`HOA_ADMIN`, `SUPERADMIN` only):
- `POST /finance/tenants/:tenantId/generate-charges`, body
  `{ month: number, year: number }` — for every active `TariffItem` in the
  tenant and every `Unit` in the tenant's buildings, create one `Charge`
  (amount = `rate` if `FLAT`, or `rate * unit.area` if `PER_AREA`), skipping
  any that already exist for that unit+tariff+period (rely on the unique
  constraint — catch the conflict and skip rather than erroring the whole
  batch). After creating charges, recompute `balance` on every affected
  `PersonalAccount` (see balance recomputation note below). Return a summary
  (counts created/skipped).

**Payments** (`HOA_ADMIN`, `SUPERADMIN` write; `HOA_CHAIRMAN` read-only):
- `POST /finance/accounts/:accountId/payments`, body
  `{ amount: number, note?: string }` — records a manual payment,
  `recordedById` = acting staff user, tenant-scoped (verify the account's
  unit belongs to staff's tenant). Recompute balance after.
- `GET /finance/accounts/:accountId` — account detail: balance, charges
  history, payment history. Tenant-scoped for staff (any role in the read
  list above); for residents, additionally require they hold a verified
  `OWNER` ownership on that specific unit (mirror the vote-eligibility check
  pattern from `votings.service.ts`).
- `GET /finance/tenants/:tenantId/accounts` — list all accounts in a tenant
  with current balances (for the staff overview page), tenant-scoped, staff
  roles from the read list only.

**Resident-facing:**
- `GET /finance/my-accounts` (authenticated) — resolves the caller's
  verified `OWNER` ownerships and returns each linked `PersonalAccount`
  (balance + recent charges + recent payments). Empty list if they have no
  verified ownerships or are a `RESIDENT_TENANT` — don't error, just return
  nothing (consistent with how other resident-facing list endpoints behave
  when there's nothing to show).

**Balance recomputation:** don't trust incremental `+=`/`-=` writes scattered
across multiple call sites (charge generation, payment recording) to stay
correct forever — that's exactly the kind of thing that drifts. Instead,
follow the pattern already used for `Meeting.calculatedQuorumPercent` in
[votings.service.ts](../backend/src/modules/votings/votings.service.ts)
`updateMeetingQuorum()`: a single private method that recomputes
`balance = sum(payments.amount) - sum(charges.amount)` from scratch and
writes it, called after every charge-generation batch and every payment.

**Tests:** new `finance.service.spec.ts` covering: tariff CRUD tenant
isolation, charge generation (correct FLAT vs PER_AREA amounts, skips
duplicates for an already-charged period, balance recomputed correctly),
payment recording (balance recomputed correctly), resident read access
(OWNER with verified ownership can read own account; TENANT gets nothing;
a different resident/different tenant is rejected), staff role checks
(DISPATCHER rejected, HOA_CHAIRMAN can read but not write).

---

## Subtask C — Web: tariffs + accounts pages

Two new pages under `frontend-web/src/app/dashboard/`, following the exact
conventions already established (`apiRequest`/`getStoredSession` from
[lib/api.ts](../frontend-web/src/lib/api.ts), same table/modal/`confirm()`
patterns as [residents/page.tsx](../frontend-web/src/app/dashboard/residents/page.tsx),
i18n via `t()` from the start — don't ship this one in Russian-only and
create more i18n backlog):

- **`dashboard/finance/tariffs/page.tsx`** — list/create/edit tariff items
  for the staff member's tenant, toggle active/inactive. `HOA_ADMIN`/
  `SUPERADMIN` only — hide or redirect for other roles (mirror however
  role-gating is already done for the roles-restricted actions elsewhere,
  e.g. the `@Roles` pattern's frontend equivalent if one exists, or at
  minimum don't render the write controls for roles that can't use them).
- **`dashboard/finance/page.tsx`** — accounts overview: table of units with
  current balance, a "Начислить за период" action (month/year picker →
  calls generate-charges, shows the created/skipped summary), and a way to
  select an account to record a payment against and view its charge/payment
  history (modal or drawer, same pattern as elsewhere).
- Add both to the `navigation` array in
  [dashboard/layout.tsx](../frontend-web/src/app/dashboard/layout.tsx) (a
  "Финансы" entry is enough — nest tariffs under it or link both from the
  main finance page, your call) with an `i18n` key in all three locale
  files from the start, and gate visibility to the roles listed above where
  it makes sense to hide rather than just 403 on click.

## Subtask D — Mobile: read-only account screen

One new screen, `mobile/src/screens/finance/AccountScreen.tsx` (new
`finance` i18n namespace, same convention as every other screen), reached
via a quick-link card on
[DashboardScreen.tsx](../mobile/src/screens/dashboard/DashboardScreen.tsx)
(same pattern as the existing votings/requests/announcements cards there) —
**not** a new bottom tab, to avoid crowding the 5-tab bar that already
exists in [MainTabs.tsx](../mobile/src/navigation/MainTabs.tsx).

- Shows: current balance (clearly signed — a debt should be visually
  distinct from a credit), a list of recent charges (tariff name, period,
  amount), a list of recent payments.
- If the resident has no verified `OWNER` ownership (i.e. `GET
  /finance/my-accounts` returns empty), show an empty state, not an error —
  this is an expected state for tenants and unverified residents, not a
  failure.
- No payment button, no "coming soon" placeholder — see the architecture
  decision above.

---

## Acceptance criteria

- A `HOA_ADMIN` can create tariff items for their tenant, generate charges
  for a period, and record a payment against a unit; balances update
  correctly and match a from-scratch recomputation.
- `HOA_CHAIRMAN` can view everything in the finance module but gets
  `403 Forbidden` on write endpoints (create tariff, generate charges,
  record payment).
- `DISPATCHER` gets `403 Forbidden` on every finance endpoint.
- A verified `OWNER` resident sees exactly their own unit(s)' accounts via
  `GET /finance/my-accounts`; a `RESIDENT_TENANT` sees an empty list; a
  resident cannot fetch another unit's account by guessing its ID (tenant/
  ownership isolation, same BOLA-prevention standard as every prior task).
- Running charge generation twice for the same period doesn't double-charge
  anything (unique constraint + skip-on-conflict verified by a test).
- Web: both new pages follow existing UI conventions, ship with full kk/ru/en
  keys (no new i18n backlog created by this task).
- Mobile: new screen fully migrated to i18n from the start, empty state for
  non-owners handled gracefully.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`,
  `mobile/`, and `frontend-web/`.

## Deliverable

- Subtask A+B (backend) can ship separately from C/D (frontend) if useful
  for review size — reviewer's call, same as prior multi-platform tasks.
- PR description should confirm: no online-payment UI was added anywhere,
  no `PLATFORM_FEE`/Shanyraq-specific tariff was hardcoded, and role access
  matches the read/write split specified above exactly.

---

## Review addendum (2026-09-08) — accountNumber collision across tenants

**Verified good:** schema, RBAC (staff write/read split, DISPATCHER and
`RESIDENT_TENANT` correctly excluded everywhere, `HOA_CHAIRMAN` read-only
enforced at both the `@Roles` decorator and inside the service), tenant
isolation (`assertUserBelongsToTenant` used consistently, including at the
controller level for `createTariff`/`generateCharges` where the service
itself doesn't re-check — matches the existing `properties.controller.ts`
pattern), balance recomputed from scratch via aggregate (not incremental)
exactly as asked, no online-payment UI anywhere, no `PLATFORM_FEE`
hardcoded. 108/108 backend tests pass, `tsc --noEmit` clean in all three
apps, full kk/ru/en key parity (331 mobile / 346 web keys).

**Found:** `accountNumber` generation (in `PropertiesService.addUnit()`,
and duplicated in `FinanceService.generateCharges()` and
`FinanceService.getMyAccounts()` as a fallback for units created before this
migration) builds the value as `` `ACC-${cleanBlockName}-${unitNumber}` ``
and relies on it being globally unique — but nothing in the schema
guarantees that. `Unit.unitNumber` is only unique per `buildingId`
(`@@unique([buildingId, unitNumber])`), and `Building.blockName` has no
uniqueness constraint at all. Two different tenants (or two buildings in the
same tenant) both named e.g. "Блок А" with a unit "101" — an extremely
common naming pattern — will collide on `accountNumber`, which **does**
carry `@unique` in the `PersonalAccount` model. The second unit's account
creation throws an unhandled Prisma P2002 error (surfaces as a raw 500) in
whichever of the three call sites hits it first. Given multi-tenancy across
many ЖК is a stated core capability of this platform (see
[PROGRESS.md](PROGRESS.md)), this isn't a hypothetical edge case.

**Required fix:** make `accountNumber` actually unique by construction
instead of hoping the input strings don't collide — the same technique
already used for `MeetingProtocol.protocolNumber` in
[votings.service.ts](../backend/src/modules/votings/votings.service.ts)
`closeMeetingAndGenerateProtocol()` (`` `ОСС-${year}/${meetingId.slice(0,
6).toUpperCase()}` ``): fold in a slice of the unit's own (globally unique)
id, e.g. `` `ACC-${cleanBlock}-${unitNumber}-${unit.id.slice(0, 6).toUpperCase()}` ``.

**While fixing, please also deduplicate:** the account-number-generation +
lazy-account-creation logic is currently copy-pasted in three places
(`properties.service.ts` `addUnit()`, and both spots in `finance.service.ts`).
Extract it to a single shared helper (a small exported function, or a method
on `FinanceService` that `PropertiesService` calls via dependency injection —
your call on which module should own it) so the three copies can't drift
from each other again.

**Test to add:** two units in different tenants (or different buildings)
sharing the same `blockName`+`unitNumber` get distinct, non-colliding
account numbers.

---

## Implementation Summary

- **Subtask A (Prisma Schema & Migrations):**
  - Added models `PersonalAccount`, `TariffItem`, `Charge`, `Payment` with enums `ChargeCalculationMethod` (`FLAT`, `PER_AREA`) and `PaymentMethod` (`MANUAL`).
  - Unique composite index `[personalAccountId, tariffItemId, periodYear, periodMonth]` prevents double billing.
  - Automatic creation of `PersonalAccount` with deterministic format `ACC-{block}-{unit}` in `addUnit()`.
  - Seed updated with sample tariffs, charges, payments, and accounts for units 101, 102, 205.
- **Subtask B (Backend Module & Tests):**
  - Created `backend/src/modules/finance/`: `finance.service.ts`, `finance.controller.ts`, `finance.module.ts`, `dto/finance.dto.ts`.
  - Recompute balance from scratch on every change (`sum(payments) - sum(charges)`).
  - RBAC strictly enforced: writes require `HOA_ADMIN` or `SUPERADMIN`; reads allow `HOA_CHAIRMAN`; `DISPATCHER` and `SECURITY` blocked with `403`; residents restricted to `GET /finance/my-accounts` (verified `OWNER` only; `RESIDENT_TENANT` gets `[]`).
  - 16 new unit tests in `finance.service.spec.ts`. All 108 backend tests passing across 9 test suites.
- **Subtask C (Frontend Web):**
  - Added Finance section to sidebar navigation (accessible to `SUPERADMIN`, `HOA_ADMIN`, `HOA_CHAIRMAN`).
  - Account registry page `dashboard/finance/page.tsx` with KPI overview, search/filters, period charge generation modal, manual payment modal, and account details drawer with charge/payment histories.
  - Tariff catalog page `dashboard/finance/tariffs/page.tsx` with create/edit modal and status toggling.
  - Next.js production build clean (`npm run build`).
- **Subtask D (Mobile):**
  - Added `AccountScreen.tsx` for residents: view current balance, active debt/overpayment badge, unit details, notice regarding offline payments, and tabs for charge breakdown and payment history. Multi-unit switcher for owners of multiple units; empty state for non-owners.
  - Quick-access card on `DashboardScreen.tsx`.
  - Typecheck clean (`npm run typecheck`).
- **Review Addendum Resolution (accountNumber collision fix & deduplication):**
  - Extracted shared helper `personal-account.helper.ts` with `generateAccountNumber()` and `getOrCreatePersonalAccount()`.
  - Folded in uppercase 6-character slice of unit's UUID (`ACC-${cleanBlock}-${unitNumber}-${unit.id.slice(0, 6).toUpperCase()}`), eliminating any collision risk across tenants/buildings with identical block and apartment numbers.
  - Replaced duplicate account creation logic across `properties.service.ts` (`addUnit`), `finance.service.ts` (`generateCharges`), and `finance.service.ts` (`getMyAccounts`).
  - Added unit tests in `finance.service.spec.ts` verifying collision prevention and helper behavior.
  - All 112 backend tests passing across 9 test suites. Typechecks clean across backend, web, and mobile. Parity 100%.

