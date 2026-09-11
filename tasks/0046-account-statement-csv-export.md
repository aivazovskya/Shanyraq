# Task 0046: CSV export of a personal account's charge/payment history

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, same CSV pattern as
[Task 0032](0032-finance-analytics-csv-export.md)/
[Task 0037](0037-access-log-csv-export.md)/
[Task 0041](0041-staff-audit-trail.md)/
[Task 0043](0043-residents-registry-csv-export.md). [Task 0022](0022-pdf-report-exports.md)
already built a per-account PDF statement
(`GET /finance/accounts/:accountId/statement`,
[finance.service.ts:571](../backend/src/modules/finance/finance.service.ts)'s
`generateAccountStatementPdf`) — a resident who wants to hand their
payment history to an accountant, a bank, or keep for their own records
today only gets a PDF. This task adds the same data as a CSV, which is
what a spreadsheet-oriented recipient (accounting software import,
personal budgeting) actually wants.

### Architecture decisions already made — do not re-litigate

1. **Reuse `getAccountById` for authorization and data — don't
   re-derive either.** `generateAccountStatementPdf` already calls
   `getAccountById(accountId, user)`
   ([finance.service.ts:380-438](../backend/src/modules/finance/finance.service.ts)),
   which enforces the exact authorization this export needs (staff of
   the account's tenant via `assertUserBelongsToTenant`, or a verified
   `OWNER`-type resident of the account's own unit) and already returns
   `charges` (with `tariffItem`) and `payments` (with `recordedBy`)
   fully loaded. The CSV export calls the same method, not a new query.
2. **Same month/year optional filtering as the PDF endpoint — mirror it
   exactly, don't invent a different filter shape.** The PDF endpoint's
   `query.year`/`query.month` filtering logic
   ([finance.service.ts:594-604](../backend/src/modules/finance/finance.service.ts))
   is copy-appropriate here — a `year` filters both `charges.periodYear`
   and `payments.paidAt`'s year, `month` further narrows both.
3. **Same role gate as the existing PDF endpoint — no new authorization
   decision.** `@Roles(HOA_ADMIN, SUPERADMIN, HOA_CHAIRMAN,
   RESIDENT_OWNER)`, identical to
   [finance.controller.ts:142-148](../backend/src/modules/finance/finance.controller.ts)'s
   `downloadStatement` route.
4. **CSV mirrors the PDF's structure — header info, then charges, then
   payments — not a payments-only file.** The PDF statement already
   established this as the right shape for "what happened on this
   account" (a payment only makes sense in context of what was owed);
   don't narrow the CSV to payments alone just because that's the
   feature's name — same reasoning
   [Task 0032](0032-finance-analytics-csv-export.md) used for including
   both the tariff breakdown and the debtor list in one export rather
   than splitting them.
5. **Reuse `buildCsv`/`escapeCsvField` and the exact filename pattern
   the PDF endpoint already uses, just with a `.csv` extension** —
   `statement_${account.accountNumber}${periodPart}.csv`, same
   `periodPart` derivation logic already in
   [finance.service.ts:621-623](../backend/src/modules/finance/finance.service.ts).

---

## Subtask A — Backend: export endpoint

In [finance.service.ts](../backend/src/modules/finance/finance.service.ts),
add `exportAccountStatementCsv(accountId, user, query?)`:

- Call `getAccountById(accountId, user)` (decision #1), apply the same
  month/year filtering as `generateAccountStatementPdf` (decision #2)
  to `charges`/`payments`.
- Build rows: a header block (ЖК name, account number, unit, owner
  name(s), period), a "Начисления" table (period, tariff name, amount),
  a "Платежи" table (date, amount, method/note if present, recorded by
  — staff name for manually-recorded payments), and a closing
  current-balance line.
- Build via `buildCsv`, filename per decision #5.

In [finance.controller.ts](../backend/src/modules/finance/finance.controller.ts):

- `GET /finance/accounts/:accountId/statement/export?month=&year=`,
  same `@Roles` as `downloadStatement` (decision #3), `@Res()`
  streaming with `Content-Disposition`, matching every prior CSV export
  in this codebase.

**Tests:** extend `finance.service.spec.ts` —
- A verified `OWNER` of the account's unit can export their own
  statement; a verified `OWNER` of a *different* unit is rejected
  (reuses `getAccountById`'s existing authorization — confirm it's
  actually enforced here too, not bypassed).
- Staff of a different tenant is rejected.
- `year`/`month` filters narrow both charges and payments identically
  to how `generateAccountStatementPdf` already filters them — construct
  a fixture spanning two periods and assert only the requested period's
  rows appear.
- Raw CSV bytes start with the UTF-8 BOM; a tariff or payment note
  containing a comma round-trips correctly.

## Subtask B — Web: download button

- Add a "Скачать CSV" button next to the existing PDF statement download
  control (wherever that lives in the finance pages —
  [finance/page.tsx](../frontend-web/src/app/dashboard/finance/page.tsx)
  or the resident's own account view, check which one currently exposes
  the PDF download and place the CSV button beside it), using the
  established `apiDownload` helper.
- Full kk/ru/en i18n parity for the new button label.

---

## Acceptance criteria

- The exported CSV's authorization matches `downloadStatement`'s
  existing behavior exactly (same roles, same resident-owns-this-account
  check).
- `year`/`month` filtering produces identical row selection to the PDF
  endpoint for the same query.
- UTF-8 BOM present, Cyrillic renders correctly, comma-containing fields
  don't corrupt the CSV.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`
  and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- Mobile UI — check whether the mobile app's own finance screen already
  has a PDF-download entry point from Task 0022; if it does not, don't
  add one for CSV either here — stay consistent with wherever the PDF
  feature currently lives rather than expanding platform coverage as a
  side effect of adding a new format.
- Any change to `generateAccountStatementPdf` or the PDF output itself.
- Bulk/multi-account export (e.g. "export every resident's statement at
  once") — this is a single-account export, matching the PDF endpoint's
  scope exactly.

## Deliverable

- Backend and web can ship as separate commits.
- PR description confirms the UTF-8 BOM/Cyrillic verification, same
  expectation every prior CSV export task in this project has set, and
  states which platform(s) got the new download button per the mobile
  scoping note above.

---

## Review addendum (2026-09-11) — accepted, no issues found

**Verified good:** `exportAccountStatementCsv` calls `getAccountById`
for authorization exactly as decided, and this is proven — not just
assumed — by tests where a verified owner of a *different* unit and
staff from a *different* tenant are both rejected. Month/year filtering
mirrors `generateAccountStatementPdf`'s exact logic. The CSV correctly
includes charges, payments, header info, and a closing balance line
rather than narrowing to payments alone, matching decision #4. Comma/
quote escaping in tariff names and payment notes is tested, along with
the UTF-8 BOM. On mobile: confirmed via grep that no "statement"
reference exists anywhere in `mobile/src` and `git status` shows zero
mobile files touched — the "don't expand mobile coverage as a side
effect" scoping note was actually followed, not just stated. Web
correctly extends the existing PDF-download control into a
`handleDownloadStatement('pdf' | 'csv')` pair sharing one loading-state
variable, placed together in the account detail view.

**Verified independently:** 459/459 backend tests pass (5 new), `tsc
--noEmit` clean in `backend/` and `frontend-web/`, full kk/ru/en parity
(1027/1027/1027 web keys). Task accepted, no fixes required.
