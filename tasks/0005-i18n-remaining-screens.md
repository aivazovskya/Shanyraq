# Task 0005: i18n — migrate remaining screens (mobile + web)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)
**Depends on:** [0004-i18n-foundation.md](0004-i18n-foundation.md) (infrastructure
already exists on both platforms — this task only adds content and migrates
components, no new libraries or providers needed).

## Context

Task 0004 built the i18n foundation (i18next/react-i18next on both
`mobile/` and `frontend-web/`) and fully migrated only the shared chrome +
auth flow (mobile) and the dashboard shell + login page (web), by explicit
scope cut. See [PROGRESS.md](PROGRESS.md). This task finishes the job:
migrate every remaining screen/page that still has hardcoded Russian strings.

**Do not re-litigate the architecture decisions from Task 0004** — same
libraries, same client-side/no-locale-routing approach, same
client-local-only language storage, same namespace files
(`mobile/src/i18n/locales/{ru,kk,en}.json`,
`frontend-web/src/i18n/locales/{ru,kk,en}.json`). This task only adds keys
to those existing files and wires up `t()` calls in the files listed below.

**Still out of scope, same as Task 0004:**
- Backend error/success message localization — server responses stay in
  Russian (see Task 0004 architecture decision #3). Continue routing any
  string that comes from `getApiErrorMessage()` / `err.message` / a raw API
  response body through as-is, untranslated.
- Professional translation review — kk/en entries added here are still
  first-draft, same caveat as before.

**One nuance worth being precise about:** several screens contain
client-side lookup tables that map a backend enum value to a *display
label* — e.g. a `RequestCategory`/`RequestStatus`/`VoteChoice` value to a
human-readable Russian word, rendered in a badge or list item. **These ARE
in scope and should be migrated.** They're UI copy that happens to be keyed
by an enum, not text that arrived in an API response body — the boundary is
"does this string come from the server at runtime" (stays Russian) vs "is
this a label this component renders based on a value" (gets translated).

---

## Subtask A — Mobile: migrate remaining screens

Full-text migration (labels, buttons, headers, empty states, validation
messages that originate client-side, confirmation dialogs, enum→label
lookups as described above) for:

- [DashboardScreen.tsx](../mobile/src/screens/dashboard/DashboardScreen.tsx) → namespace `dashboard` (new — add it to all 3 locale files, following the same structure convention as existing namespaces).
- [AccessScreen.tsx](../mobile/src/screens/access/AccessScreen.tsx), [PinSetupScreen.tsx](../mobile/src/screens/access/PinSetupScreen.tsx), [PinEntryModal.tsx](../mobile/src/components/access/PinEntryModal.tsx), [HoldToOpenButton.tsx](../mobile/src/components/access/HoldToOpenButton.tsx) → namespace `access` (already stubbed as `{}` in Task 0004, populate it now).
- [VotingsListScreen.tsx](../mobile/src/screens/votings/VotingsListScreen.tsx), [VotingDetailsScreen.tsx](../mobile/src/screens/votings/VotingDetailsScreen.tsx) → namespace `votings` (already stubbed).
- [RequestsListScreen.tsx](../mobile/src/screens/requests/RequestsListScreen.tsx), [CreateRequestScreen.tsx](../mobile/src/screens/requests/CreateRequestScreen.tsx), [RequestDetailScreen.tsx](../mobile/src/screens/requests/RequestDetailScreen.tsx) → namespace `requests` (already stubbed).
- [AnnouncementsScreen.tsx](../mobile/src/screens/announcements/AnnouncementsScreen.tsx) → namespace `announcements` (already stubbed).
- [ClaimUnitScreen.tsx](../mobile/src/screens/onboarding/ClaimUnitScreen.tsx) → namespace `onboarding` (already stubbed).
- Check [Input.tsx](../mobile/src/components/common/Input.tsx), [LoadingState.tsx](../mobile/src/components/common/LoadingState.tsx), [Card.tsx](../mobile/src/components/common/Card.tsx), [Badge.tsx](../mobile/src/components/common/Badge.tsx), [Button.tsx](../mobile/src/components/common/Button.tsx) for any hardcoded default text (e.g. `LoadingState`'s default `message` prop value) — these are generic components that mostly receive text via props from already-migrated-or-about-to-be-migrated screens, but if any has its own hardcoded fallback string, migrate it under `common`.

## Subtask B — Web: migrate remaining pages

Full-text migration for:

- [dashboard/page.tsx](../frontend-web/src/app/dashboard/page.tsx) (main
  analytics/overview page) → namespace `dashboard` (already has some keys
  from Task 0004 for the layout shell — extend it).
- [dashboard/votings/page.tsx](../frontend-web/src/app/dashboard/votings/page.tsx) → namespace `votings`.
- [dashboard/requests/page.tsx](../frontend-web/src/app/dashboard/requests/page.tsx) → namespace `requests`.
- [dashboard/access/page.tsx](../frontend-web/src/app/dashboard/access/page.tsx) → namespace `access`.
- [dashboard/announcements/page.tsx](../frontend-web/src/app/dashboard/announcements/page.tsx) → namespace `announcements`.
- [dashboard/verifications/page.tsx](../frontend-web/src/app/dashboard/verifications/page.tsx) → namespace `verifications` (new — add to all 3 locale files).
- [dashboard/residents/page.tsx](../frontend-web/src/app/dashboard/residents/page.tsx) → namespace `residents` (new — add to all 3 locale files).

Each of these pages currently follows the same conventions
(`apiRequest`/`getStoredSession` from `lib/api.ts`, `confirm()` guards,
table + modal patterns) — no structural changes needed here, purely
swap hardcoded strings for `t('namespace.key')`.

---

## Acceptance criteria

- Every screen/page listed above shows fully translated text when switching
  the language switcher (mobile Profile / web header dropdown) to kk or en —
  no leftover hardcoded Russian strings, no raw `t()` keys showing up
  untranslated in the UI.
- All three locale JSON files (both apps) keep 100% key parity — every key
  added exists in `ru.json`, `kk.json`, and `en.json`. Verify this
  explicitly (a quick script diffing the three files' flattened key sets is
  the fastest way — reuse the same verification approach from Task 0004 if
  one was set up).
- Enum→label lookup tables (status/category/vote-choice display names) are
  migrated per the nuance above; anything genuinely originating from an API
  response body is left as-is in Russian.
- `npx tsc --noEmit` clean in both `mobile/` and `frontend-web/`.
- Existing backend test suite unaffected (this task doesn't touch
  `backend/` at all).
- Manual sanity pass: switch language on each of the screens/pages listed
  above at least once and confirm no visual breakage (overflow, truncation)
  from longer Kazakh/English strings — text length varies noticeably between
  the three languages and this is a common place for layout bugs to hide.

## Deliverable

- Subtask A and Subtask B can ship as separate commits/PRs (mobile and web
  are independent — no need to gate one on the other) or together, reviewer's
  preference.
- PR description should note: any new namespaces added beyond what's listed
  here (if a screen needed one not anticipated), and confirm the kk/en
  translations remain first-draft (same standing caveat as Task 0004).

---

## Review addendum (2026-09-08) — a few leftover hardcoded strings

**Verified good:** full key parity across all 6 locale files (310 mobile
keys, 256 web keys, zero drift), `npx tsc --noEmit` clean in both apps,
backend untouched (92/92 tests unaffected). Found via a systematic grep for
Cyrillic characters across every touched file (cheap, objective check worth
reusing next time). Sample/demo data (names, phone numbers, building names,
free-text request titles standing in for what would be real user-submitted
content) correctly left untranslated — that's data, not UI chrome, per the
task's own boundary.

**Genuine misses — same "app-owned client-side text, not server-provided"
boundary as the enum→label nuance above, just missed on these specific
lines:**

Mobile:
- [VotingDetailsScreen.tsx:99](../mobile/src/screens/votings/VotingDetailsScreen.tsx#L99) — `Alert.alert('SMS-код подтверждения голоса', \`Код: ${res.devCode}\`)` not migrated. Follow the exact pattern already used for the equivalent dev-OTP alert in `auth.testSmsTitle`/`auth.testSmsBody` (Task 0004) — add matching keys under `votings`.
- [PinSetupScreen.tsx:132](../mobile/src/screens/access/PinSetupScreen.tsx#L132) — same dev-SMS-alert pattern, not migrated. Same fix, under `access`.

Web (all three share near-identical copy-pasted logic, so likely a single
shared cause):
- `residents/page.tsx:89`, `verifications/page.tsx:71`, `announcements/page.tsx:56` — identical `throw new Error('Пользователь не авторизован или не привязан к жилому комплексу')`, never routed through `t()`.
- `residents/page.tsx:101`, `residents/page.tsx:124`, `verifications/page.tsx:90`, `announcements/page.tsx:68` — fallback messages of the form `err.message || 'Ошибка загрузки...'`. The `err.message` half correctly stays untranslated (that's server text); the literal fallback string after `||` is app-owned copy for when the server didn't provide a message, and should be migrated.
- `announcements/page.tsx:114` — a fully hardcoded 403 explanation, and `announcements/page.tsx:117` — a hardcoded "Ошибка 400 (...)" prefix wrapping `${err.message}`. Both are text the page itself writes, not text from the server; migrate the prefixes (keep the interpolated `err.message` as-is).

Optional, low-impact (mention but don't block on): `residents/page.tsx:77`
and `verifications/page.tsx:63` initialize `tenantName` state to the literal
`'ЖК'`, and `announcements/page.tsx:48` initializes it to
`'ЖК «Шаңырақ Премиум»'` — both are pre-fetch placeholders replaced almost
immediately once the real session loads, but for full consistency they could
route through `t()` / the same `dashboard.defaultComplex`-style key
established in Task 0004.

**Required fix:** migrate the items listed as genuine misses above (mobile:
2 lines; web: ~7 lines across 3 files). No other files need touching —
scope stays exactly as this task already defined it.

---

## Review addendum #2 (2026-09-08) — fix confirmed, two files need one more pass

All items from addendum #1 are fixed and verified (both mobile dev-alerts,
all three `throw new Error(...)` copies, all four `err.message || '...'`
fallbacks, both announcements 403/400 strings). Key parity re-verified: 314
mobile / 264 web keys, still 100% parity in all three locales. `tsc --noEmit`
still clean in both apps.

A wider Cyrillic sweep (not scoped to the addendum #1 line numbers this
time — a fresh full pass) turned up a handful more, concentrated in exactly
the two files whose fix seems to have targeted only the addendum #1 line
numbers rather than a fresh read of the whole file:

- [residents/page.tsx:414](../frontend-web/src/app/dashboard/residents/page.tsx#L414) — `` `ИИН: ${resident.iin}` `` and the `resident.email || 'Без email'` fallback. Both are UI-composed text: the "ИИН:" label in particular isn't just a translation nicety — the Kazakh abbreviation for this identifier is "ЖСН", not "ИИН", so this needs a real `t()` key per locale, not just wrapping the same Russian string.
- [residents/page.tsx:552](../frontend-web/src/app/dashboard/residents/page.tsx#L552) — a static `<p>ИИН</p>` label heading, same abbreviation issue.
- [residents/page.tsx:605](../frontend-web/src/app/dashboard/residents/page.tsx#L605) — `` `${o.unit.floor} этаж, ${o.unit.entrance} подъезд` `` — composed from data (floor/entrance numbers) plus hardcoded Russian words ("floor", "entrance"). Migrate the words, keep the numbers interpolated.
- [verifications/page.tsx:338](../frontend-web/src/app/dashboard/verifications/page.tsx#L338) — `item.unit.building?.blockName || 'Блок'` fallback default word, same class as the `residents.md` blockName fallback already fixed elsewhere in this pass — just missed here.

Everything else found in the wider sweep (comments, the `t(key, 'ru
default')` fallback-argument style used throughout, demo/mock data — names,
phone numbers, request titles/feedback text, relative timestamps, block
names embedded in sample datasets, and the intentionally-untranslated
language-switcher labels) is correctly left alone — confirmed against the
data-vs-chrome boundary already established, not flagged again.

**Required fix — scoped narrowly on purpose:** the 4 lines above, in exactly
these 2 files. Please do a fresh read of both files end-to-end this time
(not just the specific lines named) in case anything else in the same two
files was missed by the same narrow-fix pattern — but no other files in this
task need re-checking, they're confirmed clean.

**Status addendum #1 fix (2026-09-08):** All genuine misses and optional placeholder improvements fixed. Mobile locale files have 314 leaf keys each, Web locale files have 264 leaf keys each (100% parity across ru, kk, en, zero drift). Typechecks clean (`npm run typecheck` in mobile, `npx tsc --noEmit` in frontend-web), backend tests clean (92/92 passed).

**Status addendum #2 fix (2026-09-08):** All 4 lines across `residents/page.tsx` and `verifications/page.tsx` fixed after fresh full-file reads:
- `residents/page.tsx:414`: migrated `ИИН: ${resident.iin}` and `Без email` fallback to `${t('common.iin')}: ${resident.iin}` and `t('residents.noEmail')`.
- `residents/page.tsx:552`: migrated `<p>ИИН</p>` heading to `{t('common.iin')}` (RU: «ИИН», KK: «ЖСН», EN: «IIN»).
- `residents/page.tsx:605`: migrated `${o.unit.floor} этаж, ${o.unit.entrance} подъезд` to `t('residents.floorEntrance', { floor, entrance })` (RU: `{{floor}} этаж, {{entrance}} подъезд`, KK: `{{floor}}-қабат, {{entrance}}-кіреберіс`, EN: `floor {{floor}}, entrance {{entrance}}`).
- `verifications/page.tsx:338`: migrated `'Блок'` fallback to `t('common.block')` (RU: «Блок», KK: «Блок», EN: «Block»).
Key parity re-verified: 314 mobile / 268 web leaf keys with 100% parity (0 drift across ru, kk, en). `npm run typecheck` in mobile and `npx tsc --noEmit` in frontend-web clean (0 errors), backend tests 92/92 passed.
