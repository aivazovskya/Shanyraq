# Task 0003: Residents registry in the web panel (ТЗ §4.2)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

[PRODUCT_SPEC.md](PRODUCT_SPEC.md) §4.2 requires: *"База жильцов по квартирам,
привязка ролей (собственник/арендатор); верификация новых регистраций"*.

Today, [verifications/page.tsx](../frontend-web/src/app/dashboard/verifications/page.tsx)
covers the second half (the pending-verification queue) via
`GET /properties/tenants/:tenantId/pending-verifications` and
`PATCH /properties/ownerships/:id/verify`. There is **no permanent registry**
of already-confirmed residents anywhere — once a claim is approved, that
resident disappears from staff's view entirely unless they open the database
directly. See [PROGRESS.md](PROGRESS.md).

This task adds that missing registry: a searchable list of confirmed
residents per tenant, a detail view per resident, and two management actions
staff currently have no way to perform at all: deactivating a resident's
account (moved out, access revoked) and unlinking a specific unit from a
resident (sold the apartment, ownership record was wrong).

**Explicitly out of scope:** manually creating a resident/ownership from the
staff side (i.e. staff adding someone who never self-registered via the app).
The only way a resident enters the system today is self-claim + verify
([ClaimUnitScreen.tsx](../mobile/src/screens/onboarding/ClaimUnitScreen.tsx) →
verifications page), and this task doesn't change that entry point — it only
adds visibility/management for residents who already went through it. Don't
build a "create resident manually" form.

---

## Subtask A — Backend: registry + management endpoints

Add to [properties.service.ts](../backend/src/modules/properties/properties.service.ts)
and [properties.controller.ts](../backend/src/modules/properties/properties.controller.ts).
Follow the exact same authorization pattern already used by
`getPendingVerifications`/`verifyOwnership` in this file: `@Roles(HOA_ADMIN,
HOA_CHAIRMAN, DISPATCHER, SUPERADMIN)` + `assertUserBelongsToTenant()` for
tenant isolation (import from
[tenant.guard.ts](../backend/src/common/guards/tenant.guard.ts), same as the
existing `getPendingVerifications` controller method does).

1. **`GET /properties/tenants/:tenantId/residents`** — list confirmed
   residents of the tenant. "Confirmed" means: has at least one
   `UnitOwnership` with `isVerified: true` in a unit belonging to this
   tenant. One row per user, with their verified ownerships nested (a
   resident can own/rent more than one unit). Optional `?search=` query
   param filtering by first/last name, phone, or unit number
   (case-insensitive `contains`, same style as `searchTenants` in this same
   file). Include `isActive` on the user so the frontend can show
   active/deactivated status.

2. **`GET /properties/tenants/:tenantId/residents/:userId`** — single
   resident detail: user fields (name, phone, email, iin, isActive,
   isVerified, createdAt) + all their `UnitOwnership` records in this tenant
   (verified and unverified — unverified ones show as "pending" in the
   detail view, useful context even though they're primarily managed via the
   existing verifications page). Enforce the same tenant-isolation check —
   404 or 403 if the user has no verified ownership in this tenant (don't
   leak existence of residents from other tenants).

3. **`PATCH /properties/residents/:userId/status`**, body `{ isActive:
   boolean }` — activate/deactivate a resident's account. Tenant-scoped
   (verify the target user's `tenantId` matches the acting staff member's
   tenant, `SUPERADMIN` excepted — same pattern as `verifyOwnership`).
   Reject if the target user's role is not `RESIDENT_OWNER` or
   `RESIDENT_TENANT` (staff cannot deactivate other staff through this
   endpoint — that's a different, more sensitive operation not in scope
   here). Setting `isActive: false` already fully cuts off API access today
   via the existing check in
   [jwt.strategy.ts](../backend/src/modules/auth/jwt.strategy.ts)
   (`if (!user || !user.isActive) throw new UnauthorizedException(...)`) —
   no other module needs to change.

