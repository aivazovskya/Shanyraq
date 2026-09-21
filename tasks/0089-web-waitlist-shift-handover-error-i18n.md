# Task 0089: kk/en web users see raw Russian errors on booking-waitlist and shift-handover pages

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Found during a full i18n-parity audit (2026-09-21) that diffed the flattened
key sets of `frontend-web/src/i18n/locales/{ru,kk,en}.json` against
`mobile/src/i18n/locales/{ru,kk,en}.json`. Web's internal ru/kk/en parity is
100% (1239/1239/1239 keys, identical sets) and mobile's is too (848/848/848)
— **within each app there's no gap**. The gap is that two web pages never
got the same error-localization treatment the rest of the web app already
has, and their corresponding backend error codes were never added to web's
locale files at all (mobile has them).

### Missing keys in web's `errors` namespace

**Confirmed by reading
[frontend-web/src/i18n/locales/ru.json:1141-1161](../frontend-web/src/i18n/locales/ru.json#L1141-L1161)**
— the `errors.BOOKINGS` block exists but stops short of the waitlist codes
that [bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts)
throws at lines 419 (`ALREADY_ON_WAITLIST`), 436 (`SLOT_NOT_FULL`), 459
(`WAITLIST_ENTRY_NOT_FOUND`), 466 (`WAITLIST_LEAVE_FORBIDDEN`) —
[Task 0070](0070-booking-waitlist.md)'s codes. Mobile's locale files already
have all four (confirmed present in `mobile/src/i18n/locales/ru.json`).

**Confirmed there is no `errors.SHIFT_HANDOVER` block anywhere in web's
locale files at all** (exact-string grep for `"SHIFT_HANDOVER"` in
`frontend-web/src/i18n/locales/*.json` returns zero hits) — the three codes
[shift-handover.service.ts](../backend/src/modules/shift-handover/shift-handover.service.ts)
throws (`POST_FORBIDDEN` line 34, `CONTENT_REQUIRED` line 44,
`VIEW_FORBIDDEN` line 72, from [Task 0072](0072-shift-handover.md)) exist
in mobile's locale files but were never added to web's when
[Task 0073](0073-shift-handover-web-ui.md) shipped the web UI.

(Not part of this task, informational only: mobile also has an orphaned
`errors.SHIFT_HANDOVER.CONTENT_TOO_LONG` key that no backend code path
throws anymore — its `@MaxLength(2000)` validator now routes through the
generic `errors.VALIDATION.TOO_LONG` path added in
[Task 0083](0083-dto-validation-error-i18n.md). Harmless dead key, not
worth a dedicated task; delete it in passing if convenient while editing
mobile's locale files for an unrelated reason, but don't go out of your way
for it here.)

### Both pages bypass this project's established error-i18n pattern entirely

Five other pages in `frontend-web/src/app/**`
(`page.tsx`, `dashboard/tenants/page.tsx`, `dashboard/votings/page.tsx`,
`dashboard/requests/page.tsx`, `dashboard/page.tsx`) call
`getApiErrorMessage(err, t)` — [lib/api.ts:120-131](../frontend-web/src/lib/api.ts#L120-L131),
which resolves `errors.<code>` via `t()` when the backend response carried
a machine-readable `code` (which `apiRequest` already attaches to every
thrown error, [lib/api.ts:101-109](../frontend-web/src/lib/api.ts#L101-L109)),
falling back to the raw message only when no matching key exists.

**`dashboard/bookings/waitlist/page.tsx:123`** and
**`dashboard/shift-handover/page.tsx:84`** instead do
`setError(err.message || t('...loadError'))` / `setErrorMsg(err.message ||
t('shiftHandover.loadError'))` — reading the backend's raw `message` field
directly. That field is hardcoded Russian
(e.g. `'Недостаточно прав для публикации заметки передачи смены'` from
`shift-handover.service.ts`), so **even after the missing keys above are
added, a kk/en web user hitting either page still sees Russian text**,
because these two call sites never look the code up in `t()` at all.

## Architecture decisions — do not re-litigate

1. **Fix is two independent, additive parts — do both, in either order:**
   add the missing locale keys, AND switch both pages to
   `getApiErrorMessage`. Adding only the keys doesn't fix display (the
   pages don't consult them); switching only the call sites without the
   keys just falls back to raw Russian anyway (same bug, one layer
   removed). Neither alone is a complete fix.
2. **Do not touch `getApiErrorMessage` itself or any of the 5 already-correct
   pages** — it's already correct and proven working elsewhere; this task
   is scoped to bringing 2 pages in line with it, not changing the shared
   helper.
3. **Match value text exactly, not paraphrase**, when copying the 4
   waitlist + 3 shift-handover Russian strings from mobile's locale files
   into web's — the backend's `message` field (Russian fallback for when
   no `t()` match exists) must stay byte-identical to what these new `ru`
   keys say, consistent with this project's established convention from
   [Task 0014](0014-backend-error-codes.md)/[Task 0016](0016-error-codes-properties-finance-meters.md)
   ("сохранение байт-в-байт русских сообщений"). For `kk`/`en`, follow the
   same translation quality bar as surrounding keys in the same file (not
   necessarily identical to mobile's kk/en wording, which was translated
   independently — draft-quality kk/en is an accepted, already-tracked
   gap per [Task 0034](0034-i18n-review-export.md), not something to fix here).

## Subtask A — Add missing locale keys to web

- `frontend-web/src/i18n/locales/{ru,kk,en}.json`: add
  `errors.BOOKINGS.ALREADY_ON_WAITLIST`, `.SLOT_NOT_FULL`,
  `.WAITLIST_ENTRY_NOT_FOUND`, `.WAITLIST_LEAVE_FORBIDDEN` inside the
  existing `errors.BOOKINGS` block (after line 1160 in `ru.json`, same
  relative position in `kk.json`/`en.json`).
- Add a new `errors.SHIFT_HANDOVER` block (`POST_FORBIDDEN`,
  `CONTENT_REQUIRED`, `VIEW_FORBIDDEN`) to all 3 web locale files, placed
  alongside the other per-module blocks under `errors` (matching this
  file's existing key ordering/grouping convention — check where
  `ACCESS_CONTROL` etc. sit and follow the same style).
- Re-run/update whatever key-count parity check this project already uses
  (per every prior i18n task's "100% паритет i18n" verification step) and
  report the new exact counts for web (currently 1239/1239/1239) in the
  PR description.

## Subtask B — Wire both pages to `getApiErrorMessage`

- `frontend-web/src/app/dashboard/bookings/waitlist/page.tsx`: import
  `getApiErrorMessage` from `@/lib/api` (or the existing relative import
  path this file already uses for other `lib/api` imports) and replace
  `err.message || t('bookings.loadError')` (and any other raw
  `err.message` reads in this file's catch blocks — check for more than
  the one at line 123) with `getApiErrorMessage(err, t) ||
  t('bookings.loadError')`, matching the exact call pattern used in
  `dashboard/requests/page.tsx`.
- `frontend-web/src/app/dashboard/shift-handover/page.tsx`: same swap for
  `err.message || t('shiftHandover.loadError')` at line 84 and any other
  raw `err.message` reads in this file.

**Tests**: this project doesn't appear to have component-level tests for
these two pages (check before assuming — if there genuinely are none,
manual verification is acceptable per this project's established pattern
for frontend-only UI tasks; don't introduce a new testing framework for
this one fix). Manually verify: switch the web UI's language to `kk` or
`en`, trigger each of the 7 new error codes (e.g. try joining a waitlist
you're already on, try posting a shift-handover note as a non-staff/
cross-tenant account), confirm the localized message renders instead of
Russian.

## Acceptance criteria

- `errors.BOOKINGS.{ALREADY_ON_WAITLIST,SLOT_NOT_FULL,WAITLIST_ENTRY_NOT_FOUND,WAITLIST_LEAVE_FORBIDDEN}`
  and `errors.SHIFT_HANDOVER.{POST_FORBIDDEN,CONTENT_REQUIRED,VIEW_FORBIDDEN}`
  exist in all 3 web locale files, with byte-identical `ru` text to the
  backend's `message` field per decision #3.
- Both pages resolve backend error codes through `getApiErrorMessage`
  instead of raw `err.message`, matching the pattern already used in
  `dashboard/requests/page.tsx` et al.
- Manually confirmed in a `kk`- or `en`-switched browser session that all
  7 error scenarios now render localized text, not Russian.
- `npx tsc --noEmit` clean in `frontend-web/`.

## Explicitly out of scope

- The orphaned `errors.SHIFT_HANDOVER.CONTENT_TOO_LONG` key in mobile —
  see the informational note above; harmless, not worth its own task.
- Any change to mobile's locale files or mobile UI — mobile already has
  correct key coverage for these two features; this task is web-only.
- Re-translating or improving kk/en wording quality anywhere — that's
  [Task 0034](0034-i18n-review-export.md)'s tracked, accepted gap, not
  this task's concern (see decision #3).
- Changing `getApiErrorMessage`, `apiRequest`, or any other page that
  already uses the correct pattern.

## Deliverable

- Single frontend-web commit.
- PR description confirms: the new exact web locale key counts (all 3
  should match each other), and that the 7 error scenarios were manually
  verified in a non-Russian locale.
