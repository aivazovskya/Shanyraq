# Task 0040: Test coverage for ownership-share invariant + meter access control

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Third coverage-quality pass, same discipline as
[Task 0036](0036-guard-and-redis-test-coverage.md)/
[Task 0039](0039-jwt-strategy-test-coverage.md): pick the highest-risk
untested logic, not the largest percentage gap. Ran
`npx jest --coverage` in `backend/` (2026-09-11) specifically on
`properties.service.ts` (68% lines / 54% branches),
`bookings.service.ts` (73% / 47%), and `meters.service.ts` (58% / 43%)
and read every uncovered line range in all three files to find what's
actually untested, not just how much.

**Two genuinely high-risk gaps found, one lower-risk set of gaps found
and deliberately left out — read before re-litigating scope:**

1. **[properties.service.ts](../backend/src/modules/properties/properties.service.ts)'s
   `claimOwnership`/`verifyOwnership` (lines 273-424) are almost
   entirely untested** — this is the single biggest, highest-value gap
   across all three files. This code enforces that the **sum of all
   verified ownership shares for one unit never exceeds 100%**
   (`claimOwnership`'s pre-check at request time, `verifyOwnership`'s
   re-check at approval time against every *other* verified owner). Per
   [PROGRESS.md](PROGRESS.md), voting weight in this platform is
   literally `area × share` — if this invariant ever silently broke
   (e.g. an off-by-one in the sum comparison, or the "exclude the
   record being verified" `id: { not: record.id }` filter got dropped),
   a unit's total voting weight could exceed its actual area, which is
   a data-integrity bug with real legal/governance consequences for
   ОСС voting outcomes, not just a display glitch.
2. **[meters.service.ts](../backend/src/modules/meters/meters.service.ts)'s
   `getUnitMeters` (lines 35-88) and `getMeterReadings` (lines 246-305)
   are almost entirely untested** — both implement the same
   staff-tenant-match-vs-resident-verified-ownership access pattern this
   project has treated as security-critical everywhere else (it's the
   same shape [Task 0031](0031-tenant-isolation-consolidation.md)
   consolidated into `assertAccessToTenant`, though these two methods
   predate that consolidation and still have their own inline copy — a
   pre-existing duplication this task doesn't need to fix, just test as
   it stands). If the resident branch's
   `unit.ownerships.some((o) => o.userId === user.id && o.isVerified)`
   check ever regressed, a resident could read another unit's meter
   readings — a real BOLA/IDOR gap, not a cosmetic one.
3. **`bookings.service.ts`'s remaining gaps are lower-risk — deliberately
   out of scope for this task.** Its uncovered lines are `updateResource`'s
   operating-hours revalidation (a mechanical duplicate of
   `createResource`'s already-tested check), `getMyBookings`/
   `getTenantBookings` (plain list-assembly queries with no access-control
   branching of their own — `getTenantBookings` delegates to the already
   tested `assertStaffRole`), and a handful of simple not-found throws.
   None of these are an invariant-enforcement or access-control gap in
   the sense of #1/#2 above — they're normal "not every line has its own
   test" gaps, the same category every service in this codebase has.
   Not touched here; a candidate for a future pass only if this project
   later adopts a stricter per-file coverage bar as a blanket policy.

### Architecture decisions already made — do not re-litigate

1. **Scope is exactly the two blocks named above.** Same "don't boil the
   ocean" scoping discipline as Task 0036/0039 — this is not a request
   to bring `properties.service.ts`/`meters.service.ts` to 100%, only to
   cover the two specific pieces of logic where a silent regression
   would be a real invariant/security bug.
2. **Test at the service-method level with a mocked `PrismaService`**,
   same unit-level approach as every other spec file in this codebase —
   no e2e/supertest infrastructure exists here (confirmed in Task 0036),
   not introducing it now.
3. **Don't change either file's behavior.** If a test reveals what looks
   like an actual bug (e.g. the share-sum math, or the ownership-check
   condition), stop and flag it in the PR description rather than fixing
   security/invariant-critical code as a side effect of a coverage task
   — same rule Task 0039 set.

---

## Subtask A — `properties.service.ts`: ownership-share invariant

Extend `properties.service.spec.ts` (create it if it doesn't already
cover this service) with a `claimOwnership`/`verifyOwnership` describe
block:

- **`claimOwnership`**:
  - Rejects a share request when the unit doesn't exist
    (`PROPERTIES.UNIT_NOT_FOUND`).
  - Rejects a duplicate pending request for the same user+unit
    (`PROPERTIES.OWNERSHIP_REQUEST_EXISTS`).
  - Rejects `sharePercent <= 0` and `sharePercent > 100`
    (`PROPERTIES.INVALID_SHARE_RANGE`) — test both boundary directions.
  - **The core invariant**: with existing verified owners already
    summing to, say, 60%, a new claim requesting 50% is rejected
    (`PROPERTIES.SHARE_EXCEEDS_TOTAL`, 60+50 > 100), while a claim
    requesting exactly 40% succeeds (60+40 = 100, boundary — not
    rejected, proving the check is `>` not `>=`).
  - Defaults `sharePercent` to `100.0` when omitted from the DTO.
- **`verifyOwnership`**:
  - Rejects verifying a non-existent record
    (`PROPERTIES.OWNERSHIP_NOT_FOUND`).
  - Cross-tenant rejection: a staff verifier whose `tenantId` doesn't
    match the unit's building's tenant is rejected
    (`PROPERTIES.CROSS_TENANT_VERIFY_FORBIDDEN`); a `SUPERADMIN`
    bypasses this check.
  - **The core invariant, re-checked at approval time against every
    *other* verified owner**: with one other verified owner at 70%,
    approving this record at 40% is rejected
    (`PROPERTIES.CONFIRMED_SHARE_EXCEEDS_TOTAL`, 70+40 > 100) — and
    critically, assert the query excludes the record being verified
    itself (`id: { not: record.id }` — the record under review must not
    be counted against its own approval).
  - Rejection path (`dto.isVerified: false`): the record is deleted
    (not just flagged) and the method returns
    `{ isVerified: false, status: 'REJECTED' }` — confirms a rejected
    claim can be resubmitted later rather than staying stuck.
  - Approval path: `sharePercent` can be adjusted at approval time via
    `dto.approvedSharePercent` (different from the originally requested
    value) and both the ownership record and the owning `User.isVerified`
    are updated.

## Subtask B — `meters.service.ts`: staff-vs-resident access control

Extend `meters.service.spec.ts` with `getUnitMeters`/`getMeterReadings`
coverage:

- **`getUnitMeters`**:
  - `NotFoundException` when the unit doesn't exist.
  - A staff user (`HOA_ADMIN`/`DISPATCHER`/`HOA_CHAIRMAN`/`SUPERADMIN`)
    from the *same* tenant succeeds; a staff user from a *different*
    tenant is rejected via `assertUserBelongsToTenant` (reuse the
    existing tenant-mismatch assertion behavior, don't re-derive it).
  - A resident with a verified ownership on the unit succeeds; a
    resident **without** a verified ownership on this specific unit
    (including a resident who owns a *different* unit entirely) is
    rejected with `METERS.FOREIGN_UNIT_FORBIDDEN` — this is the direct
    regression test for the BOLA risk named above.
- **`getMeterReadings`**: same three cases (staff same-tenant, staff
  cross-tenant, resident with/without verified ownership on this unit)
  — it's a structurally identical access check to `getUnitMeters`, just
  test it independently since it's a separate method with its own copy
  of the logic (per this task's context note #2, the duplication itself
  is out of scope to fix).

---

## Acceptance criteria

- The 100%-share-sum invariant is proven at both `claimOwnership` (request
  time) and `verifyOwnership` (approval time), including the boundary
  case (exactly 100% succeeds, anything over is rejected) and the
  self-exclusion detail in `verifyOwnership`'s re-check query.
- A resident without verified ownership on a given unit cannot read that
  unit's meters or readings, proven for both methods independently.
- No behavior change to either file (decision #3) — any suspected real
  bug found while writing tests is flagged in the PR description, not
  silently fixed.
- `npm test` passes in `backend/` (existing tests + new ones);
  `npx tsc --noEmit` clean.

## Explicitly out of scope

- `bookings.service.ts`'s remaining coverage gaps — context note #3,
  reviewed and deliberately deprioritized as lower-risk.
- Every other uncovered line in `properties.service.ts`/
  `meters.service.ts` (simple not-found throws, `getAllTenants`,
  `createTenant`, `getTenantReadingsQueue`, etc.) — not the target of
  this task.
- De-duplicating `getUnitMeters`/`getMeterReadings`'s copy-pasted
  access-control logic into a shared helper (this project already has
  `assertAccessToTenant` for the three-way staff/resident/SUPERADMIN
  pattern — these two methods use a two-way staff/resident variant
  instead, predating that helper) — a refactor task if ever pursued,
  not this one.

## Deliverable

- One commit is fine (both subtasks are test-only, no shared code
  touched between them).
- PR description states the before/after coverage numbers for the four
  specific methods covered (`claimOwnership`, `verifyOwnership`,
  `getUnitMeters`, `getMeterReadings`), and confirms whether writing
  these tests turned up any real behavioral surprise (decision #3) —
  say so either way.

---

## Review addendum (2026-09-11) — accepted, no issues found

**Verified good:** the ownership-share invariant is tested at both
boundaries in both methods — `claimOwnership`'s 60%+40%=100% succeeds
while 60%+50%>100% is rejected, and `verifyOwnership`'s 70%+30%=100%
succeeds while 70%+40%>100% is rejected — with a direct assertion on
`verifyOwnership`'s re-check query (`unitOwnership.findMany` called with
`id: { not: 'own-record-1' }`), proving the record under review is
excluded from its own approval sum rather than just trusting the code
reads that way. The rejection path (delete + `{ isVerified: false,
status: 'REJECTED' }`) and the approval path (both with and without
`approvedSharePercent` override) are both covered, along with
cross-tenant rejection and the `SUPERADMIN` bypass. `getUnitMeters`/
`getMeterReadings` each get the full four-case matrix: staff same-tenant
(success), staff cross-tenant (rejected via `assertUserBelongsToTenant`),
verified resident on this unit (success, with the exact `include`/`where`
shape asserted), and unverified/other-unit resident (rejected with the
correct `METERS.FOREIGN_UNIT_FORBIDDEN`/`METERS.FOREIGN_READINGS_FORBIDDEN`
codes) — this is the direct regression test for the BOLA risk the task
was written to close.

**Verified independently:** re-ran the full suite (404/404 pass, 24 new
tests) and `tsc --noEmit` (clean). Re-ran coverage myself and confirmed
the exact numbers reported: `properties.service.ts` 93.23%/84.74% stmts/
branches (remaining gaps: `getAllTenants`, `createTenant`, and simple
not-found throws — all explicitly out of scope), `meters.service.ts`
92.42%/77.14% (remaining gaps: `createMeter`/`updateMeter`/`submitReading`/
`reviewReading` not-found throws — also explicitly out of scope). Neither
service file was modified. Task accepted, no fixes required.
