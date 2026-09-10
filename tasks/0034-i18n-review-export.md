# Task 0034: Export kk/en translations for native-speaker review

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

[Task 0004](0004-i18n-foundation.md) and
[Task 0005](0005-i18n-remaining-screens.md) shipped full kk/ru/en i18n
coverage across both apps, but explicitly flagged the kk/en copy as
**first-draft, not reviewed by a native speaker** — tracked as an open
item in [PROGRESS.md](PROGRESS.md) §6. Key parity between `ru`/`kk`/`en`
is already 100% in both apps (verified 2026-09-10: 941/941/941 keys in
`frontend-web`, 767/767/767 in `mobile`) — the gap isn't missing
translations, it's *unreviewed* ones. This task doesn't do the review
itself (needs an actual Kazakh/English speaker); it produces the
spreadsheet that makes that review practical to hand off.

### Architecture decisions already made — do not re-litigate

1. **A plain Node script, not a NestJS/Next.js module.** This is a
   one-off developer tool, not part of any app's runtime — it must not
   depend on Prisma, `ConfigService`, or any app's dependency graph, and
   must run as `node scripts/<name>.js` with zero build step (CommonJS,
   no TypeScript compilation needed). Put it in a new top-level
   `scripts/` directory (doesn't exist yet — this is the first thing in
   it), not inside `backend/`, `frontend-web/`, or `mobile/`.
2. **One combined CSV, not one file per app.** Same rationale as
   deciding to unify shared strings across apps where possible: a
   translator reviewing the word for "тариф" or "лицевой счет" should
   see it once and apply consistent judgment, not review the same term
   twice in two disconnected files. Include an `App` column
   (`mobile`/`web`) so the source is traceable.
3. **Reuse the CSV conventions from [Task 0032](0032-finance-analytics-csv-export.md),
   don't reinvent them.** RFC 4180 field escaping (quote fields
   containing commas/quotes/newlines, double internal quotes), UTF-8 BOM
   prefix (mandatory — this sheet is full of Cyrillic and Kazakh
   diacritics, opened directly in Excel by a reviewer who is not a
   developer), CRLF line endings. Since this script can't import
   `backend/src/common/csv/csv.helper.ts` (decision #1 — no cross-package
   dependency on the backend), re-implement the same small escaping
   logic locally rather than adding a shared package for one function.
4. **Translator edits in place, re-import is a separate future task.**
   Don't build a "corrected CSV → JSON" import script now — nobody has
   the corrected file yet, and designing the merge-back format before
   seeing what a real translator actually returns is guessing. This task
   is export-only. When the corrected sheet comes back, that's a new,
   small follow-up task.
5. **Flag likely-high-risk rows, don't try to be exhaustive about it.**
   Condo/property-management terms with specific legal or technical
   meaning (ОСС, ОСИ, СКУД, ИИН, ЖСН, домофон, кворум, тариф, лицевой
   счёт, эцп) are exactly the category [PROGRESS.md](PROGRESS.md) already
   flagged as needing "содержательно верную локализацию" (e.g. the
   ИИН/ЖСН and "этаж/подъезд" grammar work in Task 0004/0005). A simple
   case-insensitive keyword match against the **Russian source** value
   marking a row `priority` is a useful triage aid for a translator with
   limited time — it is a heuristic, not a guarantee of completeness;
   say so in the script's own output (a header comment row or a note in
   the handoff, translator should not skip non-flagged rows entirely).
6. **The generated CSV is a data artifact, not source — don't commit it.**
   Add the output filename/pattern to the root `.gitignore`. The script
   that generates it is what's committed.

---

## Subtask A — Export script

Create `scripts/export-translations-for-review.js`:

- Read the six locale files directly:
  `frontend-web/src/i18n/locales/{ru,kk,en}.json` and
  `mobile/src/i18n/locales/{ru,kk,en}.json`.
- Flatten each nested JSON object to dot-path keys (same approach as the
  ad-hoc parity-check scripts used throughout this project's task
  reviews — e.g. `{"a":{"b":"x"}}` → key `a.b`).
