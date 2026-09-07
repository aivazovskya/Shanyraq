# Task 0004: i18n foundation — Kazakh / Russian / English

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

[PRODUCT_SPEC.md](PRODUCT_SPEC.md) §8, open question №5, resolved 2026-09-08:
the platform needs **Kazakh, Russian, and English** — broader than the
original ТЗ text (which only named kk/ru). See [PROGRESS.md](PROGRESS.md).

Today there is **zero i18n infrastructure** anywhere in the codebase. Every
UI string in both `mobile/` and `frontend-web/` is hardcoded in Russian
directly inside JSX. This task builds the foundation and fully migrates the
highest-value, most self-contained slice of each app (shared chrome + the
first-run auth flow) as a working proof of the pattern. It deliberately does
**not** attempt to migrate every screen in one shot — see "Explicitly out of
scope" below for why, and what's tracked as follow-up.

**Architecture decisions already made — do not re-litigate:**

1. **Client-side i18n, no locale-based routing.** For the web dashboard,
   don't adopt `next-intl`'s `/[locale]/...` routing convention — that would
   require moving every existing page under `app/[locale]/...`, which is a
   large structural change disproportionate to what an internal staff tool
   needs (no SEO/per-locale-URL requirement here, unlike a public marketing
   site). Use `i18next` + `react-i18next` with a client-side provider
   instead, same library family on both mobile and web for consistency.
2. **Client-local language preference, not server-persisted.** Store the
   user's chosen language locally (mobile: alongside existing token storage;
   web: `localStorage`). A per-user setting synced server-side across
   devices is a reasonable future improvement, not in scope here — don't add
   a backend field/endpoint for it in this task.
3. **Backend messages stay in Russian for now.** Every exception/success
   message thrown across the NestJS backend (`auth.service.ts`,
   `votings.service.ts`, etc.) is a hardcoded Russian string returned
   directly in API responses and shown to users via `getApiErrorMessage()`
   (mobile) / `err.message` (web). Properly localizing these means
   introducing an error-code system and touching essentially every service
   in the backend — a large, separate effort. This task does not touch the
   backend at all. The result: UI chrome will be multilingual, but
   server-driven error/success messages will stay in Russian until that
   follow-up task happens. That's an accepted, temporary inconsistency, not
   a bug to fix here.
4. **Translations are first draft, not production-quality.** Whoever
   implements this should produce reasonable kk/en translations, but flag
   explicitly in the PR description that **Kazakh and English copy has not
   been reviewed by a native speaker** and should not be treated as final —
   this is real user-facing product content (legal/condo terms like ОСС,
   ОСИ, СКУД carry specific meaning), not throwaway text.

---

## Subtask A — Mobile: i18n infrastructure

- Add `i18next`, `react-i18next`, and `expo-localization` (for device-locale
  detection) to `mobile/package.json`.
- Create `mobile/src/i18n/`:
  - `index.ts` — i18next init, wired to `react-i18next`.
  - `locales/ru.json`, `locales/kk.json`, `locales/en.json`.
  - Namespace the JSON by feature area even though only some are populated
    now, so future migration work has an obvious place to add keys:
    `common`, `auth`, `profile`, `onboarding`, `access`, `votings`,
    `requests`, `announcements`. Only `common`, `auth`, `profile`, and
    whatever's needed for navigation chrome need real content in this task
    — the rest can start as empty objects.
- Default language: Russian. On first launch, attempt device-locale
  detection via `expo-localization`; if the device locale is `kk` or `en`,
  use it, otherwise fall back to `ru`. Once the user explicitly picks a
  language, that choice always wins over device detection on subsequent
  launches.
- Persist the explicit choice following the existing storage convention in
  [token-storage.ts](../mobile/src/storage/token-storage.ts) — add a sibling
  `mobile/src/storage/locale-storage.ts` using `expo-secure-store` (already
  a dependency), rather than introducing a new storage library for a single
  preference value.
- Add a language switcher to
  [ProfileScreen.tsx](../mobile/src/screens/profile/ProfileScreen.tsx):
  three options, labeled in their own language ("Қазақша" / "Русский" /
  "English"), switching applies immediately without requiring app restart.

## Subtask B — Mobile: migrate navigation chrome + auth flow

Migrate **only** these files to use `t('namespace.key')` via `react-i18next`,
with matching entries added to **all three** locale JSON files (no key
translated in only one or two languages):

