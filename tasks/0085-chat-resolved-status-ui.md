# Task 0085: Web + mobile UI for the "Resolved" chat conversation status

**Status:** Done
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, direct follow-up to
[Task 0068](0068-chat-conversation-resolved-status.md), which built
the entire backend + realtime mechanism (`isResolved`/`resolvedAt`/
`resolvedById` on `Conversation`, `PATCH conversations/:id/resolve`,
auto-reopen on the next resident message, `?resolved=` filter on `GET
tenants/:tenantId/conversations`, `chat.conversation.resolved` →
`chat:inbox:conversation-status` realtime relay) but explicitly left
the UI for later: "Web/mobile UI (a 'Решено' button/badge on the
dispatcher inbox page) — backend + realtime-event mechanism only in
this task... a UI follow-up can be its own task if wanted next."
**Found by an audit sweep, not a fresh request** — neither
`frontend-web/src/app/dashboard/chat/page.tsx` nor
`mobile/src/screens/staff/StaffChatInboxScreen.tsx`/
`StaffChatThreadScreen.tsx` reference `isResolved`/`resolved` anywhere
today; the whole mechanism has been unreachable from any UI since it
shipped.

**Confirmed by reading the current state of both frontend surfaces:**
- [frontend-web/src/app/dashboard/chat/page.tsx](../frontend-web/src/app/dashboard/chat/page.tsx):
  `ConversationItem` interface has no `isResolved`/`resolvedAt` fields
  yet; the conversation list is fetched via `GET
  /chat/tenants/:tenantId/conversations` with no `resolved` query
  param; the thread header already has a working pattern for a
  per-thread action button (the Task 0078 CSV-export button, gated by
  `canExportCsv`, sitting next to the refresh button — the resolve
  button belongs in that same header row).
