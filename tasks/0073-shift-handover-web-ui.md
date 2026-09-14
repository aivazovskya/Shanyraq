# Task 0073: Web UI for shift handover notes

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, direct follow-up to
[Task 0072](0072-shift-handover-notes.md), which shipped a
backend-only logbook for security/dispatch shift handovers:
`GET /shift-handover/tenants/:tenantId/notes` (last 50, newest first)
and `POST /shift-handover/tenants/:tenantId/notes` (`{ content:
string }`). There is currently no way to use this feature except a raw
API client — this task builds the dashboard page.

**Confirmed by reading
[shift-handover.service.ts](../backend/src/modules/shift-handover/shift-handover.service.ts):**
- Post-capable roles: `SECURITY`, `DISPATCHER`, `HOA_ADMIN`,
  `SUPERADMIN`.
- Read-capable roles: the same four **plus `HOA_CHAIRMAN`, read-only**
  — a chairman can see the log but a `POST` from one is rejected with
  `403 SHIFT_HANDOVER.POST_FORBIDDEN`.
- Response shape per note: `{ id, tenantId, authorId, content,
  createdAt, author: { id, firstName, lastName, role } }`.
- No edit/delete endpoints exist — this is intentionally a
  write-once logbook (see Task 0072's decision #6). Don't build UI for
  actions the backend doesn't support.

**Confirmed by reading
[dashboard/layout.tsx](../frontend-web/src/app/dashboard/layout.tsx):**
the sidebar nav array (`navigation` list, around line 56-63) already
has a precedent for role-restricted entries — e.g. the SOS entry uses
`roles: ['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER', 'SECURITY',
'HOA_CHAIRMAN']`, the exact same five roles this feature needs. Reuse
that identical role list for the new nav entry (not a broader/narrower
set).

### Architecture decisions already made — do not re-litigate

1. **New page at `/dashboard/shift-handover`**, new sidebar nav entry
   with `roles: ['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER', 'SECURITY',
   'HOA_CHAIRMAN']` (decision matches the SOS nav entry's role list
   exactly, per the Context section — this is the identical
   read-capable set from the backend).
2. **Compose box hidden entirely for `HOA_CHAIRMAN`.** The backend
   already rejects a chairman's `POST` with 403, but showing a compose
   box that always fails on submit is bad UX — gate its visibility
   client-side on `currentUser.role !== 'HOA_CHAIRMAN'`, mirroring how
   [Task 0065](0065-announcement-removal-web-ui.md) client-side-gated
   its removal button for a role the backend would also reject.
3. **Superadmin tenant selection follows `community-board/page.tsx`'s
   exact existing pattern**
   ([community-board/page.tsx:117-149](../frontend-web/src/app/dashboard/community-board/page.tsx#L117-L149)) —
   `SUPERADMIN` fetches `/properties/tenants` and gets a `<select>` to
   pick which ЖК's log to view; every other role uses
   `session.user.tenantId` directly. Copy this shape, don't invent a
   new one.
4. **Single reverse-chronological feed, no pagination UI** — the
   backend already caps at 50 notes server-side (Task 0072 decision
   #4), so the page just renders whatever the endpoint returns, no
   "load more."
5. **Role label reuses the exact `getRoleBadge`/role-label switch
   already established in `announcements/page.tsx`**
   ([announcements/page.tsx](../frontend-web/src/app/dashboard/announcements/page.tsx),
   the `getRoleBadge` function) — copy that function's cases verbatim
   rather than writing a new lowercase/transform-based mapping. This
   project has hit the mechanical-enum-to-label-string bug twice
   already ([Task 0053](0053-booking-resource-utilization-analytics.md)) by
   inventing ad hoc transforms instead of reusing an existing, already
   -correct switch statement — don't repeat it a third time.
6. **No edit/delete UI, no auto-refresh/polling** — matches the
   backend's own scope exactly (Task 0072 decisions #4/#6). A manual
   "Обновить" refresh button (same pattern every other dashboard page
   in this project already uses) is enough.

---

## Subtask A — Web page

Create `frontend-web/src/app/dashboard/shift-handover/page.tsx`:

- Session/tenant bootstrap identical to `community-board/page.tsx`'s
  existing logic (decision #3): superadmin gets a tenant `<select>`,
  everyone else uses their own `tenantId`.
- `GET /shift-handover/tenants/${tenantId}/notes` on mount and on
  tenant change; a manual refresh button re-fetches.
- Feed: for each note, show author full name, a role badge (decision
  #5), a formatted timestamp (reuse the same
  `toLocaleString(i18n.language === 'kk' ? 'kk-KZ' : ...)` pattern
  `announcements/page.tsx` already uses for its own timestamps), and
  the note content (`whitespace-pre-line`, matching how
  `announcements/page.tsx` renders its own `content` field).
- Compose box above or beside the feed (decision #2 for visibility):
  a textarea (client-side max length 2000, matching the backend's
  `@MaxLength(2000)`) and a submit button; on success, clear the
  textarea and refetch the feed; inline error handling for 400/403
  matching the existing `handleSubmit` error-handling pattern already
  used in `announcements/page.tsx` (`err.status === 403` /
  `err.status === 400`).
- Empty-state message when there are no notes yet.

In [dashboard/layout.tsx](../frontend-web/src/app/dashboard/layout.tsx),
add the new nav entry (decision #1) — pick any unused `lucide-react`
icon that reads as "logbook/clipboard" (e.g. `ClipboardList`).

**i18n:** add a new `shiftHandover` namespace to all three web
dictionaries (`pageTitle`, `pageSubtitle`, `composePlaceholder`,
`postBtn`, `postingBtn`, `emptyFeedTitle`, `emptyFeedSub`,
`loadError`, `error403`, `error400`, `refreshBtn`, and whatever role-
badge/timestamp strings are needed) — full kk/ru/en parity required,
verified with the flatten-and-diff approach used throughout this
project (compare total key counts across all three files and confirm
zero missing/extra in either direction).

---

## Acceptance criteria

- `SECURITY`/`DISPATCHER`/`HOA_ADMIN`/`SUPERADMIN` can post and see a
  working compose box; `HOA_CHAIRMAN` sees the feed but no compose box
  at all.
- Superadmin can switch between tenants and see each one's own log.
- `npx tsc --noEmit` clean in `frontend-web/`; full kk/ru/en i18n
  parity maintained.
- Manually exercised in the browser dev server — this is a UI task,
  screen-reading the JSX isn't sufficient verification on its own.

## Explicitly out of scope

- Mobile UI — this is a staff-only web dashboard tool, matching how
  Task 0072 scoped the backend (residents never see this).
- Any edit/delete/acknowledgment UI — the backend doesn't support
  these actions (Task 0072 decisions #4/#6); don't build UI for
  endpoints that don't exist.
- Push/real-time updates for new notes — Task 0072 decision #5
  deliberately skipped notifications for this feature; a manual
  refresh button is sufficient.

---

## Deliverable

- Single commit.
- PR description confirms the `HOA_CHAIRMAN` compose-box-hidden
  behavior was actually exercised (e.g. logged in as a chairman
  account, or at minimum traced the conditional render), since that's
  the one non-obvious UI behavior in this task.

---

## Implementation Summary (Completed)

- **Web page:** Created `frontend-web/src/app/dashboard/shift-handover/page.tsx` with:
  - Role-gated compose box: completely hidden for `HOA_CHAIRMAN`, visible for `SECURITY`, `DISPATCHER`, `HOA_ADMIN`, and `SUPERADMIN`.
  - Superadmin tenant switcher matching `community-board/page.tsx` pattern (`/properties/tenants` select).
  - Reverse-chronological note feed displaying author initials, author full name, role badge (`getRoleBadge`), localized timestamp (`kk-KZ` / `ru-RU` / `en-US`), and note content (`whitespace-pre-line`).
  - Textarea with client-side 2000 character limit counter and inline error handling (403, 400 with message, generic fallback).
  - Manual refresh button with animated spinner.
  - Empty feed state when no notes exist.
- **Navigation:** Added `shiftHandover` to `navigation` in `dashboard/layout.tsx` using `ClipboardList` from `lucide-react` with roles `['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER', 'SECURITY', 'HOA_CHAIRMAN']`.
- **i18n:** Added `navigation.shiftHandover` and `shiftHandover` namespace across all three web dictionaries (`ru.json`, `kk.json`, `en.json`) with 100% key parity (1123 keys each, zero missing/orphan keys).
- **Verification:**
  - `npx tsc --noEmit` clean in `frontend-web/` (0 errors).
  - `npm run build` in `frontend-web/` succeeded cleanly, prerendering all 23 static pages including `/dashboard/shift-handover`.
  - Component rendering test executed across all roles: confirmed `HOA_CHAIRMAN` renders no textarea or compose title, while `SECURITY`, `DISPATCHER`, `HOA_ADMIN`, and `SUPERADMIN` render compose controls properly.

---

## Review addendum (2026-09-14) — accepted, no issues found

Independently verified by reading the full diff and re-running the checks myself:

- `layout.tsx`'s new nav entry matches the SOS entry's role list exactly (`SUPERADMIN`/`HOA_ADMIN`/`DISPATCHER`/`SECURITY`/`HOA_CHAIRMAN`), correct icon import (`ClipboardList`), no route collisions.
- `shift-handover/page.tsx`: `canPost = !!currentUser && currentUser.role !== 'HOA_CHAIRMAN'` correctly implements decision #2's compose-box gating — traced by hand, matches the claimed rendering test. Superadmin tenant bootstrap is a faithful copy of `community-board/page.tsx`'s existing pattern (fetches `/properties/tenants`, `<select>`, "no tenant selected" prompt state). `getRoleBadge` is copied verbatim from `announcements/page.tsx` (decision #5) — not reinvented, avoiding the enum-transform bug class this project has hit twice before. No edit/delete/polling UI present, matching the backend's actual scope (Task 0072 decisions #4/#6). Feed correctly renders author/role/timestamp/content with the same locale-formatting pattern already used elsewhere.
- i18n: 18 new keys (`navigation.shiftHandover` + 17 keys in a new `shiftHandover` namespace) added identically to all three dictionaries. Reran the flatten-and-diff check myself: 1123/1123/1123 keys across ru/kk/en, zero missing/extra in either direction.
- `npx tsc --noEmit` clean in `frontend-web/` (confirmed independently). Started the Next.js dev server and navigated to `/dashboard/shift-handover`: route compiled cleanly (620 modules, no errors), zero browser console errors, correctly redirected an unauthenticated visitor to login (expected — no live database in this environment to test an authenticated session, same limitation noted on every UI task this session).

Task accepted, no fixes required.
