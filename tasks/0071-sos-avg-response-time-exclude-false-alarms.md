# Task 0071: Exclude false alarms from SOS average response time

**Status:** Completed
**Assignee:** Team lead (implementing directly while Antigravity is
out of quota, per the user's explicit instruction)
**Reviewer:** N/A for this task while implemented directly — an
independent review can be requested separately if desired.

## Context

Narrow fix, discovered while researching a different beyond-ТЗ request.
**The user originally asked for "false alarm marking for SOS calls" —
researched and found this is already fully built end-to-end**
([Task 0049](0049-sos-statistics-and-trends.md)): `SosAlertStatus`
already has `FALSE_ALARM`, `ResolveSosDto` already validates
`status: RESOLVED | FALSE_ALARM`, `getSosStatistics`'s `byStatus`
already breaks it out separately from `RESOLVED`, the CSV export
already labels it "Ложная тревога", and the web dashboard
([sos/page.tsx](../frontend-web/src/app/dashboard/sos/page.tsx)) already
has a dedicated "Ложный вызов" button, status badges, and a
RESOLVED/FALSE_ALARM stats card. No new feature needed there.

**What actually is a gap, confirmed by reading
`getSosStatistics`
([sos.service.ts:219-315](../backend/src/modules/sos/sos.service.ts#L219-L315)):**
`averageResponseTimeMinutes` is computed from `if (alert.resolvedAt)`
with no status check — it folds `FALSE_ALARM` closures into the same
average as genuine `RESOLVED` incidents. A security team's "average
response time" metric is meant to represent how fast they react to
real emergencies; mixing in however long it took someone to notice and
dismiss a false alarm skews that number in either direction depending
on how fast/slow false alarms tend to get closed.

### Architecture decisions already made — do not re-litigate

1. **Only `averageResponseTimeMinutes` changes — `byStatus.FALSE_ALARM`
   stays exactly as-is.** The count breakdown is already correct and
   already exactly what a UI needs to show "3 false alarms this
   month"; this task touches only the response-time average
   calculation, nothing else in this method.
2. **Filter condition: `alert.status === RESOLVED && alert.resolvedAt`**
   instead of just `alert.resolvedAt`. A `FALSE_ALARM` alert still has
   `resolvedAt` set (per `resolve()`'s own code, `resolvedAt` is set
   for both outcomes) — the fix is adding the status check, not
   changing anything about how `resolvedAt` itself is set or stored.
3. **Web: add a one-line clarifying caption under the average-response-
   time stat card** stating it excludes false alarms — otherwise the
   number visibly changes after this fix ships with no on-screen
   explanation of why. Full kk/ru/en i18n parity for the new string.

---

## Subtask A — Backend

In [sos.service.ts](../backend/src/modules/sos/sos.service.ts),
change the `averageResponseTimeMinutes` loop's condition from
`if (alert.resolvedAt)` to
`if (alert.status === SosAlertStatus.RESOLVED && alert.resolvedAt)`
(decision #2). `resolvedCount`/`totalResponseMinutes` accumulate only
for genuine `RESOLVED` alerts now.

**Tests:** extend `sos.service.spec.ts` — a tenant with one `RESOLVED`
alert (10 min to close) and one `FALSE_ALARM` alert (2 min to close)
reports `averageResponseTimeMinutes: 10`, not an average blending both
— the property this task exists to fix. `byStatus.FALSE_ALARM` still
correctly counts the false alarm (proves decision #1 — nothing else
regressed).

## Subtask B — Web

In [sos/page.tsx](../frontend-web/src/app/dashboard/sos/page.tsx), add
a small caption under the average-response-time value (decision #3),
e.g. `t('sos.avgResponseTimeExcludesFalseAlarms')`. Add the key to all
three web dictionaries.

---

## Acceptance criteria

- `averageResponseTimeMinutes` reflects only genuine `RESOLVED`
  incidents, proven by the mixed-fixture test.
- `byStatus` counts are unaffected.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/` and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- Any change to `resolve()`, `exportAlertsCsv`, or the `byStatus`
  breakdown — all already correct, per the Context section's research.
- A separate "average false-alarm dismissal time" metric — not
  requested; can be its own task if actually wanted.

---

## Deliverable

- Single commit (backend fix + the one-line web caption travel
  together since the caption exists specifically to explain the
  backend's new behavior).

---

## Implementation notes (2026-09-14)

Implemented exactly per the spec above.

**Backend:** the `averageResponseTimeMinutes` accumulation condition
in `getSosStatistics` changed from `if (alert.resolvedAt)` to
`if (alert.status === SosAlertStatus.RESOLVED && alert.resolvedAt)`.
Found and fixed a pre-existing test that was actually locking in the
*old*, incorrect behavior: `sos.service.spec.ts`'s
"averageResponseTimeMinutes рассчитывается строго по закрытым вызовам"
test asserted `toBe(15)` for a fixture with a 10-minute `RESOLVED`
alert and a 20-minute `FALSE_ALARM` alert — `(10+20)/2`. Updated that
assertion to `toBe(10)` (only the `RESOLVED` alert now counts) and
added a comment explaining the corrected expectation. Added one new
dedicated test with two `FALSE_ALARM` alerts (2 min and 60 min) plus
one `RESOLVED` (10 min) to make the exclusion unambiguous: if false
alarms were still included the average would be 24, but the correct
result is exactly 10.

**Web:** a small caption ("Без учёта ложных тревог" / "Excludes false
alarms" / "Жалған дабылдарды есептемегенде") added under the
average-response-time stat card in `sos/page.tsx`, so the number's
semantics are visible on screen, not just in code.

**Verified:** `sos.service.spec.ts` 24/24 (23 prior + 1 new, 1
corrected), full backend suite 623/623 (31 suites, 0 regressions),
`tsc --noEmit` clean in both `backend/` and `frontend-web/`, i18n
parity 1105/1105/1105 (+1 key).

**Caveat:** implemented and verified by the same person (the
architect, standing in for Antigravity while it's out of quota) — no
independent second-pass review, same as every self-implemented task
this session (0056-0061, 0064-0070). Ask separately if one is wanted.
