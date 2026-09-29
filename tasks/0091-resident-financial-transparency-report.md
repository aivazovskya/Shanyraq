# Task 0091: Resident-facing financial transparency report (mobile)

**Status:** Blocked on [Task 0090](0090-hoa-expense-ledger.md)
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Second half of closing [PRODUCT_SPEC.md](PRODUCT_SPEC.md) section 4.3:
*"Финансовые отчеты для собственников (обязательное требование
прозрачности для ОСИ)"*. [Task 0090](0090-hoa-expense-ledger.md) gives the
platform an expense ledger (money out); this task exposes an aggregate,
privacy-safe income+expense report to verified owners (money in, already
tracked since [Task 0006](0006-finance-personal-account.md), plus the new
expense data), closing the actual spec gap: today residents can only see
their **own** personal account statement
(`GET /finance/accounts/:accountId/statement`), never the HOA's overall
financial picture.

**Do not start this task until [Task 0090](0090-hoa-expense-ledger.md) is
merged** — it depends on the `Expense` model and `getExpenses`-equivalent
data existing.

## Architecture decisions — do not re-litigate

1. **New endpoint lives on `FinanceController`, not `AnalyticsController`.**
   `AnalyticsController` has a **class-level** `@Roles(SUPERADMIN,
   HOA_ADMIN, HOA_CHAIRMAN)` guard
   (`analytics.controller.ts:30`) — every single route in that controller
   is staff-only by construction. Retrofitting one resident-accessible
   route into it means fighting the class-level decorator (per-method
   override risk, easy to get wrong) for no benefit, when
   `FinanceController` already has the exact mixed-access pattern this
   needs (`getAccountById`/`downloadStatement` already allow
   `RESIDENT_OWNER` alongside staff roles,
   `finance.controller.ts:142-149,206-212`). Put the new route there.
2. **`RESIDENT_OWNER` only, not `RESIDENT_TENANT`.** Matches
   [PRODUCT_SPEC.md](PRODUCT_SPEC.md) section 6 exactly: *"Арендатор —
   доступ, заявки; без голоса и без финансового модуля"* — tenants are
   already excluded from every other finance endpoint
   (`getAccountById`/`downloadStatement`/`exportStatementCsv` all list
   `RESIDENT_OWNER`, never `RESIDENT_TENANT`); this is consistent, not a
   new restriction.
3. **Use `assertAccessToTenant` (verified-ownership check), not
   `assertUserBelongsToTenant`.** This is a direct lesson from
   [Task 0087](0087-ownership-claim-tenant-bola.md), found in this same
   audit cycle: a resident's `tenantId` gets attached on claim submission,
   before HOA verification, so any tenant-scoped endpoint reachable by
   residents that only checks raw `tenantId` is a BOLA waiting to happen.
   This new endpoint must check *verified* ownership from the start, not
   get retrofitted later — follow the exact pattern `votings.controller.ts`
   and `announcements.controller.ts` now use post-0087.
4. **Aggregate only — no per-resident data.** `FinanceAnalyticsResponse`'s
   existing `topDebtors` field
   (`analytics.dto.ts:32-39,48`) lists individual accounts/balances by
   name and unit — **never include anything resembling this in the new
   resident-facing response.** The whole point of this endpoint is
   HOA-level transparency (total collected, total spent, by category),
   not exposing neighbors' payment status to each other. Reuse the
   *shape* of `totalCharged`/`totalCollected`/`collectionRatePercent`/
   `byTariff` from `FinanceAnalyticsResponse`, but write a distinct
   response interface for this endpoint rather than reusing
   `FinanceAnalyticsResponse` directly, so it's structurally impossible to
   accidentally serialize `topDebtors` into a resident-facing response
   later.
