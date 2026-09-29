# Task 0090: HOA/ОСИ expense ledger (backend + staff web UI)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

New feature, first half of closing [PRODUCT_SPEC.md](PRODUCT_SPEC.md) section
4.3's requirement: *"Финансовые отчеты для собственников (обязательное
требование прозрачности для ОСИ)"*. Identified during the 2026-09-21 audit
(see [PROGRESS.md](PROGRESS.md)) that the platform tracks money **coming
in** from residents (`Charge`, `Payment` — [Task 0006](0006-finance-personal-account.md))
and can report on collection rate for staff
([Task 0013](0013-analytics.md)'s `getFinanceAnalytics`), but has **no
concept of money going out** — there is no `Expense` model anywhere in
[schema.prisma](../backend/prisma/schema.prisma), confirmed by grep. An ОСИ
transparency report needs both sides: what was collected, and what it was
spent on (ремонт, зарплата персонала, коммунальные платежи УК и т.д.).

This task builds the expense-tracking half only — a staff-facing ledger
where УК/ОСИ records what it spent. [Task 0091](0091-resident-financial-transparency-report.md)
(separate, depends on this one) builds the resident-facing aggregate report
that combines this data with the existing income data.

## Architecture decisions — do not re-litigate

1. **Expense category is free text, not an enum.** Mirrors
   `TariffItem.name`'s existing comment — *"fully staff-defined"*
   ([schema.prisma:519](../backend/prisma/schema.prisma#L519)) — different
   HOAs spend on different things and inventing a fixed taxonomy now would
   be premature. If reporting later needs grouping, that's a follow-up,
   not blocking this task.
2. **Expenses are HOA-level, not per-unit.** Unlike `Charge`/`Payment`,
   `Expense` has no `accountId`/`unitId` — it belongs directly to
   `tenantId`. This matches how real ОСИ operating expenses work (repairs,
   payroll, utilities the HOA itself pays) — there's no per-resident
   allocation to track here.
3. **Immutable ledger + soft void, not update/delete.** Matches this
   codebase's established pattern for financial and moderation records:
   `Payment`/`Charge` have no update/delete at all; `Announcement` uses a
   status + mandatory reason instead of hard delete
   ([Task 0064](0064-announcement-removal.md),
   `announcements.service.ts:93-137`); `GuestPass` uses
   `isRevoked`/`revokedAt`/`revokedById` ([Task 0044](0044-guest-pass-history-and-revocation.md)).
   `Expense` gets the same shape: `isVoided`/`voidedAt`/`voidedById`/
   `voidedReason` (reason **mandatory**, matching `removeAnnouncement`'s
   `REMOVAL_REASON_REQUIRED` check) — a bad entry gets voided with a
   reason, never edited or deleted, so the ledger stays a true audit trail.
4. **Roles**: create/void restricted to `HOA_ADMIN`/`SUPERADMIN` — matches
   `createTariff`/`recordPayment`'s existing role gate exactly
   (`finance.controller.ts:51-52,104-105`). `HOA_CHAIRMAN` gets **read-only**
   access to the ledger, matching the chairman's existing read-only role on
   `getTariffs`/`getTenantAccounts` (`finance.controller.ts:40-41,119-120`)
   and the spec's own description of the role (`PRODUCT_SPEC.md` section 2:
   *"Председатель ОСИ ... просмотр отчётов"*). `DISPATCHER` gets **no
   access at all** — matches the strict, consistent exclusion of
   `DISPATCHER` from every finance/analytics endpoint in this codebase
   (confirmed in `finance.controller.ts` and `analytics.controller.ts` —
   no exceptions exist today, don't introduce the first one here).

## Subtask A — Schema

Add to [schema.prisma](../backend/prisma/schema.prisma), placed near the
existing `Finance` models (`TariffItem`/`PersonalAccount`/`Charge`/`Payment`):

```prisma
model Expense {
  id           String    @id @default(uuid())
  tenantId     String
  category     String    // "Ремонт", "Зарплата персонала", "Коммунальные услуги" и т.д. — полностью определяется УК, как TariffItem.name
  description  String?
  amount       Float
  expenseDate  DateTime  // дата фактической траты, не дата ввода в систему
  recordedById String
  isVoided     Boolean   @default(false)
  voidedAt     DateTime?
  voidedById   String?
  voidedReason String?
  createdAt    DateTime  @default(now())

  tenant       Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  recordedBy   User      @relation("RecordedExpenses", fields: [recordedById], references: [id], onDelete: Restrict)
  voidedBy     User?     @relation("VoidedExpenses", fields: [voidedById], references: [id], onDelete: SetNull)

  @@map("expenses")
}
```

Add the matching back-relations to `Tenant` (`expenses Expense[]`) and
`User` (`recordedExpenses Expense[] @relation("RecordedExpenses")`,
`voidedExpenses Expense[] @relation("VoidedExpenses")`) — follow the exact
relation-naming convention already used for `GuestPass`'s
`createdPasses`/`revokedPasses` on `User`
([schema.prisma:192-193](../backend/prisma/schema.prisma#L192-L193)).
This project uses `prisma db push` (no `prisma/migrations` directory exists
— confirmed), so no separate migration file is needed, just update the
schema and regenerate the client.

## Subtask B — Backend service + controller

In `finance.service.ts` / `finance.controller.ts` (new methods, same files
— this is the same domain, not a new module):

- `createExpense(tenantId, user, dto)`: staff-role check
  (`HOA_ADMIN`/`SUPERADMIN` only, matching decision #4), validate `amount >
  0` and non-empty `category`, create the row, `AuditLogService.log()` with
  `action: 'EXPENSE_CREATED'` (matching `TARIFF_CREATED`'s existing
  pattern at `finance.service.ts:85-91`).
- `voidExpense(id, user, dto)`: staff-role check, tenant-isolation check
  (matching `removeAnnouncement`'s `REMOVE_CROSS_TENANT_FORBIDDEN`
  pattern), reject if already voided
  (`FINANCE.EXPENSE_ALREADY_VOIDED`), reject if `dto.reason` is empty
  (`FINANCE.VOID_REASON_REQUIRED`), else set the four `voided*` fields and
  log `action: 'EXPENSE_VOIDED'`.
- `getExpenses(tenantId, user, query: { from?, to?, category? })`: staff
  read-role check (`HOA_ADMIN`/`HOA_CHAIRMAN`/`SUPERADMIN`), tenant-scoped
  list ordered by `expenseDate desc`, optional date-range and category
  filters (matching `DateRangeAnalyticsQueryDto`'s existing shape in
  `analytics.dto.ts`).
- `exportExpensesCsv(tenantId, user, query)`: same read-role check, use the
  shared `buildCsv` helper (`common/csv/csv.helper.ts`) exactly like every
  other CSV export in this codebase (e.g. `announcements.service.ts`'s
  `exportAnnouncementsCsv`) — columns: date, category, description, amount,
  recorded by, status (active/voided), voided reason if applicable.

New controller routes on `FinanceController`:
- `POST /finance/tenants/:tenantId/expenses`
- `GET /finance/tenants/:tenantId/expenses`
- `GET /finance/tenants/:tenantId/expenses/export`
- `PATCH /finance/expenses/:id/void`

Error codes: `FINANCE.EXPENSE_NOT_FOUND`, `FINANCE.EXPENSE_ALREADY_VOIDED`,
`FINANCE.VOID_REASON_REQUIRED`, `FINANCE.EXPENSE_CROSS_TENANT_FORBIDDEN`,
`FINANCE.INVALID_AMOUNT` — matching the existing `{ code, message }`
convention from [Task 0014](0014-backend-error-codes.md), reusing the
`FINANCE` namespace already present in all locale files
(`frontend-web/src/i18n/locales/*.json`, `mobile/src/i18n/locales/*.json`
— add these new keys alongside the existing `FINANCE.*` keys, all 6 files,
maintaining the 100% parity convention).

**Tests**: extend `finance.service.spec.ts` — create succeeds for
`HOA_ADMIN`/`SUPERADMIN`, rejected for `HOA_CHAIRMAN`/`DISPATCHER`/
residents; void requires a non-empty reason and rejects a second void;
cross-tenant `HOA_ADMIN` rejected; list is tenant-isolated and includes
`HOA_CHAIRMAN` as an allowed reader; CSV export matches the existing
`buildCsv` test pattern used by other export tests in this file/module.

## Subtask C — Web staff UI

New page `frontend-web/src/app/dashboard/finance/expenses/page.tsx`,
following the exact layout/data-fetching conventions of the existing
`frontend-web/src/app/dashboard/finance/tariffs/page.tsx` (list view, a
"create" form/modal, CSV download button per
[Task 0078](0078-csv-export-download-buttons.md)'s established pattern).
Link it from `frontend-web/src/app/dashboard/finance/page.tsx`'s existing
navigation (however that page currently links to `tariffs`). Void action
requires typing a reason (matches the announcement-removal UI's existing
reason-prompt pattern — check `frontend-web/src/app/dashboard/announcements/page.tsx`
for the exact UI convention to mirror). Use `getApiErrorMessage(err, t)`
for error display, not raw `err.message` (per the established correct
pattern, and per the lesson from [Task 0089](0089-web-waitlist-shift-handover-error-i18n.md)
— don't repeat that regression on a brand-new page).

i18n: add all new strings + the new `FINANCE.*` error keys to all 3 web
locale files, maintaining exact key-set parity (verify with a flatten/diff
check, not just eyeballing counts — see [Task 0089](0089-web-waitlist-shift-handover-error-i18n.md)'s
methodology).

## Acceptance criteria

- `HOA_ADMIN`/`SUPERADMIN` can create and void expenses; `HOA_CHAIRMAN` can
  view but not create/void (403 on write); `DISPATCHER` and residents get
  403 on every expense endpoint; cross-tenant staff get 403 — all proven by
  tests, not just manual checks.
- Voiding without a reason fails; voiding an already-voided expense fails;
  voided expenses stay in the ledger (visible, marked voided) rather than
  disappearing.
- CSV export works and staff can download it from the web UI.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`
  and `frontend-web/`; i18n key-set parity maintained (exact match, all 3
  locales, both apps — confirmed by flattening and diffing, not by count
  alone).

## Explicitly out of scope

- Any resident-facing view of this data — that's
  [Task 0091](0091-resident-financial-transparency-report.md), which reads
  this table but is a separate task with separate review.
- Receipt/document attachment upload for expense entries — not requested,
  would pull in the uploads/S3 module for a feature nobody asked for yet;
  add later as its own task if the pilot ОСИ actually needs it.
- Expense approval workflows (e.g. requiring `HOA_CHAIRMAN` sign-off before
  an `HOA_ADMIN`-entered expense counts) — spec doesn't call for this, and
  it's a meaningfully bigger feature (state machine, notifications); don't
  build it speculatively.
- Any change to the existing `getFinanceAnalytics`/income-side reporting —
  unrelated, out of scope.

## Deliverable
 
 - Single backend commit (schema + service + controller + tests) and one
   frontend-web commit, or combined — follow this project's existing
   convention for similar full-stack finance tasks.
 - PR description confirms: exact new error codes, test names for the
   role-gating matrix, and the new i18n key counts per locale (all 3 must
   match).

## Implementation Summary (2026-09-21)
- **Schema**: Created `Expense` model in `prisma/schema.prisma` with `tenantId`, `amount`, `category`, `description`, `expenseDate`, `recordedById`, `isVoided`, `voidedAt`, `voidedById`, `voidedReason`. Added back-relations in `Tenant` and `User`.
- **Backend**:
  - DTOs: `CreateExpenseDto`, `VoidExpenseDto`, `GetExpensesQueryDto` in `finance.dto.ts`.
  - Service: `createExpense`, `voidExpense`, `getExpenses`, `exportExpensesCsv` with audit logging (`EXPENSE_CREATED`, `EXPENSE_VOIDED`), role checks, tenant isolation, and validation.
  - Controller: 4 endpoints (`POST /finance/tenants/:tenantId/expenses`, `GET /finance/tenants/:tenantId/expenses`, `GET /finance/tenants/:tenantId/expenses/export`, `PATCH /finance/expenses/:id/void`).
  - Unit tests: 19 new tests in `finance.service.spec.ts` covering validation, RBAC, tenant isolation, voiding, filtering, and CSV export.
- **Frontend Web**:
  - Created `/dashboard/finance/expenses` with KPI summary cards, date & category filters, create modal, void modal with mandatory reason prompt, and CSV export.
  - Linked to `/dashboard/finance/expenses` from `/dashboard/finance` header navigation for `HOA_ADMIN`, `HOA_CHAIRMAN`, `SUPERADMIN`.
  - Used `getApiErrorMessage(err, t)` for error handling.
- **i18n**:
  - 100% key parity verified across `ru`, `kk`, `en` for both `frontend-web` (1,318 keys) and `mobile` (869 keys).
  - Added 9 error codes to `errors.FINANCE`: `EXPENSE_NOT_FOUND`, `EXPENSE_ALREADY_VOIDED`, `VOID_REASON_REQUIRED`, `INVALID_AMOUNT`, `INVALID_CATEGORY`, `INVALID_EXPENSE_DATE`, `CREATE_EXPENSE_FORBIDDEN`, `VOID_EXPENSE_FORBIDDEN`, `VIEW_EXPENSE_FORBIDDEN`.
- **Verification**:
  - `backend/npm test`: 35 test suites, 749 tests passed.
  - `npx tsc --noEmit`: Clean in backend, frontend-web, and mobile.
