# Task 0042: Global quick-search across residents, requests, and accounts (web)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. Today `residents/page.tsx`, `requests/page.tsx`, and
`finance/page.tsx` each have their own **local, client-side-only**
`searchQuery` filter over data already loaded on that page — there's no
way to search across all three from one place, and no way to jump
straight to a match without first navigating to the right page and
re-typing the query. This task adds one search box in the dashboard
header that queries all three server-side and lets staff jump directly
to a filtered view of whichever page has the match.

**Researched, not guessed — the exact shape of what exists today.**
Confirmed all three target pages already have an identical pattern: a
`const [searchQuery, setSearchQuery] = useState('')` plus a client-side
`.filter()` over an already-fetched, unfiltered list
([residents/page.tsx:76](../frontend-web/src/app/dashboard/residents/page.tsx),
[requests/page.tsx:83](../frontend-web/src/app/dashboard/requests/page.tsx),
[finance/page.tsx:97](../frontend-web/src/app/dashboard/finance/page.tsx)).
None of the three has a per-record detail *route* — they're single-page
list views (confirmed via glob: no `residents/[id]`/`requests/[id]`
sub-routes exist). This means the correct way to "jump to a match" isn't
a new detail page — it's navigating to the existing list page with the
query pre-filled into that page's *existing* local search box.

### Architecture decisions already made — do not re-litigate

1. **A quick-search dropdown in the header, not a full search-results
   page.** Capped results per category (5 each), no pagination — this
   is a "find it fast and jump there" tool, not a new reporting surface.
   A full paginated cross-entity search page is a much bigger feature;
   not what's being asked for here.
2. **Reuse each target page's existing local search, don't build new
   detail routes.** Clicking a result navigates to
   `/dashboard/residents?q=...` / `/dashboard/requests?q=...` /
   `/dashboard/finance?q=...` — each of those three pages gets a small
   addition (read `q` from `useSearchParams()` on mount, seed the
   already-existing `searchQuery` state with it). This reuses 100% of
   each page's existing filter/render logic; no new pages, no new
   detail views.
3. **Accounts category only appears for roles that already see
   `/dashboard/finance` — no new authorization decision.** The finance
   nav entry is already gated to `SUPERADMIN`/`HOA_ADMIN`/`HOA_CHAIRMAN`
   ([layout.tsx:55](../frontend-web/src/app/dashboard/layout.tsx)).
   `DISPATCHER`/`SECURITY` calling the search endpoint simply get an
   empty `accounts` array, not a 403 — the endpoint itself is available
   to any staff role (residents/requests have no nav role restriction),
   it just conditionally includes the finance category server-side
   based on the caller's role, mirroring what they could already see by
   navigating to each page directly.
4. **Minimum query length of 2 characters, enforced server-side — the
   #1 way this task goes wrong.** `contains`-based (`mode: 'insensitive'`)
   filtering across three tables with no dedicated search index means a
   1-character query is a genuinely expensive, nearly-unbounded scan
   pattern, fired on every keystroke of a debounced input. Below the
   2-character threshold, return `{ residents: [], requests: [],
   accounts: [] }` immediately with **no database query at all** —
   don't error, just no-op, so the UI doesn't flash an error state while
   someone is mid-keystroke.
