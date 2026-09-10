# Task 0031: Consolidate duplicated tenant-isolation authorization logic

**Status:** Ready for Antigravity
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Companion to [Task 0030](0030-code-quality-cleanup-low-risk.md), split out
separately because this one touches tenant-isolation **authorization**
logic across six backend modules — the same category of code Task 0019's
security audit scrutinized closely. Treat this with that level of care:
the goal is byte-for-byte identical authorization behavior, achieved
through one shared implementation instead of several independent copies
that have already started drifting apart in practice (see decision #1).

Two genuinely different situations were found, and they need **different
treatment** — do not flatten them into the same fix:

1. `bookings.service.ts`, `chat.service.ts`, `community-board.service.ts`
   each have their own **private, verbatim-identical** `assertAccessToTenant`
   method (confirmed by reading all three — `chat.service.ts` and
   `community-board.service.ts`'s own doc comments admit they were copied
   from `bookings.service.ts`). This method does **three-way**
   authorization: SUPERADMIN bypass → staff-role tenant match → resident
   verified-unit-ownership fallback (a DB query). This is **more than**
   what the existing shared `assertUserBelongsToTenant`
   ([tenant.guard.ts](../backend/src/common/guards/tenant.guard.ts)) does
   — that helper has no resident-ownership branch at all. **These three
   modules need a new shared helper, not a swap to the existing one** —
   swapping to `assertUserBelongsToTenant` would silently break resident
   access to bookings/chat/community-board (residents don't necessarily
   have `user.tenantId` populated the same way staff do; the existing
   verified-ownership check is the correct, more precise resident path).
2. `sos.service.ts`'s `resolve()` method, `votings.service.ts`'s
   `getMeetingDetails()`, and `service-requests.service.ts`'s several
   methods each have their own inline check that is **only** ever reached
   for a caller already known to be staff-or-SUPERADMIN in that code path
   (confirmed by reading each: no resident-ownership logic exists in any
   of these three inline checks, just a direct `user.tenantId !==
   targetTenantId` comparison). **These three genuinely can migrate
   directly to the existing `assertUserBelongsToTenant`** — it's a 1:1
   behavioral match, not a functionality reduction.

### Architecture decisions already made — do not re-litigate

1. **New shared helper for the three-way check, living next to the
   existing one.** Add `assertAccessToTenant` to
   [tenant.guard.ts](../backend/src/common/guards/tenant.guard.ts) (or a
   new file in `backend/src/common/guards/` if you prefer keeping
   `tenant.guard.ts` focused on the simpler helper — your call), as a
   standalone async function (not a service method) taking `prisma:
   PrismaService` explicitly as a parameter, since it's no longer a
   method with `this.prisma` available. Parameterize the three error
   codes it can throw (auth-required, staff-cross-tenant,
   resident-access-forbidden) so each calling module keeps its own
   `{ code, message }` prefix (`BOOKINGS.*`, `CHAT.*`,
   `COMMUNITY_BOARD.*`) — **the exact `message` text for each module's
   three codes must stay byte-for-byte what it is today**, only the
   implementation moves.
2. **`assertUserBelongsToTenant` itself does not change.** Findings #2's
   three modules adopt it as-is; don't modify its signature or behavior
   to accommodate them.
3. **Keep genuinely-different narrower role rules as explicit additional
   checks, layered on top — don't fold them into the shared helper.**
   E.g. SOS's `HOA_CHAIRMAN`-is-read-only-for-resolve rule and
   `service-requests`' status-change role gate are specific to those
   methods, not general tenant-membership rules — they stay as separate
   `@Roles`/inline checks exactly as today, only the tenant-membership
   comparison itself gets deduplicated.
4. **This is a pure refactor — zero behavior change.** Every existing
   test for all six affected modules must pass completely unmodified. If
   making a test pass requires changing its expectation, stop and treat
   that as a signal you've changed behavior, not just relocated it.

---

## Subtask A — New shared `assertAccessToTenant` helper

- Extract the three-way logic (identical in all three source copies) into
  one exported async function in `tenant.guard.ts`. Signature roughly:
  `assertAccessToTenant(prisma: PrismaService, user: any, tenantId: string,
  codes: { authRequired: string; staffForbidden: string; residentForbidden:
  string })`, returning `Promise<boolean>` (true = staff/SUPERADMIN, false
  = resident) exactly as the original three methods do — callers use this
  return value.
- Write a direct test for the new helper covering: no user → auth-required
  code; SUPERADMIN → bypass, returns true; staff of matching tenant →
  true; staff of different tenant → staff-forbidden code; resident with
  verified ownership in the tenant → false; resident without → resident-forbidden
  code. This is new, focused coverage for logic that previously only had
  indirect coverage via three separate services' specs.

## Subtask B — Migrate the three verbatim copies

- `bookings.service.ts`, `chat.service.ts`, `community-board.service.ts`:
  remove each module's own `assertAccessToTenant` method, call the new
  shared helper instead (passing that module's own three existing error
  codes — do not rename any of them). Remove the now-inaccurate doc
  comments admitting the copy-paste (`chat.service.ts`'s "Скопировано
  verbatim..." and `community-board.service.ts`'s "Полностью
  повторяет...") along with the code they were describing.
- Since `chat.service.ts`'s and `community-board.service.ts`'s versions
  were `public` (called from `RealtimeGateway` per
  [Task 0020](0020-realtime-websocket.md)), make sure the gateway's call
  sites still work — they can call the new shared helper directly, or the
  service can keep a thin public wrapper that delegates to it, your
  call, as long as `RealtimeGateway`'s existing calls don't need to
  change their own code.

**Test:** all existing tests for `bookings`, `chat`, `community-board`
(services) and the `RealtimeGateway` spec pass unmodified.

## Subtask C — Migrate the three simple-comparison call sites

- `sos.service.ts`'s `resolve()`: replace the inline
  `if (user.role !== UserRole.SUPERADMIN && alert.tenantId !== user.tenantId)`
  block with a call to `assertUserBelongsToTenant(user, alert.tenantId,
  ...)`, keeping the exact same `SOS.CROSS_TENANT_PROCESS_FORBIDDEN`
  message text (check whether `assertUserBelongsToTenant`'s generic
  message matches or whether you need to verify its `entityName` param
  produces byte-identical text — if it can't match exactly, flag this
  rather than silently changing the message).
- `votings.service.ts`'s `getMeetingDetails()`: same treatment for its
  inline tenant check (currently duplicates the same pattern
  `votings.controller.ts`'s `getMeetingsByTenant` already correctly
  handles via `assertUserBelongsToTenant`).
- `service-requests.service.ts`: the repeated inline `isStaff` array +
  tenant comparison (four call sites: `createRequest`, `getRequestById`,
  `updateStatus`, `addComment`) — each already branches on `isStaff`
  first; within that branch, replace the tenant comparison with
  `assertUserBelongsToTenant`. **Do not touch the non-staff branches**
  (creator-id checks for residents) in any of these methods.

**Test:** all existing tests for `sos`, `votings`, `service-requests`
pass unmodified.

---

## Acceptance criteria

- One new shared `assertAccessToTenant` helper replaces three verbatim
  copies; `assertUserBelongsToTenant` replaces three simple inline
  duplicates elsewhere — confirmed these are the *right* helper for each
  case per decisions #1/#2, not swapped.
- Every module's own error codes and message text are preserved exactly
  — this task changes *where* the check lives, never what it says or how
  it decides.
- All existing tests across all six affected modules
  (`bookings`, `chat`, `community-board`, `sos`, `votings`,
  `service-requests`) plus `RealtimeGateway` pass with zero modifications
  to their expectations.
- New direct test coverage for the extracted `assertAccessToTenant`
  helper (Subtask A).
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean.
- No i18n changes needed (no new error codes, no message text changes).

## Explicitly out of scope

- `service-requests.service.ts`'s resident-facing (`creatorId`) checks —
  untouched, decision #3.
- SOS's `HOA_CHAIRMAN` read-only rule, service-requests' status-change
  role gate, or any other role-specific rule beyond plain tenant
  membership — decision #3.
- Any change to `@Roles` decorators or `RolesGuard` — this task is
  entirely about service-level authorization helpers.
- The low-risk items from [Task 0030](0030-code-quality-cleanup-low-risk.md)
  (dead code, mobile boolean consolidation, request labels, stray
  comments) — separate task, don't combine the PRs.

## Deliverable

- Prefer separate commits for Subtask A+B (the new-helper introduction)
  vs. Subtask C (the simple-comparison migrations), since they're
  independent and the first is the riskier one worth isolating for easy
  revert if needed.
- PR description explicitly confirms: "zero test expectations changed
  across all six modules" (or explains precisely which one needed a
  change and why, if any did — that would be worth flagging to the
  reviewer rather than silently included).
