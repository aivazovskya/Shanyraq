# Task 0078: Web download buttons for 5 existing CSV export endpoints

**Status:** Done
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ cleanup. **Researched, not guessed — confirmed directly by
reading every controller/service/page involved.** This project has
shipped a long series of backend-only CSV export endpoints, each one
explicitly deferring its web download button as a separate,
never-created follow-up task:
[Task 0055](0055-meter-readings-csv-export.md) (meter readings),
[Task 0056](0056-sos-alerts-csv-export.md) (SOS alerts),
[Task 0059](0059-dispatcher-chat-transcript-export.md) (chat
transcript), [Task 0066](0066-announcement-history-csv-export.md)
(announcement history), and
[Task 0067](0067-voting-results-csv-export.md) (voting results —
that task's own file lists "a web download button" under "Explicitly
out of scope"). All five backend endpoints exist, are tested, and are
already reachable by `curl`/Postman — there is simply no button on
any of the five corresponding pages. This task closes that gap for
all five in one pass, reusing the exact download pattern this project
already established three times over (`analytics/page.tsx`'s finance/
activity/bookings-utilization buttons, and `access/page.tsx`'s
access-log button).

**A sixth candidate, guest-pass history export
([Task 0062](0062-guest-pass-history-csv-export.md)), is deliberately
excluded from this task** — see the note at the end of the Context
section. Don't add it here.

**Confirmed shared download helper —
[frontend-web/src/lib/api.ts:139-142](../frontend-web/src/lib/api.ts#L139-L142):**
```ts
export async function apiDownload(
  endpoint: string,
  fallbackFilename = 'report.csv',
): Promise<void>
```
Authenticated `fetch` with the Bearer token, handles a 401 by
redirecting to login, reads the real filename off the response's
`Content-Disposition` header (falling back to the second argument),
then triggers a Blob-URL download. Already used identically in
`analytics/page.tsx` (3×) and in
[access/page.tsx:162-181](../frontend-web/src/app/dashboard/access/page.tsx#L162-L181)
(`handleExportCsv`, for the Task 0037 access-log export) — that
`access/page.tsx` method is the exact template to copy for every one
of this task's five buttons: build a `URLSearchParams` from whatever
filter state the page already has, call `apiDownload(url,
fallbackFilename)`, track `exportingCsv`/`exportError` local state for
the button's own loading/error UI (don't reuse the page's main
`loading`/`error` state for this — the existing template deliberately
keeps them separate).

**Per-endpoint facts, confirmed by reading each controller/service:**

| # | Endpoint | Roles (`@Roles`) | Query params | Page to wire |
|---|---|---|---|---|
| 1 | `GET /meters/tenants/:tenantId/readings/export` — `meters.controller.ts:96-117` | `DISPATCHER, HOA_ADMIN, SUPERADMIN, HOA_CHAIRMAN` | `month`, `year` | [meters/page.tsx](../frontend-web/src/app/dashboard/meters/page.tsx) |
| 2 | `GET /sos/tenants/:tenantId/alerts/export` — `sos.controller.ts:86-104` | `SECURITY, DISPATCHER, HOA_ADMIN, HOA_CHAIRMAN, SUPERADMIN` | `from`, `to` | [sos/page.tsx](../frontend-web/src/app/dashboard/sos/page.tsx) |
| 3 | `GET /chat/conversations/:id/export` — `chat.controller.ts:95-101` | `DISPATCHER, HOA_ADMIN, SUPERADMIN` | none | [chat/page.tsx](../frontend-web/src/app/dashboard/chat/page.tsx) |
| 4 | `GET /announcements/tenant/:tenantId/export` — `announcements.controller.ts:28-45` | `HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SUPERADMIN` | `from`, `to` | [announcements/page.tsx](../frontend-web/src/app/dashboard/announcements/page.tsx) |
| 5 | `GET /votings/:meetingId/votes/export` — `votings.controller.ts:63-70` | `HOA_CHAIRMAN, HOA_ADMIN, SUPERADMIN` (**`DISPATCHER` deliberately excluded** — Task 0067 decision #1) | none | [votings/page.tsx](../frontend-web/src/app/dashboard/votings/page.tsx) |

### Architecture decisions already made — do not re-litigate

1. **Copy `access/page.tsx`'s `handleExportCsv` template for all
   five** — same `URLSearchParams` construction, same `apiDownload`
   call shape, same separate `exportingCsv`/`exportError` local state
   per page, same button visual style (icon + label, spinner while
   exporting). Do not invent a sixth variant of this by-now
   well-established pattern.
2. **Button visibility must match each endpoint's exact role list —
   not just rely on the backend's 403.** [votings/page.tsx:83](../frontend-web/src/app/dashboard/votings/page.tsx#L83)
   already has `const canWrite = ['HOA_CHAIRMAN', 'HOA_ADMIN',
   'SUPERADMIN'].includes(user?.role || '')` — this is *already the
   exact role list* endpoint #5 needs (`DISPATCHER` excluded from
   both), so reuse `canWrite` directly for that button's visibility,
   don't add a new boolean. For the other four pages, check whether an
   equivalent role-detection variable already exists (e.g. `meters/page.tsx:79`'s
   `userRole` state) and reuse/derive from it; only add a new
   page-local boolean where nothing suitable exists yet — never gate
   solely on "the page rendered at all," since three of these pages
   (`meters`, `sos`, `announcements`) are visible to broader staff role
   sets than their respective export endpoints allow.
3. **Meter readings export needs new month/year filter state —
   [meters/page.tsx](../frontend-web/src/app/dashboard/meters/page.tsx)
   has no period filter today** (only `statusFilter`, confirmed by
   reading its `useState` declarations — the readings queue is an
   unbounded "pending/verified/rejected" list, not period-scoped).
   Add a simple month/year selector (default: current month/year)
   feeding the export's `month`/`year` query params — this is net new
   UI, not just a button, unlike the other four.
4. **SOS export reuses the page's existing `dateFrom`/`dateTo`
   state as-is** — `sos/page.tsx` already has this filter driving
   `loadStats`; the export button should download exactly the range
   currently selected on screen, matching how the analytics CSV
   buttons already download whatever period their own preset selector
   currently shows.
5. **Chat transcript export needs no query params** — the button
   lives in the selected-conversation view, disabled when no
   conversation is selected, using `selectedConversationId` as the
   endpoint's `:id`.
6. **Announcement history export: check the service's own default
   `from`/`to` resolution before deciding on UI.**
   [announcements/page.tsx](../frontend-web/src/app/dashboard/announcements/page.tsx)
   has no date-range filter today (the feed is unbounded). Read
   `AnnouncementsService.exportAnnouncementsCsv`'s handling of an
   `undefined` query first — if it already defaults to a sensible
   full-history or bounded range server-side, the simplest correct UI
   is a single "Скачать CSV" button with no date inputs at all
   (calling the endpoint with no query params). Only add date-picker
   UI here if the service actually *requires* `from`/`to` to be
   supplied. Don't build a date-range UI speculatively if the backend
   doesn't need one.
7. **Voting results export button placement:** on the selected
   meeting's detail view (`selectedMeeting`,
   [votings/page.tsx](../frontend-web/src/app/dashboard/votings/page.tsx)),
   gated by `canWrite` per decision #2, using `selectedMeeting.id` as
   the endpoint's `:meetingId`. No period picker — this export is
   bounded by meeting, not by date (matches Task 0067 decision #2).
8. **Guest-pass history export (Task 0062) is explicitly out of scope
   for this task** — confirmed by a repo-wide search that **no
   guest-pass list/table exists anywhere in `frontend-web` today**
   (only i18n locale strings reference "guestPass"; there is no
   `.tsx` page rendering guest passes on the staff web dashboard at
   all). Adding a download button there would mean building a whole
   new staff-facing guest-pass history page first, which is a
   materially bigger, separate task — not "add a button to an existing
   page" like the other five. Raise that separately if actually
   wanted; don't fold it into this task and don't skip it silently
   either — it's simply a different-sized task.
9. **Full kk/ru/en i18n parity for every new button/label/error
   string**, in each page's own existing namespace (matching
   `access.exportCsvBtn`/`access.exportingCsv`'s precedent — one pair
   of keys per page's namespace, not one shared cross-page key).

---

## Subtask A — Meter readings (endpoint #1)

- Add month/year filter state to
  [meters/page.tsx](../frontend-web/src/app/dashboard/meters/page.tsx)
  per decision #3, default to the current month/year.
- Wire the export button per decisions #1/#2.

## Subtask B — SOS alerts (endpoint #2)

- Wire the export button on
  [sos/page.tsx](../frontend-web/src/app/dashboard/sos/page.tsx)
  reusing the existing `dateFrom`/`dateTo` state per decision #4.

## Subtask C — Chat transcript (endpoint #3)

- Wire the export button on
  [chat/page.tsx](../frontend-web/src/app/dashboard/chat/page.tsx)
  per decision #5, near the selected conversation's message pane.

## Subtask D — Announcement history (endpoint #4)

- Read `AnnouncementsService.exportAnnouncementsCsv`'s default
  `from`/`to` handling first (decision #6), then wire the button on
  [announcements/page.tsx](../frontend-web/src/app/dashboard/announcements/page.tsx)
  with or without date inputs accordingly.

## Subtask E — Voting results (endpoint #5)

- Wire the export button on
  [votings/page.tsx](../frontend-web/src/app/dashboard/votings/page.tsx)
  per decisions #2/#7, reusing `canWrite`.

---

## Acceptance criteria

- All five buttons actually download a real CSV file when clicked
  (verify manually — this is pure frontend wiring against
  already-tested backend endpoints, so no new backend test coverage
  is expected, but the download itself must be confirmed working, not
  just "compiles").
- Each button is visible only to the roles its own endpoint's
  `@Roles` decorator allows — in particular, the voting-results button
  must **not** be visible to `DISPATCHER` (matches
  [Task 0067](0067-voting-results-csv-export.md)'s central risk: this
  export leaks resident voting behavior, and a visible-but-403-on-click
  button for the wrong role is bad UX even if the backend blocks the
  actual request).
- `npx tsc --noEmit` clean in `frontend-web/`; full kk/ru/en i18n
  parity maintained.

## Explicitly out of scope

- Guest-pass history export (Task 0062) — decision #8, needs its own
  task since the underlying page doesn't exist yet.
- Any change to the five backend export endpoints themselves — this
  task only adds frontend buttons against already-shipped, already-
  tested endpoints.
- Mobile UI — every one of these five pages is a web-only staff/board
  management surface; none of them have (or need) a mobile
  counterpart.

## Deliverable

- Can ship as one commit or five small ones (one per subtask) — your
  call, they're independent of each other.
- PR description confirms each of the five buttons was manually
  clicked and produced a real downloaded file, and that the
  voting-results button was confirmed invisible when logged in as
  `DISPATCHER`.
