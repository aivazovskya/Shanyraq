# Task 0068: "Resolved" status for dispatcher chat conversations

**Status:** Completed
**Assignee:** Team lead (implementing directly while Antigravity is
out of quota, per the user's explicit instruction)
**Reviewer:** N/A for this task while implemented directly — an
independent review can be requested separately if desired.

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[schema.prisma](../backend/prisma/schema.prisma):** `model Conversation`
(line 742) has no status field of any kind — `@@unique([tenantId,
residentId])` means each resident has exactly **one lifelong thread**
with the ЖК's dispatcher service (not a per-incident ticket). Every
conversation a dispatcher has ever touched stays in
`getTenantConversations`'s list forever with no way to mark it
"handled," making the inbox impossible to triage at scale — there is
no way to distinguish "resident is still waiting on us" from "this was
resolved three weeks ago."

**This is a fundamentally different shape from a ticket system**, and
that difference drives the design: a conversation isn't "closed" the
way a `ServiceRequest` is — a resident can message again at any time on
the exact same thread. A naive one-way "resolved" flag that only ever
gets set would silently hide a *new* resident message on an
already-marked-resolved thread, which is worse than having no status
at all. The design below auto-reopens on new resident activity for
exactly this reason.

### Architecture decisions already made — do not re-litigate

1. **New columns on `Conversation`: `isResolved Boolean @default(false)`,
   `resolvedAt DateTime?`, `resolvedById String?`** (+ a named
   `resolvedBy` relation to `User`, since `Conversation` already has an
   unnamed-by-necessity... actually a *named* `resident` relation to
   `User` — `@relation("ConversationsAsResident", ...)`
   ([schema.prisma:752](../backend/prisma/schema.prisma#L752)) — adding
   `resolvedBy` makes this the same "two relations to `User`, both need
   names" situation already solved twice this session for
   `CommunityListing` and `Announcement`. `User` gains
   `conversationsResolved Conversation[] @relation("ConversationsResolved")`.
2. **Role gate: reuse `ChatService.assertStaffRole`'s exact set**
   — `[DISPATCHER, HOA_ADMIN, SUPERADMIN]`
   ([chat.service.ts:53-67](../backend/src/modules/chat/chat.service.ts#L53-L67)),
   this module's own established staff convention (deliberately
   narrower than `access-control`'s or `analytics`'s — no
   `HOA_CHAIRMAN`, no `SECURITY` — chat has never included either role
   anywhere in this module and this task doesn't change that).
3. **Auto-reopen on the next resident message — no manual "reopen"
   action.** `sendResidentMessage`'s existing
   `conversation.update` call
   ([chat.service.ts:291-297](../backend/src/modules/chat/chat.service.ts#L291-L297))
   gains `isResolved: false, resolvedAt: null, resolvedById: null`
   unconditionally (idempotent — harmless when it was already
   unresolved). A staff reply (`sendStaffMessage`) does **not** change
   `isResolved` either direction — only an explicit resolve action or a
   new resident message changes the flag, matching the reasoning in
   Context: resolving is a deliberate staff judgment call, reopening is
   an automatic consequence of new resident activity, and a staff
   reply alone is neither.
4. **One-directional manual action: resolve only, no manual "reopen"
   endpoint.** If staff resolves by mistake, the thread naturally
   reopens the moment the resident writes again; a manual reopen
   button is a separate, smaller feature that can be added later if
   actually requested — avoids building an unrequested second
   endpoint now.
5. **`getTenantConversations` gains an optional `?resolved=true|false`
   query filter** (`where.isResolved`), additive and non-breaking —
   omitting it returns everything exactly as today. Sort order
   (`orderBy: { updatedAt: 'desc' }`) is left untouched — no attempt to
   force unresolved threads to the top, since `@updatedAt` already
   naturally bumps a conversation whenever anyone touches it (including
   a resolve action), so filtering solves the triage need without a
   riskier sort-order change.
6. **Real-time broadcast on resolve, mirroring the existing
   `chat.message.created` → `chat:tenant:<id>:inbox` room pattern**
   ([realtime.gateway.ts:262-278](../backend/src/modules/realtime/realtime.gateway.ts#L262-L278)) —
   this module already wires the dispatcher inbox for live updates, so
   a resolve action happening in the same room without a broadcast
   would be a visible regression relative to what dispatchers already
   expect (messages already arrive live; a status change silently
   requiring a manual refresh would stick out). Emit
   `chat.conversation.resolved` from the service,
   `chat:inbox:conversation-status` to the tenant inbox room from the
   gateway — same event-emitter mechanism already used, no new
   infrastructure.

---

## Subtask A — Backend: resolve endpoint + auto-reopen + realtime

In [schema.prisma](../backend/prisma/schema.prisma) (decision #1): add
the three columns and the named relation to `Conversation`; add the
back-relation to `User`. Run `prisma generate` (same no-reachable-
Postgres caveat as every schema change this session — `db push` is a
separate step for the user once a database is available).

In [chat.service.ts](../backend/src/modules/chat/chat.service.ts):

- Add `resolveConversation(id, user)`: `assertStaffRole`, `findUnique`,
  `NotFoundException` (`CHAT.CONVERSATION_NOT_FOUND`, matching
  `getConversationMessages`'s existing code) if missing,
  `assertAccessToTenant(user, conversation.tenantId)` (decision #2's
  role check already ran; this is the tenant-isolation half, same
  two-step order `getConversationMessages` already uses). Update to
  `isResolved: true, resolvedAt: new Date(), resolvedById: user.id`.
  Emit `chat.conversation.resolved` with `{ conversationId, tenantId,
  isResolved: true, resolvedAt, resolvedById }` (decision #6) — same
  `@Optional() eventEmitter` already injected, same try/catch-and-log
  pattern `sendResidentMessage` already uses around its own emit.
- In `sendResidentMessage`'s existing `conversation.update` call, add
  the three reset fields (decision #3).
- In `getTenantConversations`, accept an optional `resolved?: boolean`
  param, add `whereClause.isResolved = resolved` when provided
  (decision #5); include `isResolved`/`resolvedAt`/`resolvedById` in
  the mapped response shape (currently hand-picks fields, so this is
  an explicit addition, not automatic).
- Also include `isResolved`/`resolvedAt`/`resolvedById` in
  `getConversationMessages`'s returned conversation object (currently
  spreads `...conversation`, so these come through automatically once
  they exist on the model — verify, don't just assume).

In [chat.controller.ts](../backend/src/modules/chat/chat.controller.ts):

- `PATCH conversations/:id/resolve`, `@Roles(DISPATCHER, HOA_ADMIN,
  SUPERADMIN)` (decision #2), no body needed.
- `GET tenants/:tenantId/conversations` gains `@Query('resolved')
  resolved?: string` parsed to boolean (`'true'`/`'false'`) and passed
  through (decision #5).

In [realtime.gateway.ts](../backend/src/modules/realtime/realtime.gateway.ts)
(decision #6):

- `@OnEvent('chat.conversation.resolved')` handler emitting
  `chat:inbox:conversation-status` to `chat:tenant:${tenantId}:inbox`
  with `{ conversationId, isResolved, resolvedAt, resolvedById }` —
  same shape/style as `handleChatMessageCreated`'s existing inbox
  relay.

**Tests:** extend `chat.service.spec.ts`:
- Each of `DISPATCHER`/`HOA_ADMIN`/`SUPERADMIN` can resolve; a resident
  and a cross-tenant staff member are rejected (`ForbiddenException`).
- Resolving sets `isResolved`/`resolvedAt`/`resolvedById` correctly and
  emits `chat.conversation.resolved`.
- A resident sending a new message on an already-resolved conversation
  resets `isResolved` to `false` (the property this task exists to get
  right — auto-reopen).
- A staff reply (`sendStaffMessage`) does **not** change `isResolved`
  either direction (proves decision #3's "reply alone is neutral"
  rule).
- `getTenantConversations({ resolved: true })` /
  `{ resolved: false }` correctly filter; omitting the param returns
  both.
- Non-existent conversation → `NotFoundException`.

Extend `realtime.gateway.spec.ts`: `chat.conversation.resolved` relays
to the correct `chat:tenant:<id>:inbox` room with the correct payload
shape (mirroring the existing `chat.message.created` inbox-relay test).

---

## Acceptance criteria

- Staff can mark a conversation resolved; it correctly disappears from
  a `?resolved=false` filtered view and reappears in `?resolved=true`.
- A new resident message on a resolved conversation reopens it
  automatically — proven by a dedicated test, since this is the
  property that most distinguishes this feature from a naive
  ticket-style status flag.
- A staff reply alone never changes the resolved flag either direction.
- Connected dispatcher sessions receive the resolve event live in the
  tenant inbox room.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- A manual "reopen" endpoint — per decision #4.
- Web/mobile UI (a "Решено" button/badge on the dispatcher inbox page)
  — backend + realtime-event mechanism only in this task, matching the
  staged approach [Task 0064](0064-announcement-removal.md)/
  [0065](0065-announcement-removal-web-ui.md) already used; a UI
  follow-up can be its own task if wanted next.
- Any change to `ServiceRequest`'s own, already-existing status
  lifecycle — that's a genuinely different, ticket-shaped domain and
  is untouched by this task.
- Sorting unresolved conversations to the top of the list — per
  decision #5, filtering covers the need without changing existing
  sort behavior.

---

## Deliverable

- Single backend commit.
- PR description confirms the auto-reopen-on-new-resident-message test
  result explicitly — that's the property most worth calling out,
  since it's what prevents this feature from silently hiding a
  resident who wrote back after being marked "resolved."

---

## Implementation notes (2026-09-14)

Implemented exactly per the spec above.

**Schema:** `Conversation` gained `isResolved Boolean @default(false)`,
`resolvedAt DateTime?`, `resolvedById String?`, and a named
`resolvedBy` relation (`@relation("ConversationsResolved")`) — the
`resident` relation was already named, so no rename was needed there
(unlike the `Announcement`/`CommunityListing` cases earlier this
session where the *first* relation had to be retrofitted with a name).
`User` gained the matching `conversationsResolved` back-relation.
`prisma generate` ran clean (no reachable Postgres in this environment
to `db push` against, same outstanding limitation as every schema
change this session).

**Backend:** `resolveConversation(id, user)` added to `chat.service.ts`
— `assertStaffRole` then `assertAccessToTenant`, matching
`getConversationMessages`'s exact two-step order, sets the three
fields and emits `chat.conversation.resolved`.
`sendResidentMessage`'s existing `conversation.update` call now also
resets `isResolved`/`resolvedAt`/`resolvedById` unconditionally.
`sendStaffMessage` was verified (not modified) to leave the flag alone
in either direction. `getTenantConversations` gained an optional
`resolved?: boolean` parameter → `where.isResolved`, and the mapped
response now carries the three new fields. `getConversationMessages`
needed no code change — it spreads the raw `conversation` object, so
the new scalar columns flow through automatically once queried
(verified by reading the method, per the spec's explicit "don't just
assume" instruction). `PATCH /chat/conversations/:id/resolve` and
`?resolved=` on the tenant-conversations list route added to the
controller. `realtime.gateway.ts` gained
`@OnEvent('chat.conversation.resolved')` relaying
`chat:inbox:conversation-status` to the tenant inbox room, mirroring
`handleChatMessageCreated`'s existing structure exactly.

Tests added: 8 new in `chat.service.spec.ts` (all three allowed roles
can resolve via `it.each`, resident and cross-tenant rejection,
not-found, the auto-reopen property on `sendResidentMessage`, and the
staff-reply-is-neutral property on `sendStaffMessage`, plus 3 for the
`getTenantConversations` filter variants) and 1 new in
`realtime.gateway.spec.ts` for the inbox relay.

**Verified:** `chat.service.spec.ts` 37/37, `realtime.gateway.spec.ts`
16/16, full backend suite 607/607 (31 suites, 0 regressions — 595
prior + 12 net new), `tsc --noEmit` clean. No i18n changes (backend +
realtime-event mechanism only, no UI surface, matching the "explicitly
out of scope: web/mobile UI" decision).

**Caveat:** implemented and verified by the same person (the
architect, standing in for Antigravity while it's out of quota) — no
independent second-pass review, same as every self-implemented task
this session (0056-0061, 0064-0067). Ask separately if one is wanted.