- [MainTabs.tsx](../mobile/src/navigation/MainTabs.tsx) — tab bar labels.
- Any static titles/headers in
  [RootNavigator.tsx](../mobile/src/navigation/RootNavigator.tsx) and
  [AuthStack.tsx](../mobile/src/navigation/AuthStack.tsx).
- [PhoneInputScreen.tsx](../mobile/src/screens/auth/PhoneInputScreen.tsx) and
  [OtpVerifyScreen.tsx](../mobile/src/screens/auth/OtpVerifyScreen.tsx) —
  full screen text (labels, buttons, helper text, validation messages that
  originate in the component itself, not messages that come back from the
  API).
- [ProfileScreen.tsx](../mobile/src/screens/profile/ProfileScreen.tsx) —
  full screen text, since this is where the switcher lives and should fully
  demonstrate the pattern working.

**Do not** touch any other screen (`DashboardScreen`, `AccessScreen`,
`VotingsListScreen`, `RequestsListScreen`, `AnnouncementsScreen`, etc.) —
those keep their hardcoded Russian strings for now. This is intentional
scope control, not an oversight.

## Subtask C — Web: i18n infrastructure + chrome migration

- Add `i18next`, `react-i18next` to `frontend-web/package.json`.
- Create `frontend-web/src/i18n/` with the same namespace convention as
  mobile (`locales/ru.json`, `locales/kk.json`, `locales/en.json`), adapted
  to this app's own screens — doesn't need to share literal files with
  mobile, just the same organizational pattern.
- Wire an `I18nextProvider` around the app (check whether this needs to go
  in a root layout or can be scoped to `dashboard/layout.tsx` + the public
  landing page individually — every page touched by this task currently
  reads as `'use client'`, so a client-only provider should be sufficient;
  if that assumption turns out wrong for some page, flag it rather than
  reaching for server-side i18n machinery).
- Store the chosen language in `localStorage`, following whatever pattern
  [lib/api.ts](../frontend-web/src/lib/api.ts) already uses for session
  storage, for consistency.
- Add a language switcher (simple dropdown is fine) to:
  - [dashboard/layout.tsx](../frontend-web/src/app/dashboard/layout.tsx)'s
    header, near the existing status badges.
  - [app/page.tsx](../frontend-web/src/app/page.tsx) (the public
    landing/login page) — this is outside the dashboard layout and pre-auth,
    so needs its own switcher instance.
- Migrate **only**: `dashboard/layout.tsx` (nav item labels, role labels in
  the user footer, logout button, header badges) and `app/page.tsx` (full
  page text). **Do not** touch `votings`, `requests`, `access`,
  `announcements`, `verifications`, or `residents` pages in this task.

**Acceptance criteria (all subtasks):**
- Switching language in mobile Profile immediately updates tab bar labels
  and Profile screen text, and the choice persists across an app restart;
  auth-flow screens show the chosen language on next login attempt.
- Switching language in the web header immediately updates nav/header
  chrome and the login page, and persists across a page reload.
- All three locale JSON files have the same set of keys for every namespace
  touched by this task — no key present in `ru.json` but missing from
  `kk.json`/`en.json` (a quick equality check across the three files' key
  sets, even just a one-off script run during development, is worth doing —
  a missing key silently renders as the raw key string or blank, which is
  an easy mistake to ship unnoticed).
- Everything outside the explicitly listed files continues to work exactly
  as before, in Russian, unaffected by the new providers being mounted.
- `npx tsc --noEmit` clean in both `mobile/` and `frontend-web/`.

## Explicitly out of scope

- **Backend message localization** — large separate effort (error-code
  system needed across every service), tracked as a future task once this
  foundation is validated.
- **Migrating remaining screens** (mobile: Dashboard/Access/Votings/
  Requests/Announcements; web: votings/requests/access/announcements/
  verifications/residents pages) — deliberate scope cut for this task, to
  be picked up as follow-up work once this pattern is proven out. Note this
  explicitly in `PROGRESS.md` after this task lands so it isn't forgotten.
- **Server-persisted per-user language preference** — client-local only.
- **RTL layout support** — not needed, kk/ru/en are all left-to-right.
- **Professional translation review** — see architecture decision #4 above.

## Deliverable

- Subtasks A, B, C in one PR (or per-app commits), passing `npx tsc --noEmit`
  in both `mobile/` and `frontend-web/`, and existing test suites unaffected.
- PR description must explicitly flag: (1) translations are first-draft and
  need native-speaker review before real users see them, (2) the exact list
  of screens NOT migrated in this pass, so it can be turned into the next
  task directly.