- [mobile/src/screens/staff/StaffChatInboxScreen.tsx](../mobile/src/screens/staff/StaffChatInboxScreen.tsx):
  the socket listener is `chat:inbox:message` — the new
  `chat:inbox:conversation-status` event (already emitted by the
  backend per Task 0068 decision #6) needs its own `socket.on(...)`
  handler alongside it, not a repurposing of the existing one.
- `mobile/src/api/chat.ts`'s `Conversation` interface also lacks
  `isResolved`/`resolvedAt`/`resolvedById`, and there's no
  `resolveConversation` method yet.
- Role gate is already settled by Task 0068 decision #2 and doesn't
  need re-deciding: `DISPATCHER`/`HOA_ADMIN`/`SUPERADMIN` only — chat
  has never included `HOA_CHAIRMAN` or `SECURITY` anywhere in this
  module, and this task doesn't change that. Both frontends already
  have an equivalent role check in place for other chat actions (web's
  `canExportCsv`, matching this exact role list) — reuse it, don't
  invent a new one.

### Architecture decisions already made — do not re-litigate

1. **A "Решено" button in the thread header, next to the existing
   export button, visible only when the conversation is currently
   unresolved** — clicking it calls the resolve endpoint and updates
   local state; once resolved, replace the button with a small
   "Решено" badge (not a toggle — per Task 0068 decision #4, there is
   no manual reopen, so don't build a button that implies one).
2. **A resolved/unresolved filter on the inbox list itself** (web: a
   simple two/three-way filter control near the existing search box;
   mobile: a segmented control or filter chips near the top of
   `StaffChatInboxScreen`'s list, matching whatever filter-chip
   pattern this project's other staff list screens already use — e.g.
   `StaffRequestsListScreen.tsx`'s status filter chips — rather than
   inventing a new filter UI pattern) — calling the existing
   `?resolved=true|false` query param. Omitting the filter (an "all"
   state) sends no param, matching the backend's existing additive,
   non-breaking default.
3. **A small "Решено" badge on each conversation list row** when
   `isResolved` is true, so triage doesn't require opening every
   thread — reuse whatever badge/pill component each surface already
   has (web: same inline `<span>` badge style already used elsewhere
   on this page or its siblings; mobile: the shared `Badge` component).
4. **Real-time: listen for `chat:inbox:conversation-status` in both
   surfaces' existing inbox socket connection**, updating the matching
   conversation's `isResolved`/`resolvedAt` in local state without a
   full refetch — mirrors exactly how `chat:inbox:message`/
   `chat:message` are already handled for new messages, same
   dedup-by-id discipline where relevant.
5. **No new i18n reasoning needed beyond the standard bar** — new
   keys (`chat.resolveBtn`, `chat.resolvedBadge`, `chat.filterAll`/
   `filterResolved`/`filterUnresolved`, thread-view equivalents) in
   both `frontend-web` and `mobile` dictionaries, full kk/ru/en parity,
   each app's own existing `chat.*`/`staff.chat.*` namespace.

---

## Subtask A — Web

- Add `isResolved`/`resolvedAt`/`resolvedById` to
  [chat/page.tsx](../frontend-web/src/app/dashboard/chat/page.tsx)'s
  `ConversationItem` interface.
- Add the resolved/unresolved filter (decision #2) feeding `?resolved=`
  on the existing conversations fetch.
- Add the per-row badge (decision #3) and the thread-header resolve
  button/badge (decision #1), calling `PATCH
  /chat/conversations/:id/resolve` via `apiRequest`.
- Add the `chat:inbox:conversation-status` socket listener (decision
  #4) to the existing socket setup in this file.

## Subtask B — Mobile

- `mobile/src/api/chat.ts`: add `isResolved`/`resolvedAt`/
  `resolvedById` to `Conversation`, add
  `resolveConversation(id: string): Promise<Conversation>` calling the
  same `PATCH` endpoint, and thread `?resolved=` through
  `getTenantConversations` (add an optional param).
- [StaffChatInboxScreen.tsx](../mobile/src/screens/staff/StaffChatInboxScreen.tsx):
  filter chips (decision #2), per-row badge (decision #3), the
  `chat:inbox:conversation-status` listener (decision #4).
- [StaffChatThreadScreen.tsx](../mobile/src/screens/staff/StaffChatThreadScreen.tsx):
  the resolve button/badge in the header (decision #1).
- Full kk/ru/en i18n parity per decision #5.

---

## Acceptance criteria

- Staff (`DISPATCHER`/`HOA_ADMIN`/`SUPERADMIN`) can mark a
  conversation resolved from both web and mobile, see it reflected as
  a badge on the list, and filter the inbox by resolved status, on
  both surfaces.
- No "reopen" button exists anywhere — resolving is one-directional
  from the UI, matching the backend's own design (Task 0068 decision
  #4).
- A resident writing a new message on a resolved conversation (already
  auto-reopening server-side per Task 0068) is reflected in the UI
  without a manual refresh, on whichever surface has that
  conversation's inbox open — proven by a manual real-time check, not
  just reading the socket-handler code.
- `npx tsc --noEmit` clean in `frontend-web/` and `mobile/`; full
  kk/ru/en i18n parity maintained in both.

## Explicitly out of scope

- Any backend or realtime-event change — Task 0068 already built and
  tested the entire mechanism; this task is pure frontend wiring.
- A manual "reopen" action — matches Task 0068 decision #4, still not
  built here either.
- Sorting resolved/unresolved conversations differently from today's
  existing order — Task 0068 decision #5 deliberately left sort order
  untouched; this task's filter doesn't change that either.

## Deliverable

- Web and mobile can ship as separate commits.
- PR description confirms a manual real-time check: with the inbox
  open on one session, resolve a conversation from another, and (a)
  the badge/filter update live, and (b) sending a new resident message
  on that now-resolved thread flips it back to unresolved live in the
  UI — this is the property that most distinguishes this task from a
  static badge that only ever reflects the page's initial load.
