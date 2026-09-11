# Task 0048: Search over the completed-meetings protocol archive (web)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. **Researched, not guessed — what's actually
missing.** Read
[votings/page.tsx](../frontend-web/src/app/dashboard/votings/page.tsx)
in full: it already has an `activeTab: 'ACTIVE' | 'COMPLETED'` toggle
(lines 74, 128-131) and already shows the protocol PDF download link
per completed meeting (`selectedMeeting.protocol?.pdfUrl`, line 396-403)
— the "archive" already functionally exists as the `COMPLETED` tab. What
it lacks is **any text search at all** — `filteredMeetings` (line
128-131) only filters by tab, nothing else; there is no `searchQuery`
state on this page, unlike
[residents/page.tsx](../frontend-web/src/app/dashboard/residents/page.tsx)/
[requests/page.tsx](../frontend-web/src/app/dashboard/requests/page.tsx)/
[finance/page.tsx](../frontend-web/src/app/dashboard/finance/page.tsx),
which all already have this pattern. A ЖК with several years of ОСС
history has no way to find "the meeting with protocol ОСС-2024/03"
except scrolling.

**Also researched — `getMeetingsByTenant` already returns everything
needed.**
[votings.service.ts:101-116](../backend/src/modules/votings/votings.service.ts)'s
`getMeetingsByTenant` already includes `protocol: true` on every
returned meeting, with no status filter and no pagination — the full
searchable dataset (title, description, protocol number, dates) is
already being fetched by this page today, just never exposed to a
search box.

### Architecture decisions already made — do not re-litigate

1. **No backend changes — this is a web-only, client-side search task.**
   The data this task needs to search over is already fully present in
   the response `getMeetingsByTenant` returns and this page already
   fetches. Per-tenant meeting counts (a handful of ОСС per year) don't
   warrant a new server-side search endpoint/query param — the same
   scale reasoning that made client-side filtering adequate for
   [Task 0042](0042-global-search.md)'s target pages before that task
   added server-side search to *those* (which have much larger resident/
   request/account counts than a ЖК's meeting history ever will).
2. **Search matches title, description, and protocol number in one
   box — no separate year picker.** Protocol numbers already encode the
   year by convention (e.g. `ОСС-2024/03`,
   [pdf-document.helper.ts](../backend/src/common/pdf/pdf-document.helper.ts)/
   [Task 0022](0022-pdf-report-exports.md)'s protocol numbering) — typing
   `2024` into one search box already finds that year's meetings via
   protocol-number matching, without a second date-range control adding
   UI complexity for a feature this bounded in scale.
3. **Search applies within the currently-selected tab, not across both
   at once.** Reuse the existing `ACTIVE`/`COMPLETED` tab as the primary
   filter (unchanged) and layer text search on top of `filteredMeetings`
   — don't change what the tabs mean or merge them.
4. **Same `searchQuery` state/input pattern already used on
   residents/requests/finance pages** — a plain `useState('')` and a
   `.filter()` predicate, not a new search component or library.

---

## Subtask A — Web: search box over `filteredMeetings`

In [votings/page.tsx](../frontend-web/src/app/dashboard/votings/page.tsx):

- Add `const [searchQuery, setSearchQuery] = useState('')` and a search
  input near the existing `ACTIVE`/`COMPLETED` tab toggle.
- Extend the `filteredMeetings` derivation (currently just the tab
  filter, lines 128-131) to also match `searchQuery` (case-insensitive,
  trimmed) against `meeting.title`, `meeting.description`, and
  `meeting.protocol?.protocolNumber` — a meeting with no protocol yet
  (e.g. an `ACTIVE` one) simply doesn't match on that field, no special
  casing needed.
- An empty search matches everything (current behavior unchanged when
  the box is empty).
- Full kk/ru/en i18n parity for the search input's placeholder/label
  (extend the existing `votings` namespace).

---

## Acceptance criteria

- Typing a protocol number, partial meeting title, or year (matching
  against the protocol number string) narrows the visible list within
  the current tab.
- Switching tabs preserves the current search text and re-filters
  against the new tab's meetings.
- Clearing the search box restores the full unfiltered list for the
  current tab.
- `npx tsc --noEmit` clean in `frontend-web/`; full kk/ru/en i18n parity
  maintained.

## Explicitly out of scope

- Any backend change — decision #1.
- A dedicated year/date-range filter control — decision #2.
- Mobile UI — voting/meeting management has stayed web-only throughout
  this project.
- Pagination of the meetings list — out of scope at this data scale,
  same reasoning as decision #1.

## Deliverable

- One commit.
- PR description confirms which three fields (title/description/
  protocol number) the search matches against, and that it correctly
  scopes to the currently-active tab.

---

## Review addendum (2026-09-11) — accepted, no issues found

**Verified good:** `filteredMeetings` correctly applies the tab filter
first, then the case-insensitive search predicate against `title`/
`description`/`protocol?.protocolNumber` on top — search state persists
across tab switches since it's a separate, untouched `searchQuery`
state. An empty search matches everything (unchanged behavior). The
empty-state message correctly distinguishes "no search results" from
"no meetings in this tab at all." As a bonus beyond the spec, the page
now also reads `?q=`/`?search=` from the URL via the same
`SearchParamsReader`-in-`Suspense` pattern established in
[Task 0042](0042-global-search.md) — verified this doesn't break
prerendering by running `npm run build` myself; `/dashboard/votings`
compiled and prerendered cleanly alongside all other pages.

**Verified independently:** `tsc --noEmit` clean, `npm run build` clean,
full kk/ru/en parity (1029/1029/1029 web keys). Task accepted, no fixes
required.
