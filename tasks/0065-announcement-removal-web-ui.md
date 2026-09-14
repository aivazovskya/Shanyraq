# Task 0065: Web UI for announcement removal

**Status:** Completed
**Assignee:** Team lead (implementing directly while Antigravity is
out of quota, per the user's explicit instruction)
**Reviewer:** N/A for this task while implemented directly — an
independent review can be requested separately if desired.

## Context

Beyond-ТЗ feature, direct follow-up to
[Task 0064](0064-announcement-removal.md), which shipped
`PATCH /announcements/:id/remove` as a backend-only mechanism (deliberately
out of scope for UI). Staff currently has no way to call it except a raw
API client. This task wires it into
[announcements/page.tsx](../frontend-web/src/app/dashboard/announcements/page.tsx),
reusing the exact moderation UX already shipped for community board
listings in
[community-board/page.tsx](../frontend-web/src/app/dashboard/community-board/page.tsx)
([Task 0011](0011-community-board.md)).

**Confirmed by reading both pages in full:**
- `AnnouncementItem` (announcements page) currently has no
  `status`/`removedById`/`removedReason`/`removedBy` fields — the
  backend model has them (Task 0064) but `getAnnouncements`'s `include`
  only selects `author`, not `removedBy`. The CSV/JSON response already
  carries `status`/`removedById`/`removedReason` as plain scalars (no
  `include` needed for those), but `removedBy`'s name needs an explicit
  `include` addition to display "кто удалил".
- **Route access is asymmetric between the two pages, which matters for
  this task.** In
  [layout.tsx:59](../frontend-web/src/app/dashboard/layout.tsx#L59),
  the `community-board` nav entry is role-restricted to
  `['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER']` — exactly the role set
  that can moderate, so that page shows its "Снять с публикации" button
  unconditionally to everyone who can even navigate there. The
  `announcements` nav entry
  ([layout.tsx:63](../frontend-web/src/app/dashboard/layout.tsx#L63))
  has **no `roles` restriction at all** — any web-dashboard role
  (including `SECURITY`, which per Task 0064 decision #4/#6 can neither
  remove nor see removed announcements) can reach this page. **The
  removal button must be conditionally rendered client-side based on
  the signed-in user's role** — unlike community board, this page
  can't rely on route-level gating alone.
- Backend already returns `REMOVED` announcements only to
  `[HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SUPERADMIN]` (Task 0064), so
  no separate client-side filtering of removed items is needed — if a
  `REMOVED` item is in the response at all, the viewer is already
  allowed to see it.

### Architecture decisions already made — do not re-litigate

1. **Reuse `community-board/page.tsx`'s moderation modal UX exactly**
   — same modal shape (title, mandatory reason textarea, Cancel/Confirm
   buttons), same card-level conditional (button only when
   `status !== 'REMOVED'`, a muted "already removed" line otherwise),
   same red banner for removed items showing the reason and remover
   name. Don't invent a new interaction pattern for what's
   functionally the identical feature in a different module.
2. **Role check via `getStoredSession()`, same accessor the page
   already uses** — `canRemove =
   ['HOA_ADMIN','HOA_CHAIRMAN','DISPATCHER','SUPERADMIN'].includes(session.user.role)`.
   Gates both the per-card "Удалить" button and whether the removed-item
   banner styling is reachable at all (moot for non-staff since the API
   never sends them REMOVED rows, but the flag also gates the button).
3. **Small backend addition required first: add `removedBy` to
   `getAnnouncements`'s `include`** — `select: { id, firstName,
   lastName }`, mirroring `getListings`'s `removedBy` select in
   `community-board.service.ts`. `status`/`removedById`/`removedReason`
   need no `include` change, they're already plain scalar columns
   returned by default.
4. **i18n keys live under the existing `announcements` namespace**, not
   a new one — naming mirrors `communityBoard`'s equivalent keys
   exactly (`removeAction`, `removeModalTitle`, `removalReasonLabel`,
   `removalReasonPlaceholder`, `reasonRequiredError`, `confirmRemoveBtn`,
   `removedByStaff`, `moderator` is reused as-is since "кто снял" means
   the same thing in both contexts — no need for a duplicate
   `remover` key). Full kk/ru/en parity required, web dictionaries only
   (`frontend-web/src/i18n/locales/*.json`) — this is a web-only
   dashboard change, no mobile UI touched.
5. **No new component/modal library** — a plain fixed-position overlay
   `<div>`, copy-adapted from `community-board/page.tsx`'s existing
   modal markup, consistent with how every other in-page modal in this
   codebase is built (no shared `<Modal>` component exists yet).

---

## Subtask A — Backend: expose `removedBy` in the JSON response

In [announcements.service.ts](../backend/src/modules/announcements/announcements.service.ts),
add `removedBy: { select: { id: true, firstName: true, lastName: true } }`
to `getAnnouncements`'s `include` (decision #3).

**Test:** extend `announcements.service.spec.ts` — a `REMOVED`
announcement returned to a staff viewer includes `removedBy.firstName`/
`removedBy.lastName` in the response.

## Subtask B — Web: removal UI

In [announcements/page.tsx](../frontend-web/src/app/dashboard/announcements/page.tsx):

- Extend `AnnouncementItem` with `status: 'ACTIVE' | 'REMOVED'`,
  `removedById: string | null`, `removedReason: string | null`,
  `removedBy?: { id: string; firstName: string; lastName: string }`.
- Read `getStoredSession()` once (the page already imports it) to
  compute `canRemove` (decision #2).
- Per-card: if `canRemove && item.status !== 'REMOVED'`, show a
  "Удалить" button (decision #1's card-level conditional); if
  `item.status === 'REMOVED'`, show the red removed-banner with
  `removedBy` name + `removedReason` instead of (or alongside) the
  normal content — match `community-board`'s exact visual treatment,
  adapted to this page's card layout (amber/urgent styling already
  used here must stay visually distinct from the new red
  removed-state styling, same as community board distinguishes
  "removed" red from other statuses).
- Removal modal: mandatory reason textarea, `PATCH
  /announcements/${id}/remove` with `{ reason }` on confirm, reload
  the feed via the existing `loadAnnouncements()` on success, inline
  403/400 error handling matching the existing `handleSubmit`
  pattern already in this file (error403/error400-style messages).

**i18n:** add to `announcements` namespace in all three web
dictionaries (decision #4) — `removeAction`, `removeModalTitle`,
`confirmRemoveNotice`, `removalReasonLabel`,
`removalReasonPlaceholder`, `reasonRequiredError`, `confirmRemoveBtn`,
`removingBtn`, `removedByStaff`, `alreadyRemoved`, `cancelBtn` (reuse
the existing generic `cancelBtn` string already present elsewhere if
i18n key-sharing across namespaces is awkward — plain per-namespace key
is fine, this project already repeats `cancelBtn` per-namespace
multiple times).

---

## Acceptance criteria

- `HOA_ADMIN`/`HOA_CHAIRMAN`/`DISPATCHER`/`SUPERADMIN` see a working
  "Удалить" button per active announcement; submitting a reason removes
  it and the feed reloads showing the removed state.
- `SECURITY` (or any other non-removal role reaching this page) never
  sees the removal button.
- A removed announcement shows the reason and who removed it to the
  roles that can see it at all.
- `npx tsc --noEmit` clean in `backend/` and `frontend-web/`; `npm
  test` passes in `backend/`; kk/ru/en i18n parity maintained
  (verified via the flatten-and-diff script used throughout this
  project).
- Manually exercised in the browser dev server — this is a UI task,
  screen-reading the JSX isn't sufficient verification on its own.

## Explicitly out of scope

- Mobile UI — announcements management has stayed web-only since
  `createAnnouncement` was first built; residents only ever read the
  feed on mobile, they never moderate it.
- Editing announcement content — Task 0064 already scoped this out,
  unchanged here.

---

## Deliverable

- Single commit (backend's one-line `include` addition travels with
  the web change since the UI can't display the remover's name
  without it).

---

## Implementation notes (2026-09-14)

Implemented exactly per the spec above.

**Backend:** added `removedBy: { select: { id, firstName, lastName } }`
to `getAnnouncements`'s `include` (decision #3). One new test asserts
the `include` shape.

**Web:** `AnnouncementItem` extended with `status`/`removedById`/
`removedReason`/`removedBy`. `canRemove` is computed once in
`loadAnnouncements` from `getStoredSession()`, reusing the exact
accessor already used for `tenantId`/`tenantName` in this file
(decision #2) — `ANNOUNCEMENT_REMOVE_ROLES =
['HOA_ADMIN','HOA_CHAIRMAN','DISPATCHER','SUPERADMIN']`, matching the
backend's own role set exactly. Per card: a red removed-banner
(reason + remover name) renders whenever `status === 'REMOVED'` —
reachable by any viewer the API sends it to, not gated by `canRemove`,
since only staff who can already see `REMOVED` rows receive them at
all (Task 0064's own filtering). The "Удалить" button / "уже удалено"
line is gated by `canRemove`, so `SECURITY` (which can view this
page's nav entry with no role restriction) never sees any removal
control. The confirmation modal was adapted line-for-line from
`community-board/page.tsx`'s existing "Снять с публикации" modal
(decision #1) — mandatory reason textarea, Cancel/Confirm, inline
403/400 handling matching the page's own existing `handleSubmit`
pattern. `t('communityBoard.moderator')` is reused as-is for the
"кем удалено" line per decision #4, no duplicate key created.

**i18n:** 11 new keys added to the `announcements` namespace in all
three web dictionaries, wording adapted from `communityBoard`'s
equivalent keys. Parity verified with a flatten-and-diff script:
1086/1086/1086 keys across ru/kk/en, zero missing/extra in either
direction.

**Verified:** `npx tsc --noEmit` clean in `backend/` and
`frontend-web/`; backend suite 571/571 (31 suites, 0 regressions —
570 prior + 1 new); i18n parity as above. Started the Next.js dev
server and navigated to `/dashboard/announcements` — the route
compiled successfully (`✓ Compiled /dashboard/announcements in 585ms,
628 modules`, confirming the new `lucide-react` icon imports and JSX
resolve correctly) with zero browser console errors; the unauthenticated
visitor was correctly redirected to the login screen (expected
behavior, not a bug in this change).

**Not verified:** this environment has no reachable Postgres and no
SMS-OTP provider, so an actual authenticated session (staff login →
view feed → click Удалить → submit reason → see the removed banner
and confirm `SECURITY` sees no button) could not be exercised
end-to-end in the browser. This is a compile/render-level check, not a
full interactive one — same limitation as every other schema-touching
task in this session since Task 0057. Ask for a live-environment
smoke test once a database is reachable, or route this through
Antigravity's own review cycle for a second pass.

**Caveat:** implemented and verified by the same person (the
architect, standing in for Antigravity while it's out of quota) — no
independent second-pass review, same as Tasks 0056-0061 and 0064. Ask
separately if one is wanted.
