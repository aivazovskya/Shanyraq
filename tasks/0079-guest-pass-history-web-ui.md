# Task 0079: Web view of guest pass history (read-only) + CSV export button

**Status:** Done
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. **This task deliberately reverses part of two prior
explicit decisions — read this before touching anything:**

- [Task 0044](0044-guest-pass-history-and-revocation.md) decision #1
  stated guest passes are "mobile only... no web page for guest passes
  exists at all... rather than introducing a new web surface for a
  feature that has never had one."
- [Task 0062](0062-guest-pass-history-csv-export.md) shipped
  `exportGuestPassesCsv` with "a web download button" explicitly listed
  under "Explicitly out of scope."

**The user has now explicitly asked for a web surface**, scoped
deliberately narrow: **read-only history view + the CSV export
button only.** Revoking a pass from the web is explicitly **not**
part of this task (that stays a mobile-only action, per Task 0044) —
don't add a revoke button here just because the data is visible; that
would silently re-expand scope beyond what was asked.

**Confirmed by reading
[access-control.controller.ts:95-134](../backend/src/modules/access-control/access-control.controller.ts#L95-L134)
and
[access-control.service.ts:831-872](../backend/src/modules/access-control/access-control.service.ts#L831-L872):**
- `GET /access/tenant/:tenantId/guest-passes` — `@Roles(HOA_ADMIN,
  HOA_CHAIRMAN, DISPATCHER, SECURITY, SUPERADMIN)`, returns every
  `GuestPass` for the tenant (unbounded, newest first), each with:
  `id`, `guestName`, `guestPlateNumber`, `accessCode`, `validFrom`,
  `validTo`, `isUsed`, `isRevoked`, `revokedAt`, `createdAt`,
  `creator: { id, firstName, lastName, role }`, `revokedBy: { id,
  firstName, lastName, role } | null`, `unit: { id, unitNumber,
  building: { id, blockName } }`, and a computed `status` (`'ACTIVE' |
  'USED' | 'EXPIRED' | 'REVOKED'`, precedence established in Task
  0044).
- `GET /access/tenant/:tenantId/guest-passes/export?from=&to=` — same
  exact role list, defaults to the last 30 days when `from`/`to` are
  omitted (Task 0062 decision #2), streams a CSV.
- Both endpoints are already fully tested and live — this task adds
  **zero backend code**, purely a new frontend page consuming what
  already exists.

**Confirmed by reading
[frontend-web/src/app/dashboard/access/page.tsx](../frontend-web/src/app/dashboard/access/page.tsx)
and
[bookings/waitlist/page.tsx](../frontend-web/src/app/dashboard/bookings/waitlist/page.tsx)
(Task 0076):** `/dashboard/access` is a single long-scroll page (access
points management + access log, no in-page tabs). The more recent,
better-established convention for "a new staff report that doesn't fit
an existing page" is Task 0076's — a **separate routed page**, linked
from the parent page via a header button, not a section jammed into
an already-large existing page. This task follows that newer
precedent.

### Architecture decisions already made — do not re-litigate

1. **New page `/dashboard/access/guest-passes`**, linked from
   [access/page.tsx](../frontend-web/src/app/dashboard/access/page.tsx)
   via a header button (same `Link` + icon pattern as every other
   cross-page nav button in this project — e.g. `bookings/page.tsx`'s
   "Лист ожидания" button added in Task 0076), visible to the same
   role set gating the rest of that page's staff-only sections.
2. **Read-only — no revoke button, no create form.** This page only
   calls `GET /access/tenant/:tenantId/guest-passes` and the export
   endpoint. Revocation stays exclusively on
   [StaffGuestPassScreen.tsx](../mobile/src/screens/staff/StaffGuestPassScreen.tsx)
   (mobile), per this task's own framing above — don't add a `PATCH
   .../revoke` call here.
3. **CSV export button reuses the existing `apiDownload` helper**
   ([lib/api.ts:139-142](../frontend-web/src/lib/api.ts#L139-L142)),
   same pattern as every button added in
   [Task 0078](0078-csv-export-download-buttons.md) — add a simple
   `from`/`to` date-range filter (mirroring
   [access/page.tsx](../frontend-web/src/app/dashboard/access/page.tsx)'s
   own existing `logFrom`/`logTo` state for the access log section)
   feeding both the on-screen list's client-side filtering **and** the
   export's `from`/`to` query params, so the downloaded file matches
   what's currently filtered on screen — same principle
   [Task 0053](0053-booking-resource-utilization-analytics.md)'s/
   [Task 0077](0077-booking-utilization-csv-export.md)'s analytics
   export buttons already established. Note: `getGuestPassesForTenant`
   itself has no server-side date filter (it's unbounded per Task
   0062's own context section) — so list filtering by `from`/`to` must
   happen **client-side** on the already-fetched array; only the
   export call sends `from`/`to` to the server.
4. **Status badge colors and Russian role labels mirror the mobile
   screen's existing conventions** — reuse the same four-state
   (`ACTIVE`/`USED`/`EXPIRED`/`REVOKED`) → badge-variant mapping
   `StaffGuestPassScreen.tsx` already uses (check its exact color
   choices and copy them, don't invent a new palette for the same
   four states).
5. **`accessCode` is shown on screen** — it's already returned by the
   existing JSON endpoint and already visible to staff on the mobile
   equivalent screen; this task doesn't change what data is exposed to
   which roles, only adds a second place (web) to view the same
   already-authorized data.
6. **Full kk/ru/en i18n parity**, new `access.guestPassHistory.*`
   namespace (or similar — don't scatter into unrelated existing
   `access.*` keys), matching every prior task's i18n discipline.

---

## Subtask A — Web page

- New page
  [frontend-web/src/app/dashboard/access/guest-passes/page.tsx](../frontend-web/src/app/dashboard/access/guest-passes/page.tsx):
  - Fetch `GET /access/tenant/${tenantId}/guest-passes` on load.
  - `from`/`to` date filter UI (decision #3) filtering the fetched
    list client-side.
  - Table/list: guest name, plate number, unit + block, valid
    from–to, status badge (decision #4), creator name/role, revoked-by
    name (if applicable) + revoked-at.
  - "Скачать CSV" button using `apiDownload` against the export
    endpoint with the current `from`/`to` filter values (decision #3).
  - Empty state when no passes exist / none match the current filter.
- Add the nav button on
  [access/page.tsx](../frontend-web/src/app/dashboard/access/page.tsx)
  per decision #1.
- Full kk/ru/en i18n parity per decision #6.

---

## Acceptance criteria

- The page shows the tenant's full guest-pass history (client-filtered
  by the on-screen date range), matching what
  `getGuestPassesForTenant` already returns.
- The CSV download produces a real file scoped to the currently
  selected `from`/`to` range.
- No revoke action exists anywhere on this new page.
- Visible only to `HOA_ADMIN`/`HOA_CHAIRMAN`/`DISPATCHER`/`SECURITY`/`SUPERADMIN`
  (matches both underlying endpoints' role gates — no new backend
  authorization decision needed since none of this task's calls
  require one).
- `npx tsc --noEmit` clean in `frontend-web/`; full kk/ru/en i18n
  parity maintained.

## Explicitly out of scope

- Revoking a pass from the web — decision #2, stays mobile-only.
- Any backend change — both endpoints this page consumes already
  exist and are already tested; this task is frontend-only.
- Creating/issuing a guest pass from the web — that flow has also
  always been mobile-only (Task 0002/0028) and isn't part of this
  task's scope either.

## Deliverable

- Single frontend commit.
- PR description confirms the page was manually loaded as at least one
  of the five allowed roles and that the downloaded CSV matches the
  on-screen filtered list.