- For each app, for each key (iterate the `ru` file's keys as the source
  of truth — it's the original-authored language): build a row with
  columns `App`, `Key`, `RU`, `KK`, `EN`, `Priority`, `Comment` (empty,
  for the translator's notes).
  - If a key is missing from `kk.json` or `en.json` for a given app
    (shouldn't happen per the current 100%-parity state, but don't
    assume it'll stay that way forever), don't crash — write an empty
    string for that cell and print a warning to the console listing
    exactly which keys were missing, so a real parity regression is
    visible rather than silently producing a malformed review sheet.
  - `Priority` = `"⚠"` if the `RU` value case-insensitively contains any
    of: `осс`, `оси`, `скуд`, `иин`, `жсн`, `домофон`, `шлагбаум`,
    `кворум`, `тариф`, `лицевой счет`, `лицевой счёт`, `эцп`, `протокол`
    — else empty. Keep this keyword list as a plain array at the top of
    the script so it's easy to extend later, not buried in logic.
- Sort rows by `App` then `Key` (mobile block first, then web, each
  alphabetical — arbitrary but stable and predictable for a reviewer
  scrolling the sheet).
- Build the CSV per decision #3 (RFC 4180 escaping, UTF-8 BOM, CRLF) and
  write it to `i18n-review-kk-en.csv` at the repo root.
- Print a short summary to stdout when done: total rows, how many
  flagged `Priority`, and any missing-key warnings from above.
- No CLI flags/arguments needed for a first version — running
  `node scripts/export-translations-for-review.js` with no arguments
  should just work from the repo root.
- Add `/i18n-review-kk-en.csv` to the root `.gitignore` (decision #6).

**Test:** this is a standalone script with no existing test runner wired
to it (it's outside `backend/`'s Jest config and outside both apps) — a
full automated test isn't expected. Instead, verify manually and state in
the PR description:
- Ran the script against the real locale files and confirms row count
  matches `941 + 767 = 1708` (current key counts as of this task, per
  the parity check in [Task 0033](0033-in-app-notification-center.md)'s
  review) minus any duplicates from the flattening logic double-counting
  — reconcile any mismatch rather than shrugging it off.
- Opened the resulting CSV in a spreadsheet application (or inspected raw
  bytes for the UTF-8 BOM, same verification standard as Task 0032) and
  confirms Cyrillic and Kazakh-specific characters (ә, і, ң, ғ, ү, ұ, қ,
  ө, һ) render correctly, not as mojibake.
- Manually spot-checks that a handful of known condo-terminology rows
  (e.g. a key whose Russian value mentions "ОСС" or "лицевой счет") are
  actually marked `Priority = ⚠`.

---

## Acceptance criteria

- `node scripts/export-translations-for-review.js` run from the repo
  root produces `i18n-review-kk-en.csv` with no errors.
- The CSV opens correctly in a real spreadsheet application with correct
  Cyrillic/Kazakh rendering (UTF-8 BOM present).
- Every row has non-empty `App`/`Key`/`RU` (assuming current 100% parity
  holds); any missing kk/en value is surfaced as a console warning, not
  silently blank with no trace.
- Condo/property-specific terminology rows are flagged `Priority = ⚠`.
- The generated CSV itself is not committed; the script is.

## Explicitly out of scope

- Actually reviewing or correcting the kk/en translations — that's a
  human-translator task this CSV enables, not something Antigravity or
  this script does.
- Re-importing a corrected CSV back into the JSON locale files — a
  separate future task once a corrected file actually exists (decision
  #4).
- Backend error-message translation (`errors` namespace content is
  already covered by the existing locale files and this export includes
  it like any other key — but the backend's raw Russian exception
  strings outside i18n are untouched, per Task 0004 decision #3, still
  standing).
- A UI/admin-panel version of this (e.g. an in-app translation-editing
  screen) — this is a one-off CLI export, not a feature.

## Deliverable

- One commit: `scripts/export-translations-for-review.js` +
  `.gitignore` update.
- PR description states the manual verification results from Subtask
  A's test section (row count reconciliation, BOM/Cyrillic/Kazakh
  rendering check, priority-flag spot check).

---

## Review addendum (2026-09-10) — accepted, no issues found

**Verified good:** `scripts/export-translations-for-review.js` is a
standalone CommonJS script with zero dependency on any app's runtime
(decision #1) — confirmed by reading it in full. Flattening, sorting
(mobile before web, alphabetical within), and RFC 4180 escaping
(comma/quote/CR/LF trigger quoting, doubled internal quotes) all
implemented correctly. Re-ran the script independently rather than
trusting the reported output: got the identical result (767 mobile +
941 web = 1708 rows, 157 priority-flagged, 0 missing/orphan keys).
Inspected the raw output bytes myself — UTF-8 BOM (`0xEF 0xBB 0xBF`)
confirmed present, Kazakh-specific characters (ә/і/ң/ғ/ү/ұ/қ/ө/һ) render
correctly in spot-checked rows, and a real comma-containing English
field (`"For secure barrier opening (2FA), please set up..."`) is
correctly quoted while unquoted fields aren't wrapped needlessly.
Priority-flagging spot-checked directly: a `домофон`-keyword row and an
`ОСС`-keyword row both correctly carry `⚠`. Missing/orphan-key detection
logic is present and correctly reports zero for both, matching the
already-known 100%-parity state. `.gitignore` correctly excludes the
generated `/i18n-review-kk-en.csv` — confirmed via `git status` that
only the script and `.gitignore` are new/changed, the CSV itself isn't
tracked. Checked for the one theoretical edge case the spec's flattening
approach doesn't explicitly handle (array-valued locale entries, which
`String(value)`-flattening would mangle) — grepped both `ru.json` files
for array literals and confirmed neither app's locale files use them, so
this is a non-issue in practice, not a latent bug. Task accepted, no
fixes required.