4. **`DELETE /properties/ownerships/:id`** — unlink a *verified* ownership
   record (resident sold/moved out of that specific unit). Tenant-scoped via
   the ownership's unit → building → tenant chain, same check style as
   `verifyOwnership`. If this was the resident's only ownership in the
   tenant, that's fine — they simply stop appearing in the registry list,
   no cascading changes needed (votes/service-requests/guest-passes
   reference `userId`/`unitId` directly and stay as historical records,
   confirmed by reading those models in
   [schema.prisma](../backend/prisma/schema.prisma)). Do **not** touch
   `isVerified: false` records here — those belong to the reject flow that
   already exists in `verifyOwnership`.

**Acceptance criteria:**
- Staff sees only residents of their own tenant; `SUPERADMIN` can pass any
  tenant.
- A resident with two verified units in the same tenant appears once, with
  both units listed.
- Deactivating a resident immediately blocks their next API call requiring
  auth (covered by the existing `jwt.strategy.ts` check — write a test
  confirming `isActive: false` round-trips correctly through the new PATCH,
  not a new auth test).
- Unlinking an ownership removes it from the registry but doesn't touch the
  resident's other units or their historical votes/requests.
- New `properties.service.spec.ts` (check whether one already exists; if
  not, this is another module joining the pattern from Task 0001 — write
  one) covering: search filtering, tenant isolation on all three new
  read/write paths, rejecting deactivation of a non-resident role, rejecting
  unlink of an unverified ownership.

---

## Subtask B — Frontend: residents page

New page at `frontend-web/src/app/dashboard/residents/page.tsx`, following
the exact structure/conventions of
[verifications/page.tsx](../frontend-web/src/app/dashboard/verifications/page.tsx)
(same `apiRequest`/`getStoredSession` helpers from
[lib/api.ts](../frontend-web/src/lib/api.ts), same table styling, same
loading/error/action-message state pattern — don't introduce a new UI
pattern for this one page).

- Table columns: ФИО, телефон, квартиры (chips/badges, one per unit —
  e.g. "Кв. 42 (Блок А)"), тип владения, статус аккаунта (Активен/Деактивирован
  badge), действия.
- Search box filtering by name/phone/unit (same debounce-free
  client-triggers-server-search pattern as elsewhere, or client-side filter
  over the loaded page — match whatever `verifications/page.tsx` already
  does for consistency rather than introducing pagination machinery that
  doesn't exist yet anywhere else in this app).
- Row click or an explicit "Детали" action opens a detail view (modal or
  drawer — reuse whatever modal pattern already exists in this codebase,
  e.g. check [access/page.tsx](../frontend-web/src/app/dashboard/access/page.tsx)
  for an existing modal if one is there) showing full resident info and the
  list of their units with a per-unit "Отвязать квартиру" action (calls the
  new `DELETE /properties/ownerships/:id`, with a `confirm()` guard exactly
  like `handleReject` does in `verifications/page.tsx`).
- "Деактивировать"/"Активировать" toggle button per resident row or in the
  detail view, calling the new PATCH endpoint, with a `confirm()` guard on
  deactivation (irreversible-feeling action from an admin's perspective,
  even though it can be undone).
- Add a nav entry in
  [dashboard/layout.tsx](../frontend-web/src/app/dashboard/layout.tsx)'s
  `navigation` array: `{ name: 'Жильцы', href: '/dashboard/residents', icon: Users }`
  (import `Users` from `lucide-react`), placed after "Верификация прав" so
  the two related pages sit next to each other in the sidebar.

**Acceptance criteria:**
- Page loads the registry for the logged-in staff member's own tenant (from
  `getStoredSession()`, same as `verifications/page.tsx` does).
- Search narrows the visible rows.
- Deactivate/activate and unlink actions work end-to-end against the new
  endpoints and refresh the list afterward (same `await load...()` pattern
  used after approve/reject in the verifications page).
- Sidebar nav shows the new "Жильцы" entry.

## Deliverable

- Subtasks A and B in one PR (or two commits), passing `npm test` in
  `backend/` and `npx tsc --noEmit` in both `backend/` and `frontend-web/`.
- PR description noting any deviation from this spec and the reasoning.