5. **Debounced client-side input (client's responsibility), not
   server-side rate limiting.** This project already uses
   `@nestjs/throttler` globally ([app.module.ts](../backend/src/app.module.ts))
   for abuse protection — a per-keystroke search doesn't need its own
   additional throttle rule, just a reasonable debounce (300ms) on the
   frontend so it isn't firing a request per keystroke in the first
   place.
6. **Web only, per the request that scoped this task.** Mobile staff
   screens already have their own per-screen lists
   ([Task 0026](0026-mobile-chat-inbox.md)/[Task 0027](0027-mobile-service-requests.md)) —
   a cross-entity quick-search is a web-dashboard-shaped tool, not a
   mobile one; not building a mobile equivalent here.

---

## Subtask A — Backend: search endpoint

New `backend/src/modules/search/` module:

- `SearchService.search(tenantId: string, user: UserContext, q: string)`:
  - Return `{ residents: [], requests: [], accounts: [] }` immediately
    if `q.trim().length < 2` (decision #4) — no query.
  - **Residents**: verified residents of the tenant whose
    `firstName`/`lastName`/`phone` contains `q` (insensitive) — same
    shape as `getConfirmedResidents` in
    [properties.service.ts](../backend/src/modules/properties/properties.service.ts)
    but capped `take: 5`. Return `{ id, firstName, lastName, phone,
    unitNumber }` (unit number from the first verified ownership, for
    display).
  - **Requests**: `serviceRequest` rows for the tenant whose
    `title`/`description` contains `q` (insensitive), capped `take: 5`,
    newest first. Return `{ id, title, status, createdAt }`.
  - **Accounts**: only queried when `user.role` is `SUPERADMIN`,
    `HOA_ADMIN`, or `HOA_CHAIRMAN` (decision #3) — `personalAccount`
    rows for the tenant whose `accountNumber` or unit's `unitNumber`
    contains `q`, capped `take: 5`. Return `{ id, accountNumber,
    unitNumber, balance }`.
  - Tenant-scope every query the same way the corresponding existing
    method already does (`getConfirmedResidents`/service-requests'
    tenant filter/`getTenantAccounts`) — don't invent a new tenant-check
    pattern for this endpoint.
- `SearchController`: `GET /search/tenants/:tenantId?q=` — no new
  `@Roles` restriction beyond `JwtAuthGuard` (any authenticated staff
  role can call it, per decision #3), `assertUserBelongsToTenant` for
  tenant isolation (staff cross-tenant rejected, `SUPERADMIN` bypasses,
  same as every other tenant-scoped endpoint in this codebase).

**Tests:** new `search.service.spec.ts` —
- `q` shorter than 2 characters returns all-empty result with **zero**
  Prisma calls (assert `findMany` was never called for any of the three
  models — proves decision #4's no-query short-circuit, not just an
  empty-array coincidence).
- A `DISPATCHER`/`SECURITY` search still returns residents/requests
  matches but an empty `accounts` array; a `HOA_ADMIN` search with the
  same `q` returns all three categories.
- Cross-tenant rejection via `assertUserBelongsToTenant`, `SUPERADMIN`
  bypass.
- Each category is capped at 5 even when more matches exist (seed 8+
  mock rows, assert exactly 5 returned).

## Subtask B — Web: header search box + dropdown

- New `frontend-web/src/components/GlobalSearch.tsx`, placed in
  [layout.tsx](../frontend-web/src/app/dashboard/layout.tsx)'s header
  next to the existing `NotificationBell` — reuse that component's
  popover/click-outside-to-close pattern
  ([NotificationBell.tsx](../frontend-web/src/components/NotificationBell.tsx))
  for visual/interaction consistency rather than inventing a new one.
- 300ms-debounced input (decision #5) calling
  `GET /search/tenants/:tenantId?q=`; dropdown grouped into three
  labeled sections (Жильцы / Заявки / Лицевые счета — the last section
  simply doesn't render when the response's `accounts` array is empty,
  which covers the role-based hiding from decision #3 with zero
  role-checking logic needed on the frontend).
  Show a "ничего не найдено" state only once `q.length >= 2` and the
  response actually came back empty — don't show it while `q` is still
  under the minimum length or a request is in flight.
- Clicking a result navigates to `/dashboard/residents?q=<query>` /
  `/dashboard/requests?q=<query>` / `/dashboard/finance?q=<query>`
  (decision #2) using the raw search text, not a record-specific ID —
  the target page's own existing filter will surface the same match(es).
- In each of `residents/page.tsx`, `requests/page.tsx`,
  `finance/page.tsx`: read `q` via `useSearchParams()` once on mount and
  call the page's existing `setSearchQuery(q)` if present — a 3-5 line
  addition per file, no other change to any of the three pages' existing
  search/filter/render logic.
- Full kk/ru/en i18n parity for all new text (new `globalSearch`
  namespace).

---

## Acceptance criteria

- Typing fewer than 2 characters never fires a request.
- A non-finance-role staff member's search never shows an accounts
  section; a finance-role staff member's does.
- Clicking a result lands on the correct existing page with that page's
  own search box already filled in and filtered.
- Tenant isolation matches every other tenant-scoped endpoint in this
  codebase (staff cross-tenant rejected, `SUPERADMIN` unrestricted).
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`
  and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- A full paginated/dedicated search-results page — decision #1.
- New detail routes/pages for an individual resident/request/account —
  decision #2, this task deliberately reuses existing list-page
  filtering instead.
- Full-text/fuzzy search, search ranking, or a dedicated search index
  (e.g. Postgres `tsvector`) — plain `contains` matching is consistent
  with every other search in this codebase
  (`searchTenants`/`getConfirmedResidents`) and sufficient at this
  data scale.
- Mobile — decision #6.
- Searching any entity beyond residents/requests/accounts (bookings,
  community-board listings, votings, etc.) — a follow-up if ever wanted,
  not this task.

## Deliverable

- Backend and web can ship as separate commits.
- PR description confirms the zero-Prisma-calls-below-minimum-length
  test result explicitly — this is the property most worth calling out
  given decision #4.

---

## Review addendum (2026-09-11) — accepted, no issues found

**Verified good:** the sub-2-character short-circuit is proven with zero
Prisma calls across four input variants (empty, one char, whitespace-
only, one char padded with whitespace), checked before any query fires
— exactly what decision #4 asked for. Role-based account visibility is
tested both ways (`DISPATCHER` gets residents+requests with an empty
`accounts` array and zero `personalAccount.findMany` calls; `HOA_ADMIN`
gets all three), and `assertUserBelongsToTenant` correctly runs *before*
the length check and any query, with a `SUPERADMIN` bypass test. The
`take: 5` cap is verified against 8-item mocks for all three categories
in one test. On the web side, `useSearchParams()` in each of
`residents/page.tsx`/`requests/page.tsx`/`finance/page.tsx` is
correctly isolated into a small `SearchParamsReader` subcomponent
wrapped in `<Suspense fallback={null}>` — confirmed by running
`npm run build` myself rather than trusting the report: all 22 pages
compiled and prerendered without error, which is exactly where a
missing Suspense boundary would have failed. `GlobalSearch.tsx`'s
dropdown correctly omits the accounts section purely by checking
`results.accounts.length > 0` — no duplicate role logic needed on the
frontend since the backend already omits the category. Debounce (300ms)
and loading-state sequencing avoid a "no results" flash while a request
is in flight.

**Verified independently:** 422/422 backend tests pass, `tsc --noEmit`
clean in both `backend/` and `frontend-web/`, `npm run build` clean in
`frontend-web/`, full kk/ru/en parity (1022/1022/1022 web keys). Task
accepted, no fixes required.
