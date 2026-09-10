# Task 0032: CSV export of financial analytics (debtors + tariff breakdown)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. [Task 0013](0013-analytics.md)'s analytics dashboard
([analytics.controller.ts](../backend/src/modules/analytics/analytics.controller.ts),
`frontend-web/src/app/dashboard/analytics/page.tsx`) shows financial
analytics on-screen only — the tariff breakdown and top-10-debtors table
can't leave the browser. This task adds a downloadable CSV report for the
finance analytics specifically (the genuinely tabular, accounting-relevant
data) — `requests`/`activity` analytics stay screen-only, see decision #1.

### Architecture decisions already made — do not re-litigate

1. **Finance analytics only — not requests or activity.**
   `getRequestsAnalytics`'s `byStatus`/`byCategory` breakdowns are a
   handful of rows each (low export value); `getActivityAnalytics` is
   almost entirely scalar summary numbers, not naturally row-shaped. The
   finance endpoint's `topDebtors` (real accounting data, useful for a
   board meeting or handoff to accounting) and `byTariff` breakdown are
   the genuinely valuable export targets. If requests/activity export is
   wanted later, that's a separate task.
2. **CSV, not a real `.xlsx` file.** No new dependency needed — a
   correctly-escaped, UTF-8-BOM-prefixed CSV (decision #3) opens directly
   in Excel/Google Sheets/LibreOffice with zero friction. This mirrors
   [Task 0022](0022-pdf-report-exports.md)'s reasoning for choosing
   `pdfkit` over a headless-browser PDF pipeline — the simplest tool that
   actually satisfies the request, not the fanciest one.
3. **UTF-8 BOM prefix is mandatory — this is the #1 way this task goes
   wrong.** A plain UTF-8 CSV with Cyrillic content, opened directly by
   double-clicking in Excel on Windows (the realistic use case for a УК
   accountant), renders as mojibake unless the file starts with a UTF-8
   BOM (`﻿`). This is the exact same class of pitfall as
   [Task 0022](0022-pdf-report-exports.md)'s Cyrillic-PDF-font issue —
   **verify by actually generating a CSV with real Cyrillic content
   (tariff names, "Топ должников" section header) and opening it in a
   spreadsheet application**, not just by asserting the buffer is
   non-empty.
4. **Proper CSV field escaping (RFC 4180), not naive comma-joining.**
   Any field containing a comma, double quote, or newline must be
   quoted with doubled internal quotes. Tariff names and account numbers
   are unlikely to contain these today, but don't write a naive
   `.join(',')` that would silently corrupt the file the first time one
   does.
5. **Export uses the *uncapped* debtor list, not the dashboard's top-10.**
   `AnalyticsService.getFinanceAnalytics`'s `topDebtors` is deliberately
   capped at 10 for the on-screen widget
   ([analytics.service.ts:156-167](../backend/src/modules/analytics/analytics.service.ts) —
   `take: 10`). The CSV export should include every account with a
   negative balance for the tenant, not just the top 10 — a real
   financial report shouldn't silently truncate. Don't reuse the capped
   query as-is; either add a parameter to skip the cap or write a
   dedicated uncapped query for the export path.
6. **Same role gate as the existing analytics endpoints — no new
   authorization decision needed.** `@Roles(SUPERADMIN, HOA_ADMIN,
   HOA_CHAIRMAN)` at the controller level, same `assertStaffAccess`
   tenant check the existing finance analytics method already does.
7. **Web download uses fetch + blob, not a plain `<a href>` link.** This
   is the first file-download UI in `frontend-web` (Task 0022's PDF
   statement endpoint shipped with no frontend-web UI). A direct link to
   an authenticated API endpoint won't carry the Bearer token. Fetch the
   CSV with the existing authenticated request helper, then trigger a
   download via `URL.createObjectURL` on the response blob + a
   programmatically-clicked temporary `<a download>` element — the
   standard pattern for authenticated SPA file downloads.

---

## Subtask A — Backend: CSV generation + export endpoint

- Add a small shared CSV-building helper (e.g.
  `backend/src/common/csv/csv.helper.ts`) implementing decisions #3/#4 —
  a function building one CSV buffer/string from row arrays with proper
  escaping, prefixed with the UTF-8 BOM.
- New endpoint `GET /analytics/tenants/:tenantId/finance/export` (same
  `month`/`year` query params as the existing finance analytics
  endpoint), returning `text/csv` with a `Content-Disposition:
  attachment; filename="..."` header (stream the response directly,
  matching the pattern
  [Task 0022](0022-pdf-report-exports.md) established for the PDF
  statement endpoint's `@Res()` usage).
- Content: a header section (ЖК name, period, total charged, total
  collected, collection rate), then a "Начисления по тарифам" table
  (tariff name, amount), then a "Должники" table (account number, unit,
  block, balance) — using the uncapped debtor query from decision #5.

**Test:** the export endpoint's debtor section includes more than 10 rows
when more than 10 accounts have a negative balance (proving the cap was
actually removed, not just relabeled); a generated CSV's raw bytes start
with the UTF-8 BOM; a field containing a comma (construct a test tariff
name with one) round-trips correctly when the CSV is parsed back.

## Subtask B — Web: download button

- Add a "Скачать CSV" button to the finance analytics section of
  `frontend-web/src/app/dashboard/analytics/page.tsx`, near the existing
  tariff breakdown / top-debtors tables.
- Implement the fetch-blob-download pattern from decision #7.
- Full kk/ru/en i18n parity for the new button label.

---

## Acceptance criteria

- The exported CSV includes every negative-balance account for the
  tenant, not capped at 10.
- Opening the exported CSV in a real spreadsheet application (or at
  minimum inspecting its raw bytes for the BOM) confirms Cyrillic text
  renders correctly, not as mojibake.
- A tariff name or account field containing a comma or quote doesn't
  corrupt the CSV structure.
- Role gating matches the existing finance analytics endpoint exactly —
  no new role decisions.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`
  and `frontend-web/`.
- Full kk/ru/en i18n parity for the new button.

## Explicitly out of scope

- Requests/activity analytics export — decision #1.
- Real `.xlsx` generation — decision #2.
- Mobile UI for this export — analytics management already stays
  web-only per the established mobile-vs-web staff split
  ([PROGRESS.md](PROGRESS.md)).
- Changing the on-screen dashboard's capped top-10 debtor widget — that
  stays as-is; only the new export path is uncapped.

## Deliverable

- One commit or PR.
- PR description confirms how Cyrillic rendering was verified (decision
  #3) — same expectation Task 0022 set for its PDF Cyrillic verification.

---

## Review addendum (2026-09-10) — accepted, no issues found

**Verified good:** `csv.helper.ts` implements RFC 4180 escaping correctly
(comma/quote/CR/LF trigger quoting, internal quotes doubled, CRLF line
endings) with the UTF-8 BOM prefix — verified via a test asserting the
raw output bytes are exactly `0xEF, 0xBB, 0xBF`, stronger than a manual
spreadsheet check since it's an automated, repeatable proof rather than
a one-time visual confirmation. `exportFinanceAnalyticsCsv` is a
dedicated method with its own uncapped `personalAccount.findMany` query
(no `take`) — confirmed via a test with 15 mock debtors that explicitly
asserts the Prisma call was made `not.objectContaining({ take:
expect.anything() })`, and confirms all 15 account numbers appear in the
output; the existing capped `getFinanceAnalytics` dashboard method is
completely untouched. Comma+quote escaping tested with a realistic
compound case ("Отопление, подогрев "Люкс""). Controller endpoint
inherits the existing `@Roles(SUPERADMIN, HOA_ADMIN, HOA_CHAIRMAN)` at
the class level — no new role decision — and streams via `@Res()`
matching Task 0022's established PDF-download pattern exactly, with a
server-controlled filename (no header-injection surface). Web download
uses a genuinely reusable `apiDownload` helper (fetch + blob +
temporary-anchor pattern) with sensible session-expiry handling and
`Content-Disposition` filename parsing, wired to a button reflecting the
currently-selected `financeMonth`/`financeYear`. 316/316 backend tests
pass, `tsc --noEmit` clean in both `backend/` and `frontend-web/`, full
kk/ru/en parity (932/932/932 web keys). Task accepted, no fixes
required.
