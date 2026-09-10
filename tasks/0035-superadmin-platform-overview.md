# Task 0035: SUPERADMIN — platform-wide cross-tenant overview dashboard

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. [Task 0023](0023-platform-tenant-onboarding.md) gave
SUPERADMIN a way to create tenants and their first admin account
(`frontend-web/src/app/dashboard/tenants/page.tsx`), but that page only
lists tenants with static info (name, address, building/unit counts) —
it has no live operational signal. Today a SUPERADMIN who wants to know
"which ЖК has an active SOS alert right now" or "how much unpaid debt
exists across the whole platform" has no way to see that without opening
each tenant's own analytics page one at a time
([analytics.controller.ts](../backend/src/modules/analytics/analytics.controller.ts)'s
existing endpoints are all `tenants/:tenantId/...`, tenant-scoped by
design). This task adds one cross-tenant aggregate view.

### Architecture decisions already made — do not re-litigate

1. **SUPERADMIN only — this is the #1 way this task goes wrong.**
   [analytics.controller.ts](../backend/src/modules/analytics/analytics.controller.ts)'s
   class-level decorator is
   `@Roles(SUPERADMIN, HOA_ADMIN, HOA_CHAIRMAN)` — correct for every
   existing tenant-scoped endpoint, where `assertStaffAccess` further
   confirms the caller actually belongs to *that* tenant. A cross-tenant
   endpoint has no such per-tenant check to fall back on, so if it
   inherits the class-level roles, **any HOA_ADMIN/HOA_CHAIRMAN in any
   single ЖК would see every other ЖК's aggregate data** — a real
   cross-tenant data leak, not a theoretical one. The new endpoint must
   carry its own method-level `@Roles(UserRole.SUPERADMIN)`, which
   `RolesGuard` (via `Reflector.getAllAndOverride`, confirmed in
   [roles.guard.ts](../backend/src/common/guards/roles.guard.ts)) applies
   *instead of*, not in addition to, the class-level set. On top of that,
   re-check `user.role !== SUPERADMIN` at the top of the new service
   method itself and throw — the same defense-in-depth pattern
   `assertStaffAccess` already uses for tenant-scoped calls (don't rely
   on the controller guard alone, exactly as this codebase already
   doesn't elsewhere).
2. **Aggregate via `groupBy`, not a per-tenant loop — the #2 way this
   goes wrong.** With N tenants, looping `for (const tenant of tenants)`
   and firing 3-4 queries per iteration is an N+1 pattern that gets
   slower every time a new ЖК is onboarded — exactly the kind of thing
   that works fine in dev with 2 test tenants and quietly degrades in
   production. Use `groupBy(['tenantId'])` aggregate queries (one query
   per metric, covering all tenants at once — e.g.
   `prisma.sosAlert.groupBy({ by: ['tenantId'], where: { status: 'ACTIVE' }, _count: true })`)
   and merge the results with the tenant list in memory. Same principle
   [Task 0021](0021-scheduled-charge-generation.md) already applies for
   per-tenant cron isolation, just applied to read queries here.
3. **Extend the existing `tenants/page.tsx`, don't create a new nav
   entry.** The per-tenant breakdown (which ЖК has active SOS / open
   requests / debt) is naturally additional badges on the tenant cards
   that page already renders — see
   [Task 0027](0027-mobile-service-requests.md)'s precedent of extending
   an existing screen instead of forking a new one when the underlying
   data serves the same audience. Global platform totals go in a small
   stat-cards row above the existing tenant grid on the same page. No
   new sidebar link, no new route.
4. **Read-only, no new real-time wiring.** Same reasoning as
   [Task 0033](0033-in-app-notification-center.md) decision #3 — fetch
   on page load/refresh (this page already has a manual refresh button),
   not a new WebSocket room. A platform admin refreshing this page
   occasionally is a materially different use case from a resident
   needing an instant SOS ping.
5. **"Open" service requests = not `RESOLVED`/`REJECTED`/`CLOSED`.**
   Matches every other place in this codebase that treats those three
   `RequestStatus` values as terminal (e.g.
   [analytics.service.ts](../backend/src/modules/analytics/analytics.service.ts)'s
   `getRequestsAnalytics` treats `RESOLVED`/`CLOSED` as resolution
   states for its average-time calculation) — don't invent a different
   definition of "open" for this one dashboard.
6. **Outstanding debt = sum of negative `PersonalAccount.balance`,
   platform-wide.** Same sign convention already established
   (`balance < 0` = debt, per
   [Task 0032](0032-finance-analytics-csv-export.md)'s debtor query) —
   just summed across all tenants instead of filtered to one.

---

## Subtask A — Backend: platform overview endpoint

In [analytics.service.ts](../backend/src/modules/analytics/analytics.service.ts),
add `getPlatformOverview(user: RequestUser)`:

- Re-check `user.role !== UserRole.SUPERADMIN` at the top and throw
  `ForbiddenException({ code: 'ANALYTICS.PLATFORM_ACCESS_FORBIDDEN', message: '...' })`
  if not (decision #1's defense-in-depth check).
- Compute, across **all** tenants (no `tenantId` filter anywhere in this
  method):
  - `tenantsCount` — `prisma.tenant.count()`.
  - `totalResidentsCount` / `verifiedResidentsCount` — `User` rows with
    `role in [RESIDENT_OWNER, RESIDENT_TENANT]`, grouped by `tenantId`
    (one `groupBy` for total, one for `isVerified: true`), per decision
    #2.
  - `activeSosAlertsCount` (platform total) + a per-tenant breakdown —
    `sosAlert.groupBy({ by: ['tenantId'], where: { status: 'ACTIVE' }, _count: true })`.
  - `openServiceRequestsCount` (platform total) + per-tenant breakdown —
    `serviceRequest.groupBy({ by: ['tenantId'], where: { status: { notIn: ['RESOLVED', 'REJECTED', 'CLOSED'] } }, _count: true })`
    (decision #5).
  - `totalOutstandingDebt` (platform total, as a positive number
    representing total debt) + per-tenant breakdown — aggregate
    `personalAccount` where `balance: { lt: 0 }`, grouped by the owning
    tenant via the unit→building→tenant chain (decision #6). Note
    `PersonalAccount` doesn't carry `tenantId` directly — it's reached
    through `unit.building.tenantId` (same join path
    `getFinanceAnalytics` already uses); `groupBy` can't traverse that
    relation directly, so either denormalize via a raw aggregation
    query, or fetch the debt accounts with their building's `tenantId`
    included and reduce in memory — either is fine, but don't do it
    per-tenant in a loop (decision #2 still applies to *how* you compute
    it, even though this one metric needs a slightly different query
    shape than the other two).
  - Fetch the tenant list (`id`, `name`) once, then merge every
    `groupBy` result onto it in memory to build a
    `tenants: PlatformTenantSummary[]` array — one entry per tenant with
    zero-filled defaults for any tenant absent from a given `groupBy`
    result (a tenant with no active SOS alerts won't appear in that
    `groupBy` output at all — don't let that silently produce
    `undefined` instead of `0`).
- Add `PlatformOverviewResponse` and `PlatformTenantSummary` types to
  [analytics.dto.ts](../backend/src/modules/analytics/dto/analytics.dto.ts).

In [analytics.controller.ts](../backend/src/modules/analytics/analytics.controller.ts):

- `GET /analytics/platform/overview`, method-level
  `@Roles(UserRole.SUPERADMIN)` (decision #1 — this is the line that
  actually prevents the leak, don't skip it even though it looks
  redundant next to the class-level decorator).

**Tests:** extend `analytics.service.spec.ts` —
- A non-SUPERADMIN calling `getPlatformOverview` is rejected even if the
  test bypasses the controller guard entirely (proves the service-level
  check, not just the controller's, per decision #1).
- Seed/mock 2+ tenants with different SOS/request/debt counts; assert
  the per-tenant breakdown attributes each count to the correct tenant
  and platform totals equal the sum across tenants.
- Assert the mocked Prisma client's `groupBy` methods are each called
  **exactly once** regardless of tenant count (e.g. via
  `expect(prismaMock.sosAlert.groupBy).toHaveBeenCalledTimes(1)`) — a
  concrete proof against the N+1 pattern decision #2 warns about,
  matching the style of Task 0032's "uncapped query" proof test.
- A tenant with zero active SOS alerts / zero open requests / zero debt
  still appears in the `tenants` array with explicit `0` values, not
  omitted or `undefined`.

## Subtask B — Web: extend the tenants page

In [tenants/page.tsx](../frontend-web/src/app/dashboard/tenants/page.tsx):

- Fetch `GET /analytics/platform/overview` alongside the existing
  `fetchTenants()` call.
- Add a row of 4-5 compact stat cards above the tenant grid: total ЖК,
  total residents (verified/total), active SOS alerts (platform-wide),
  open requests (platform-wide), total outstanding debt (₸). If active
  SOS alerts > 0, make that card visually distinct (e.g. red/amber,
  matching the urgency styling already used elsewhere for SOS in this
  codebase) — it's the one number on this page that means "something
  needs attention right now."
- On each existing tenant card, add the per-tenant numbers from the
  `tenants` breakdown: residents count, an active-SOS badge (only shown
  when > 0, red, matching the platform card's urgency styling), open
  requests count, outstanding debt. Keep the existing card layout —
  these are additions, not a redesign.
- Full kk/ru/en i18n parity for all new text (extend the existing
  `tenants` namespace).

---

## Acceptance criteria

- `GET /analytics/platform/overview` returns 403 for HOA_ADMIN and
  HOA_CHAIRMAN accounts (even though the controller class allows them
  for every *other* analytics route) — this is the one behavior this
  task must never regress.
- Platform totals equal the sum of the per-tenant breakdown, verified by
  a test with 2+ tenants carrying different values.
- No N+1 query pattern — verified by the exactly-once `groupBy` call
  count assertions.
- The tenants page shows live platform + per-tenant operational signals
  without a new nav entry or new route.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`
  and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- Mobile UI — platform/SUPERADMIN administration has stayed web-only
  throughout this project (Task 0023 included), consistent with the
  established mobile-vs-web staff split in
  [PROGRESS.md](PROGRESS.md).
- Historical trends/charts for platform totals (e.g. "SOS alerts over
  time across all ЖК") — this is a live-snapshot dashboard, not a new
  analytics/reporting subsystem. A follow-up task if actually wanted.
- CSV export of the platform overview — the existing per-tenant finance
  export (Task 0032) already covers the accounting use case; this
  dashboard is an operational glance, not a report artifact.
- Per-tenant drill-down navigation from a stat card directly into that
  tenant's own analytics page — nice-to-have, not required; skip unless
  trivial once the data is in place.

## Deliverable

- Backend and web can ship as separate commits.
- PR description confirms the 403-for-non-SUPERADMIN test result
  explicitly — this is the property most worth calling out given
  decision #1.

---

## Review addendum (2026-09-10) — needs fix: field-name mismatch on the tenant card

**Verified good:** everything on the backend. `getPlatformOverview`
re-checks `user.role !== SUPERADMIN` inside the service itself (decision
#1's defense-in-depth), and the controller's method-level
`@Roles(UserRole.SUPERADMIN)` correctly overrides the class-level
`@Roles(SUPERADMIN, HOA_ADMIN, HOA_CHAIRMAN)` — confirmed via
`Reflector.getAllAndOverride` in `roles.guard.ts`, and proven by a test
that runs all four non-SUPERADMIN roles (`HOA_ADMIN`, `HOA_CHAIRMAN`,
`DISPATCHER`, resident) through `getPlatformOverview` directly and
asserts `ForbiddenException` with `ANALYTICS.PLATFORM_ACCESS_FORBIDDEN`
for each. Aggregation uses exactly one `groupBy` per metric
(`user` ×2, `sosAlert`, `serviceRequest`) plus one `findMany` for debt
accounts and one for the tenant list — no N+1, verified both by reading
the code and by a dedicated test asserting each is called exactly once
regardless of tenant count (4 tenants in the test fixture). A
zero-activity tenant correctly appears in the `tenants` array with
explicit `0`s, not omitted. Platform totals are proven to equal the sum
of per-tenant breakdowns in the multi-tenant test. Re-ran the suite
independently: 327/327 backend tests pass, `tsc --noEmit` clean in
`backend/` and `frontend-web/`, full kk/ru/en parity (958/958/958 web
keys).

**Found — real bug, not a false positive:** in
[tenants/page.tsx](../frontend-web/src/app/dashboard/tenants/page.tsx),
the frontend's local `PlatformTenantSummary` interface (line 44) names
the per-tenant resident-count field `residentsCount`, but the backend's
actual `PlatformTenantSummary` (in
[analytics.dto.ts](../backend/src/modules/analytics/dto/analytics.dto.ts))
— and the controller's real JSON response — names it
`totalResidentsCount`. The per-tenant card (line 596) reads
`tenantOverview.residentsCount`, which will be `undefined` for every
tenant, rendering as e.g. "8 / undefined" instead of "8 / 10" in the
resident-count line of every tenant card. This isn't caught by
`tsc --noEmit` because the frontend interface is a hand-written type
assertion over `apiRequest<PlatformOverview>(...)`'s parsed JSON, not
validated against the backend's actual shape — exactly the kind of gap
that only shows up by tracing field names by hand or exercising the UI,
which is why it's called out explicitly here rather than assumed caught
by the clean typecheck above. (The top-level `platformOverview.totalResidentsCount`
used at line 382 for the platform-wide stat card is correctly named —
only the nested per-tenant field is wrong.)

**Required fix:** rename `residentsCount` → `totalResidentsCount` in the
frontend's `PlatformTenantSummary` interface (line 44) and its one usage
site (line 596), matching the backend's actual field name — the backend
naming is the one to keep since it's already consistent with the
top-level field of the same name.

**Resolution (2026-09-10):** Fixed. `PlatformTenantSummary.residentsCount` renamed to `totalResidentsCount` in `tenants/page.tsx` interface and usage site in the card JSX. `npx tsc --noEmit` clean (0 errors), 327/327 backend tests pass.
