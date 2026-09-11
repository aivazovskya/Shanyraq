# Task 0043: CSV export of the confirmed residents registry

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, same CSV pattern as
[Task 0032](0032-finance-analytics-csv-export.md)/
[Task 0037](0037-access-log-csv-export.md)/
[Task 0041](0041-staff-audit-trail.md). [Task 0003](0003-residents-registry.md)
built the confirmed-residents registry
([residents/page.tsx](../frontend-web/src/app/dashboard/residents/page.tsx),
backed by `getConfirmedResidents` in
[properties.service.ts](../backend/src/modules/properties/properties.service.ts))
but it's screen-only — a УК preparing for an ОСС meeting or handing a
resident list to accounting has no way to get it out of the browser.

### Architecture decisions already made — do not re-litigate

1. **Uncapped, like Task 0032's debtor list — not date-range-bounded
   like Task 0037's access log.** A confirmed-residents registry is a
   naturally bounded snapshot (as many rows as the ЖК has verified
   resident-unit relationships today, not an ever-growing event log) —
   the same shape as Task 0032's debtor list, not Task 0037's
   continuously-accumulating `AccessLog`. No date range needed; export
   everything matching the current filter.
2. **One row per verified ownership, not one row per resident.** A
   resident who owns two units already appears as two entries in
   `getConfirmedResidents`'s nested `ownerships` array — flatten that
   into one CSV row per ownership (resident + specific unit + that
   unit's share), not one row per resident with units concatenated into
   a single cell. This is the granularity someone doing ОСС voting-weight
   review or per-unit accounting actually needs (voting weight is
   `area × share` **per unit**, not per resident).
3. **Export respects the current search filter — mirrors the on-screen
   view, per the principle [Task 0041](0041-staff-audit-trail.md)'s
   review established.** `getConfirmedResidents(tenantId, search)`
   already accepts the same `search` param the page's search box
   already sends server-side... **verify this before assuming it** —
   confirm whether `residents/page.tsx`'s search box filters client-side
   over an already-fetched full list or sends `search` to the API on
   each keystroke, and make the export endpoint accept the same `search`
   query param either way, so "export what I'm looking at" actually
   matches what's on screen.
4. **Same role gate as the existing registry endpoint — no new
   authorization decision.** `@Roles(HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER,
   SUPERADMIN)`, identical to
   [properties.controller.ts:101](../backend/src/modules/properties/properties.controller.ts)'s
   existing `getConfirmedResidents` route.
5. **IIN is included in the export — flag this explicitly, don't
   silently omit or silently include it.** `getConfirmedResidents`
   already returns each resident's `iin` in the JSON response to the
   same staff roles today (no new exposure), so including it in the CSV
   isn't a new authorization gap — but a CSV is a portable file that
   outlives the browser session and is easy to forward/save/print,
   unlike an on-screen table. Include it (accounting/ОСС paperwork in
   Kazakhstan routinely requires ИИН), but the PR description must state
   this plainly so whoever reviews it knows a PII field is in the
   exported file, rather than that being an unremarked side effect.
6. **Reuse `buildCsv`/`escapeCsvField` — same RFC 4180 + UTF-8 BOM
   convention as every prior export in this codebase, don't
   reimplement.**

---

## Subtask A — Backend: export endpoint

In [properties.service.ts](../backend/src/modules/properties/properties.service.ts),
add `exportConfirmedResidentsCsv(tenantId: string, search?: string)`:

- Call the existing `getConfirmedResidents(tenantId, search)` internally
  — don't duplicate its query (decision #3's "matches what's on screen"
  guarantee is automatic if this just reuses the same method the
  on-screen list already calls).
- Flatten to one row per verified ownership (decision #2). Columns:
  ФИО, телефон, email, ИИН (decision #5), тип владения (собственник/
  арендатор — `ownershipType`), блок, квартира/помещение, площадь,
  доля (%), дата верификации, статус аккаунта (активен/деактивирован).
- Build via `buildCsv`, filename
  `residents-registry-${tenantId}-${dateStr}.csv`.

In [properties.controller.ts](../backend/src/modules/properties/properties.controller.ts):

- `GET /properties/tenants/:tenantId/residents/export?search=`, same
  `@Roles`/`assertUserBelongsToTenant` as `getConfirmedResidents`
  (decision #4), `@Res()` streaming with `Content-Disposition`, matching
  the exact pattern every prior CSV export in this codebase uses.

**Tests:** extend `properties.service.spec.ts` —
- A resident with two verified ownerships produces two CSV rows, each
  with that specific unit's own share/area/block, not a single
  concatenated row.
- The `search` param filters the export identically to how it filters
  `getConfirmedResidents` (same residents in, same residents out) —
  don't re-derive a separate filter implementation for export.
- Raw CSV bytes start with the UTF-8 BOM; a resident with a comma in
  their name (construct one) round-trips correctly when parsed back.
- An unverified ownership or an unverified resident never appears in
  the export (matches `getConfirmedResidents`'s existing
  verified-only scope).

## Subtask B — Web: download button

- Add a "Скачать CSV" button to
  [residents/page.tsx](../frontend-web/src/app/dashboard/residents/page.tsx),
  using the `apiDownload` helper
  ([api.ts](../frontend-web/src/lib/api.ts)) established in
  Task 0032/0037/0041 — pass the current search box value as the
  `search` query param (decision #3).
- Full kk/ru/en i18n parity for the new button/label.

---

## Acceptance criteria

- The exported CSV contains one row per verified ownership, matching
  exactly what the on-screen registry (filtered by the current search
  term, if any) shows — no drift between screen and file.
- UTF-8 BOM present, Cyrillic renders correctly, a comma-containing name
  doesn't corrupt the CSV structure.
- Role gating matches the existing registry endpoint exactly.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`
  and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- Exporting pending (unverified) ownership requests — this is the
  *confirmed* registry export only, matching the page it's attached to.
- Mobile UI — residents-registry management has stayed web-only
  throughout this project.
- Any change to `getConfirmedResidents`'s existing behavior or response
  shape — this task only adds a new export path alongside it.

## Deliverable

- Backend and web can ship as separate commits.
- PR description explicitly states that ИИН is included in the exported
  file (decision #5) and confirms the UTF-8 BOM/Cyrillic verification,
  same expectation every prior CSV export task in this project has set.

---

## Review addendum (2026-09-11) — accepted, no issues found

**Verified good:** `exportConfirmedResidentsCsv` calls
`getConfirmedResidents(tenantId, search)` internally rather than
re-deriving the query — decision #3's "no drift between screen and
file" guarantee holds structurally, not just by convention. Row
flattening is per-ownership (decision #2), proven with a
two-verified-units resident producing two distinct rows, each with that
unit's own block/area/share. ИИН is included as decided (decision #5).
UTF-8 BOM and comma-escaping in a resident's name are verified at the
byte/parse level, and unverified ownerships are confirmed absent from
the export. Web correctly forwards the current `searchQuery` to the
export endpoint via `apiDownload`. Role gating and
`assertUserBelongsToTenant` match the existing registry endpoint
exactly.

**Verified independently:** 426/426 backend tests pass, `tsc --noEmit`
clean in `backend/` and `frontend-web/`, full kk/ru/en parity
(1025/1025/1025 web keys). Task accepted, no fixes required.
