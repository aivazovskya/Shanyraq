# Task 0067: Per-resident voting results CSV export

**Status:** Completed
**Assignee:** Team lead (implementing directly while Antigravity is
out of quota, per the user's explicit instruction)
**Reviewer:** N/A for this task while implemented directly — an
independent review can be requested separately if desired.

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[votings.service.ts](../backend/src/modules/votings/votings.service.ts):**
`closeMeetingAndGenerateProtocol` → `buildMeetingProtocolPdf`
([votings.service.ts:357-470](../backend/src/modules/votings/votings.service.ts#L357-L470))
already generates the official ОСС protocol PDF, but it is
**aggregate-only** — per agenda item it prints `За: X%`, `Против: Y м²`,
`Воздерж.: Z м²` and the final decision, never a per-unit/per-resident
row. There is currently no way to get the actual vote-by-vote roster
(who voted, from which unit, what they chose, when) out of the app at
all — not even on-screen beyond `getMeetingDetails`'s JSON response.
This task adds that as a separate CSV, entirely independent from the
legally-relevant signed PDF protocol.

**Critical security precedent confirmed by reading
`enrichMeetingWithResults`
([votings.service.ts:526-600](../backend/src/modules/votings/votings.service.ts#L526-L600)):**
this method already treats individual voter identity as sensitive —
```
const canViewFullRoster =
  requestingUser &&
  ([UserRole.SUPERADMIN, UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN] as UserRole[]).includes(requestingUser.role);
```
A resident only ever sees their own vote (`myVote`); anyone else's
`votes` array is `undefined` unless the caller is `SUPERADMIN`,
`HOA_ADMIN`, or `HOA_CHAIRMAN` — **`DISPATCHER` is deliberately
excluded**, matching `createMeeting`/`closeMeeting`'s own
`@Roles(HOA_CHAIRMAN, HOA_ADMIN, SUPERADMIN)`
([votings.controller.ts:36](../backend/src/modules/votings/votings.controller.ts#L36)).
This export is exactly the same sensitive data (who voted, how) in a
downloadable form — **the role gate must be identical to
`canViewFullRoster`'s set, not any broader "staff" convention used
elsewhere in this project** (e.g. `DISPATCHER` is included in
announcements'/access-control's staff sets, but must NOT be able to
pull this file).

### Architecture decisions already made — do not re-litigate

1. **Role gate: exactly `[HOA_CHAIRMAN, HOA_ADMIN, SUPERADMIN]`** —
   reuse `canViewFullRoster`'s literal role list, not a new constant
   and not `DISPATCHER`-inclusive. This is the single most important
   property of this task; get this wrong and the export leaks resident
   voting behavior to a role never meant to see it.
2. **Bounded by `meetingId`, not a date range.** Unlike the four prior
   "ever-growing log" CSV exports ([Task 0037](0037-access-log-csv-export.md),
   [0056](0056-sos-alerts-csv-export.md), [0059](0059-dispatcher-chat-transcript-export.md),
   [0062](0062-guest-pass-history-csv-export.md)) and unlike the
   announcement history export just shipped
   ([Task 0066](0066-announcement-history-csv-export.md)), a `Meeting`
   is a single, naturally-bounded event — the export is "every vote
   cast in *this* meeting," matching the "bounded snapshot" reasoning
   [Task 0055](0055-meter-readings-csv-export.md) already established
   for period-scoped data. No `from`/`to` needed.
3. **One flat row per vote, not grouped/nested by agenda item** — a
   meeting can have multiple agenda items
   (`AgendaItem[]`/`Vote.agendaItemId`), so each row carries its own
   "№ вопроса"/"Текст вопроса" columns rather than repeating a
   per-question CSV section. Simpler to generate and to filter/sort in
   Excel afterward.
4. **Fetch votes directly via a dedicated query, not through
   `enrichMeetingWithResults`.** That method's masking logic exists to
   safely serve both residents and staff from one shared response
   shape; this export is reachable only by the three already-privileged
   roles (decision #1), so it queries `agendaItem.findMany` with
   `votes`/`unit`/`building`/`user` included directly — no need to run
   data through a masking path that will never apply here.
5. **Vote choice translated to a small fixed Russian map (`FOR`→"За",
   `AGAINST`→"Против", `ABSTAIN`→"Воздержался")** — a 3-value closed
   enum, safe to hardcode inline, no risk of the enum-transform bug
   class ([Task 0053](0053-booking-resource-utilization-analytics.md))
   since there is no dynamic key derivation involved.
6. **Include `voteHash` as a column** — the whole point of
   [Task 0002](0002-barrier-2fa-pin.md)/HMAC-signed voting is
   independent verifiability; a board member exporting this for a
   dispute should be able to see the cryptographic signature alongside
   the human-readable choice, not just the choice.

---

## Subtask A — Backend: export endpoint

In [votings.service.ts](../backend/src/modules/votings/votings.service.ts),
add `exportMeetingVotesCsv(meetingId, user: { role: UserRole; tenantId?: string | null })`:

- Role check against decision #1's exact set — `ForbiddenException`
  (`VOTINGS.EXPORT_FORBIDDEN`) otherwise.
- Fetch the meeting (`findUnique` with `tenant: true`) —
  `NotFoundException` (`VOTINGS.MEETING_NOT_FOUND`, matching
  `getMeetingDetails`'s existing code) if missing.
- `assertUserBelongsToTenant(user, meeting.tenantId, { code:
  'VOTINGS.CROSS_TENANT_FORBIDDEN', ... })` — reuse
  `getMeetingDetails`'s exact error code.
- Fetch `agendaItem.findMany({ where: { meetingId }, include: { votes:
  { include: { user: { select: firstName, lastName }, unit: {
  include: { building: true } } } } }, orderBy: { orderIndex: 'asc' }
  })` (decision #4).
- Build CSV via `buildCsv`: header rows (meeting title, ЖК name,
  period `startDate`—`endDate`), then columns № вопроса, Вопрос
  повестки дня, Житель (ФИО), Квартира/Помещение, Блок/Подъезд, Выбор
  (decision #5), Вес голоса (м²), Дата голосования, Подпись
  (voteHash, decision #6) — one row per vote across all agenda items,
  in `orderIndex` then `createdAt` order.
- Filename `voting-results-${meetingId}-${dateStr}.csv`.

In [votings.controller.ts](../backend/src/modules/votings/votings.controller.ts):

- `GET :meetingId/votes/export`, `@Roles(HOA_CHAIRMAN, HOA_ADMIN,
  SUPERADMIN)` (decision #1), `@Res()` streaming with
  `Content-Disposition` — same shape as every other CSV export
  controller method in this project (e.g.
  [access-control.controller.ts:106-120](../backend/src/modules/access-control/access-control.controller.ts#L106-L120)).

**Tests:** extend `votings.service.spec.ts`:
- `DISPATCHER` is rejected (`ForbiddenException`) — the one test this
  task must not skip, given decision #1's central risk.
- A resident is rejected.
- Each of `HOA_CHAIRMAN`/`HOA_ADMIN`/`SUPERADMIN` succeeds.
- Cross-tenant staff rejected; `SUPERADMIN` cross-tenant succeeds.
- A meeting with two agenda items and votes on both produces one CSV
  row per vote, each correctly attributed to its own question (proves
  decision #3's flat-row shape doesn't cross-contaminate questions).
- Each of the three `VoteChoice` values renders its correct Russian
  label.
- `voteHash` appears verbatim in the CSV output.
- Non-existent `meetingId` → `NotFoundException`.
- Raw CSV bytes start with the UTF-8 BOM.

---

## Acceptance criteria

- `DISPATCHER` and residents can never call this endpoint —
  proven by dedicated tests, since this is the property that most
  distinguishes this task's risk profile from every prior CSV export
  in this project.
- One CSV row per vote, correctly attributed to its agenda item,
  including the human-readable choice and the raw `voteHash`.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- Any change to `enrichMeetingWithResults`/`getMeetingDetails`'s own
  masking logic — that JSON path is correct for its purpose (serving
  both residents and staff safely) and stays untouched.
- A web download button — backend endpoint only, matching the staged
  approach of every prior CSV export task.
- Mobile UI — this is a board/management reporting tool, not a
  resident-facing feature.

---

## Deliverable

- Single backend commit.
- PR description confirms the `DISPATCHER`-rejected test result
  explicitly — that's the property most worth calling out given this
  task's central risk (a broader "staff" role set leaking resident PII
  to a role that was never allowed to see it in the JSON API either).

---

## Implementation notes (2026-09-14)

Implemented exactly per the spec above, with one refactor beyond the
original text: `enrichMeetingWithResults`'s inline `canViewFullRoster`
role array was extracted into the same `VOTE_FULL_ROSTER_ROLES`
module-level constant the new export method uses, so both places read
from one source of truth instead of two hand-maintained copies of the
same three-role list — reduces the risk of the two ever drifting apart
in a future edit.

**Backend:** `exportMeetingVotesCsv(meetingId, user)` added to
`votings.service.ts` — role check against `VOTE_FULL_ROSTER_ROLES`
(`SUPERADMIN`/`HOA_ADMIN`/`HOA_CHAIRMAN`, `DISPATCHER` excluded),
`meeting.findUnique` + `NotFoundException`, `assertUserBelongsToTenant`
reusing `getMeetingDetails`'s exact `VOTINGS.CROSS_TENANT_FORBIDDEN`
code, then a dedicated `agendaItem.findMany` (not routed through
`enrichMeetingWithResults`) fetching `votes` with `user`/`unit.building`
included. CSV built via `buildCsv`: one row per vote, `VoteChoice`
translated inline (За/Против/Воздержался), `voteHash` included
verbatim. `GET :meetingId/votes/export` added to the controller,
`@Roles(HOA_CHAIRMAN, HOA_ADMIN, SUPERADMIN)`, streamed the same way
as every other CSV export controller method in this project.

Tests added to `votings.service.spec.ts` (14 new, 22 total in the
`exportMeetingVotesCsv` + refactor-covering suite): `DISPATCHER`
rejected before any DB read, a resident rejected, all three allowed
roles succeed (parameterized), cross-tenant staff rejected, `SUPERADMIN`
cross-tenant succeeds, non-existent meeting → `NotFoundException`, a
two-agenda-item/three-vote fixture produces exactly 3 CSV data rows
each correctly attributed to its own question, all three `VoteChoice`
Russian labels present, all three `voteHash` values present verbatim,
and the UTF-8 BOM check.

**Verified:** new tests 22/22 in this file, full backend suite
595/595 (31 suites, 0 regressions — 583 prior + 12 net new), `tsc
--noEmit` clean. No i18n changes (backend-only task, no UI surface,
matching the "explicitly out of scope: web download button" decision).

**Caveat:** implemented and verified by the same person (the
architect, standing in for Antigravity while it's out of quota) — no
independent second-pass review, same as every self-implemented task
this session (0056-0061, 0064-0066). Ask separately if one is wanted.