5. **Mobile only, no web page.** Per [PRODUCT_SPEC.md](PRODUCT_SPEC.md)
   section 1.1, residents use the mobile app exclusively; the web panel is
   for УК/ОСИ staff. `frontend-web` already has staff-facing financial
   analytics (`dashboard/finance/page.tsx`,
   [Task 0013](0013-analytics.md)'s dashboard) — this task adds nothing
   there.

## Subtask A — Backend read-only aggregate endpoint

New method in `finance.service.ts`, e.g. `getTransparencyReport(tenantId,
user, query: { month?, year? })`:

- `await assertAccessToTenant(this.prisma, user, tenantId,
  FINANCE_TRANSPARENCY_ERRORS)` per decision #3.
- Reuse the exact aggregation queries `analytics.service.ts`'s
  `getFinanceAnalytics` already runs for `totalCharged`/`totalCollected`/
  `byTariff` (`analytics.service.ts:70-120`ish) — either call into
  `AnalyticsService` for that part (constructor-inject it into
  `FinanceService`, or vice versa — pick whichever avoids a circular
  module dependency, check `AppModule`'s existing import graph before
  deciding) or duplicate the ~15-line query if injection would create a
  cycle; don't rewrite the aggregation logic differently from the
  staff-facing version, the numbers must match exactly.
- Add the new expense-side aggregation from [Task 0090](0090-hoa-expense-ledger.md):
  `totalExpenses` (sum of non-voided `Expense.amount` for the period) and
  `byExpenseCategory` (grouped sum per `category`, mirroring
  `TariffBreakdownItem`'s shape).
- Compute `netBalance = totalCollected - totalExpenses`.
- Return a new `FinancialTransparencyReport` interface (not
  `FinanceAnalyticsResponse` — see decision #4):
  ```ts
  interface FinancialTransparencyReport {
    periodMonth: number;
    periodYear: number;
    totalCharged: number;
    totalCollected: number;
    collectionRatePercent: number;
    byTariff: TariffBreakdownItem[]; // income breakdown — already non-sensitive, reuse the type
    totalExpenses: number;
    byExpenseCategory: { category: string; amount: number }[];
    netBalance: number;
  }
  ```

New controller route: `GET /finance/tenants/:tenantId/transparency-report`
on `FinanceController`, `@Roles(RESIDENT_OWNER, HOA_ADMIN, HOA_CHAIRMAN,
SUPERADMIN)` (staff can view their own tenant's version too, useful for
double-checking what residents see — matches this project's frequent
"staff can see what residents see, plus more" pattern elsewhere).

CSV export: `GET /finance/tenants/:tenantId/transparency-report/export`,
same access check, `buildCsv` with two sections (income by tariff, expenses
by category) — matches the two-section CSV pattern already used by
`exportFinanceAnalyticsCsv` (summary + breakdown + debtor list sections,
`analytics.service.ts`) minus the debtor section per decision #4.

**Tests**: extend `finance.service.spec.ts` — verified `RESIDENT_OWNER`
gets `200` with correct aggregate numbers (cross-check against a manually
computed expected total in the test fixture); unverified
resident/`RESIDENT_TENANT` gets `403`; staff of the same tenant gets `200`;
cross-tenant staff gets `403`; response object does **not** have a
`topDebtors` key or any per-account/per-resident field — assert the key's
absence explicitly, not just that the test happens not to look at it
(mirrors [Task 0086](0086-auth-me-password-hash-leak.md)'s
`not.toHaveProperty` verification style for exactly this kind of
"prove the leak can't happen" assertion).

## Subtask B — Mobile UI

New screen, e.g. `mobile/src/screens/finance/TransparencyReportScreen.tsx`,
reachable from the existing `AccountScreen.tsx` (add a link/tab — check
how `AccountScreen.tsx`'s existing `charges`/`payments` tab switcher is
built at `mobile/src/screens/finance/AccountScreen.tsx:36` and either add a
third tab or a distinct nav entry, whichever fits the existing screen's
layout better without overcrowding it — use your judgement on the UI, this
doesn't need to be prescribed further). Add `getTransparencyReport` to
`mobile/src/api/finance.ts` alongside the existing `financeApi` methods.
Show: total collected, total spent, net balance, a simple breakdown list
per tariff/category (no chart library needed — this app doesn't use one on
mobile elsewhere for simple breakdowns, check `AccountScreen.tsx`'s
existing list-based presentation and match it rather than introducing a
new visualization dependency).

i18n: add all new strings to all 3 mobile locale files, maintaining exact
key-set parity (flatten/diff verification, per
[Task 0089](0089-web-waitlist-shift-handover-error-i18n.md)'s established
method).

## Acceptance criteria

- A verified `RESIDENT_OWNER` can view the aggregate report for their own
  tenant; an unverified resident or `RESIDENT_TENANT` gets `403`.
- The response never contains per-resident/per-account data — proven by a
  dedicated test asserting the relevant keys are absent.
- Numbers match what `getFinanceAnalytics` (staff view) reports for the
  same period, for the fields both share (`totalCharged`, `totalCollected`,
  `collectionRatePercent`, `byTariff`) — no drift between the two views.
- Mobile screen renders the report and is reachable from the existing
  finance section.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`
  and `mobile/`; i18n key-set parity maintained (exact match, all 3
  locales).

## Explicitly out of scope

- Any web UI — see decision #5.
- Historical/multi-period trend charts — this task is a single-period
  snapshot (current month/year, like the existing statement/analytics
  endpoints default to); a trends view is a natural follow-up but a
  separate, larger task (charting library, period-comparison logic).
- Changing `getFinanceAnalytics` or any staff-facing analytics endpoint —
  this task adds a new, separate resident-facing endpoint; the existing
  staff one is untouched.
- PDF export — CSV is this project's established export primitive for
  aggregate reports (PDF is reserved for the two existing legally-flavored
  documents: voting protocols and per-account statements); don't add a
  third document-generation path for a report that's read on a phone
  screen, not printed.

## Deliverable

- Single backend commit and one mobile commit, or combined — follow this
  project's existing convention for similar full-stack finance tasks.
- PR description confirms: the "no per-resident data" test result
  explicitly, the cross-check against staff-facing numbers, and the new
  i18n key counts (mobile, all 3 locales matching).
