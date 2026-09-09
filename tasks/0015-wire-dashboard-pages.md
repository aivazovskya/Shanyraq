# Task 0015: Wire dashboard/votings/requests pages to real APIs

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

This is **not a cosmetic cleanup** — it closes a real functional gap that
[PROGRESS.md](PROGRESS.md) previously (and incorrectly) tracked as done.
On inspection: [dashboard/page.tsx](../frontend-web/src/app/dashboard/page.tsx),
[votings/page.tsx](../frontend-web/src/app/dashboard/votings/page.tsx), and
[requests/page.tsx](../frontend-web/src/app/dashboard/requests/page.tsx)
have **zero data fetching** — no `apiRequest`, no `fetch`, not even a
`useEffect` to trigger a load. Every number, meeting, and request on these
pages is a hardcoded sample array; buttons like "Новое собрание" have no
`onClick` at all. By contrast,
[access/page.tsx](../frontend-web/src/app/dashboard/access/page.tsx) and
[announcements/page.tsx](../frontend-web/src/app/dashboard/announcements/page.tsx)
**are** correctly wired (confirmed by reading them) — this task brings the
other three up to the same standard, reusing backend endpoints that
already exist, are tested, and have shipped since Task 0001/early commits.
No backend changes are needed for this task at all.

### Architecture decisions already made — do not re-litigate

1. **Don't use the [Task 0013](0013-analytics.md) analytics endpoints for
   the general dashboard summary.** Those are role-gated to `HOA_ADMIN`/
   `HOA_CHAIRMAN`/`SUPERADMIN` (per the ТЗ's own role table — `DISPATCHER`
   is deliberately excluded there). The general dashboard
   ([dashboard/page.tsx](../frontend-web/src/app/dashboard/page.tsx)) is
   visible to every staff role via the shared sidebar
   ([dashboard/layout.tsx](../frontend-web/src/app/dashboard/layout.tsx)),
   so wiring its summary cards to analytics would 403 for `DISPATCHER`/
   `SECURITY`. Use the same plain list endpoints the dedicated pages use
   instead (e.g. count the results of `GET /service-requests` and
   `GET /votings/tenant/:tenantId`) — every staff role can already call
   those.
2. **Keep the existing visual layout.** These pages already have a
   reasonably complete UI shell (cards, tables, badges, a legal banner on
   votings) built in Tasks 0004/0005 for i18n migration — don't redesign,
   just replace the hardcoded arrays with real fetched data and wire the
   buttons to real handlers, the same "keep the shell, make it real"
   approach every prior CRUD page in this codebase already follows.

---

## Subtask A — `requests/page.tsx`

Wire to the existing [service-requests](../backend/src/modules/service-requests/service-requests.controller.ts)
endpoints:
- `GET /service-requests` (role-based filtering is already handled
  server-side — staff sees their tenant's requests, no extra client-side
  filtering needed beyond the UI's own status/search filters) on load and
  after any mutation.
- `PATCH /service-requests/:id/status` for the status-change actions
  already present in the UI.
- `POST /service-requests/:id/comments` for the comment/chat UI already
  present.
- Replace `sampleRequests` entirely; keep the existing status badges,
  filters, and layout.

## Subtask B — `votings/page.tsx`

Wire to the existing [votings](../backend/src/modules/votings/votings.controller.ts)
endpoints:
- `GET /votings/tenant/:tenantId` for the list (active + completed
  meetings, quorum data already included in the response per
  `votings.service.ts`'s `enrichMeetingWithResults`).
- `GET /votings/:meetingId` for the detail view when a meeting is
  selected.
- `POST /votings/meetings` (`HOA_CHAIRMAN`/`HOA_ADMIN`/`SUPERADMIN` only —
  hide or disable the "Новое собрание" button for other roles, matching
  how role-gated actions are hidden elsewhere, e.g.
  [finance/tariffs/page.tsx](../frontend-web/src/app/dashboard/finance/tariffs/page.tsx)'s
  `canWrite` pattern) for the create-meeting flow — the button currently
  exists but does nothing; give it a real form (agenda items, dates,
  decision type per agenda item, matching `CreateMeetingDto`).
- `POST /votings/:meetingId/close` for closing a meeting and generating
  the protocol (same role gate as creation).
- Replace all sample meeting/result data; keep the existing legal banner
  and layout.

## Subtask C — `dashboard/page.tsx`

Wire the summary cards to real data per decision #1 above:
- Active/upcoming meetings count and the nearest one's quorum, from
  `GET /votings/tenant/:tenantId`.
- Open service request count (and maybe a breakdown by status), from
  `GET /service-requests`.
- Whatever other summary cards already exist on this page — wire each to
  the simplest already-available endpoint that produces it; if a card's
  data genuinely has no non-analytics source, it's fine to drop that card
  rather than inventing a new endpoint for it in this task (flag it in the
  PR description instead).

---

## Acceptance criteria

- None of these three pages render any hardcoded sample data after this
  task — everything comes from a real API call.
- Every button that previously did nothing (e.g. "Новое собрание") either
  works end-to-end or is removed if it's out of scope for this task.
- Role-gated actions (create/close a meeting) are hidden or disabled for
  roles that can't perform them, not just failing silently on click.
- `npx tsc --noEmit` clean in `frontend-web`; no backend changes, so no
  backend test run needed; i18n keys already exist from prior tasks for
  most of this UI — add any genuinely new ones (e.g. form field labels for
  the create-meeting flow) with full kk/ru/en parity.

## Explicitly out of scope

- Any backend change — every endpoint this task needs already exists and
  is tested.
- Redesigning these pages — see decision #2.
- Wiring the general dashboard to analytics — see decision #1.

## Deliverable

- Subtasks A, B, C are independent and can ship as separate commits or
  PRs.
- PR description should list, for `dashboard/page.tsx` specifically, any
  summary card that was dropped rather than wired (per the note in
  Subtask C) so it's tracked rather than silently lost.

---

## Review addendum (2026-09-09) — genuinely wired, a few leftover strings in the new form

**Verified good:** all three pages fetch real data — confirmed `votings`
and `requests` use the exact endpoints specified, `dashboard/page.tsx`
correctly avoids the role-gated analytics endpoints per decision #1
(uses `/votings/tenant/:id`, `/service-requests`, `/properties/tenants/:id/structure`,
`/access/tenant/:id/points` instead, all fetched in parallel), `canWrite`
role-gating on `votings/page.tsx` matches the `finance/tariffs` precedent
exactly, no sample-data arrays remain, no `'tenant-1'`-style regression.
`tsc --noEmit` clean.

**Found:** the new create-meeting form (not present before this task, so
this isn't a regression — it's new code that needed the same i18n
treatment every other new form in this codebase gets from the start) has
a few hardcoded Russian strings in
[votings/page.tsx](../frontend-web/src/app/dashboard/votings/page.tsx):
- Lines 507, 669 — `` `Вопрос №${...}` `` agenda-item numbering label
  (appears twice — once in the results view, once in the create form).
- Line 702 — `"Пояснение к вопросу (опционально)"` placeholder text.
- Lines 240-241 — a `дней` (days) unit-word helper, same class as the
  `'сек'`/`'мин'`/`'ч'` time-unit issue already caught and fixed in Task
  0010's addendum — English needs "days", not a literal transliteration.

**Required fix:** migrate the four items above to `t()` calls in the
existing `votings` namespace, full kk/ru/en parity. `requests/page.tsx`
and `dashboard/page.tsx` are confirmed clean — no changes needed there.
