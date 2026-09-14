# Task 0062: Guest pass history CSV export

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[access-control.service.ts:831-872](../backend/src/modules/access-control/access-control.service.ts#L831-L872):**
`getGuestPassesForTenant` already serves the full, **unbounded**
history of every `GuestPass` for a tenant (join path
`unit.building.tenantId`, confirmed in
[schema.prisma](../backend/prisma/schema.prisma) — `GuestPass` has no
`tenantId` column of its own), computing a derived
`status` (`ACTIVE`/`USED`/`EXPIRED`/`REVOKED`) via the existing
`computeGuestPassStatus` helper. There's no way to get this data out
of the app today for handing to an ЖК's board or reviewing after an
incident (e.g. "who approved guest access to Building 3 last month").

**Important distinction from the JSON list endpoint it's built next
to:** `getGuestPassesForTenant` is deliberately unbounded (a staff
member browsing the live history view wants to scroll everything).
`GuestPass` is a continuously-growing log exactly like `AccessLog`
([Task 0037](0037-access-log-csv-export.md)) — new rows are created
every time any resident issues a guest pass, with no natural upper
bound. **The CSV export must NOT reuse the unbounded query as-is** —
it needs the same mandatory-by-default date-range discipline
[Task 0037](0037-access-log-csv-export.md)'s access-log export
established for exactly this class of data, even though the sibling
JSON endpoint it's modeled on doesn't have one. Don't copy the missing
bound along with the query shape.

### Architecture decisions already made — do not re-litigate

1. **Lives in `access-control.service.ts`/`access-control.controller.ts`**
   — same module as every existing guest-pass method
   (`getGuestPassesForTenant`, `getGuestPassesForUnit`,
   `revokeGuestPass`) and the access-log CSV export precedent
   ([Task 0037](0037-access-log-csv-export.md)), not `analytics`.
2. **Bounded by mandatory-by-default `from`/`to`, default last 30
   days** — per the Context section. Same pattern
   `exportAccessLogsCsv` already uses in this exact file.
3. **Reuse the exact role gate `getGuestPassesForTenant` already
   uses** — `[HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SECURITY,
   SUPERADMIN]` (confirmed in
   [access-control.controller.ts:95-102](../backend/src/modules/access-control/access-control.controller.ts#L95-L102)),
   plus `assertUserBelongsToTenant`. Don't narrow or widen it.
4. **Reuse `computeGuestPassStatus` for the CSV's status column** —
   it's already a shared, tested method on this same service; don't
   reimplement the ACTIVE/USED/EXPIRED/REVOKED logic inline.
5. **CSV convention: `buildCsv`, UTF-8 BOM, header rows naming the ЖК
   and period** — same shape every prior CSV export in this project
   uses.

---

## Subtask A — Backend: export endpoint

In [access-control.service.ts](../backend/src/modules/access-control/access-control.service.ts),
add `exportGuestPassesCsv(tenantId, user, query?: { from?: string; to?: string })`:

- `assertUserBelongsToTenant` (decision #3), resolve `from`/`to`
  (decision #2, default last 30 days — same resolution logic
  `exportAccessLogsCsv` already uses in this file).
- Fetch the tenant name (for the CSV header), then `guestPass.findMany`
  scoped to `unit.building.tenantId` **and** `createdAt: { gte: from,
  lte: to }` (decision #2) — same `include` shape
  `getGuestPassesForTenant` already uses (`creator`, `revokedBy`,
  `unit.building`).
- Build CSV via `buildCsv`: columns Дата создания, Гость (ФИО),
  Номер авто, Квартира/Помещение, Блок/Подъезд, Кем создан (ФИО),
  Действителен с, Действителен по, Статус, Кем отозван (ФИО), Дата
  отзыва. Status column via `computeGuestPassStatus` (decision #4),
  translated to Russian labels (Активен/Использован/Истёк/Отозван).
  Header rows with ЖК name and period.
- Filename `guest-passes-${tenantId}-${fromDateStr}_${toDateStr}.csv`.

In [access-control.controller.ts](../backend/src/modules/access-control/access-control.controller.ts):

- `GET /access/tenant/:tenantId/guest-passes/export?from=&to=`, same
  `@Roles(HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SECURITY, SUPERADMIN)`
  as `getGuestPassesForTenant` right above it (decision #3), `@Res()`
  streaming with `Content-Disposition`.

**Tests:** extend `access-control.service.spec.ts` —
- A guest pass created outside the `from`/`to` range is excluded, one
  inside is included (proves the date filter — this is the one
  property that must NOT be skipped, since the sibling JSON endpoint
  has no equivalent test to copy from).
- Each of the four computed statuses (`ACTIVE`, `USED`, `EXPIRED`,
  `REVOKED`) renders its correct Russian label in the CSV.
- A resident and cross-tenant staff request are rejected (matches
  `getGuestPassesForTenant`'s existing role/tenant checks).
- Raw CSV bytes start with the UTF-8 BOM.
- Omitting `from`/`to` defaults to the last 30 days.

---

## Acceptance criteria

- The export is bounded by a mandatory-by-default date range — no
  unbounded query against an ever-growing log, unlike the JSON list
  endpoint it's modeled on.
- Status labels are computed via the existing shared
  `computeGuestPassStatus`, not reimplemented.
- Role gate matches `getGuestPassesForTenant` exactly.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- A web download button — backend endpoint only, matching the staged
  approach of prior CSV export tasks.
- Any change to `getGuestPassesForTenant`'s own unbounded query — that
  endpoint is correct for its own purpose (a live history view); this
  task adds a separate, bounded export method rather than changing it.
- Mobile UI — guest pass management has stayed staff-web/resident-
  mobile split throughout, and this export is a staff-only tool.

---

## Deliverable

- Single backend commit.
- PR description confirms the date-range exclusion test result
  explicitly — that's the property most worth calling out given this
  task's central risk (silently copying the sibling endpoint's
  unbounded query).

---

## Review addendum (2026-09-14) — accepted, no issues found

- `exportGuestPassesCsv` added to `access-control.service.ts` (bounded by `from`/`to`, default last 30 days — date-range filter explicitly verified in tests).
- Controller route `GET /access/tenant/:tenantId/guest-passes/export` declared **before** the parameterless list route to avoid NestJS routing ambiguity. Same `@Roles` as `getGuestPassesForTenant`.
- Status column computed via existing `computeGuestPassStatus` — no inline reimplementation.
- 7 new tests in `access-control.service.spec.ts`. Spec confirms: date-range exclusion fires correct Prisma `where.createdAt` clause; all four Russian status labels (Активен/Использован/Истёк/Отозван) appear; cross-tenant staff rejected; SUPERADMIN unrestricted; UTF-8 BOM present; 30-day default window; filename pattern correct.
- Full backend test suite: **549/549** ✅ · `tsc --noEmit` clean ✅
