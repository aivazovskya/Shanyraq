# Task 0026: Mobile dispatcher chat inbox (staff)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Second staff feature built on [Task 0024](0024-mobile-staff-mode-foundation.md)'s
navigation shell — **do not start until 0024 and
[0025](0025-mobile-sos-dashboard.md) are both merged**, this reuses
`StaffMainTabs`, `isStaffRole`, and `mobile/src/lib/socket.ts`. Today,
mobile chat ([ChatScreen.tsx](../mobile/src/screens/chat/ChatScreen.tsx))
is only the resident's single thread with the dispatcher — a dispatcher
has no way to see or reply to any resident's message from their phone,
only from the web dashboard
([frontend-web/src/app/dashboard/chat/page.tsx](../frontend-web/src/app/dashboard/chat/page.tsx)).
This task brings that inbox to mobile.

### Architecture decisions already made — do not re-litigate

1. **Chat inbox is narrower than "staff" — exactly `DISPATCHER`,
   `HOA_ADMIN`, `SUPERADMIN`, not all four staff roles.** Unlike SOS
   (which includes `HOA_CHAIRMAN` read-only and excludes nobody among
   staff), the chat endpoints
   ([chat.controller.ts](../backend/src/modules/chat/chat.controller.ts))
   gate `getTenantConversations`/`getConversationMessages`/
   `sendStaffMessage` to exactly `DISPATCHER | HOA_ADMIN | SUPERADMIN` —
   `HOA_CHAIRMAN` and `SECURITY` have no chat access at all, not even
   read-only. Since `SUPERADMIN` doesn't use mobile staff mode
   ([Task 0024](0024-mobile-staff-mode-foundation.md) decision #1), this
   means in practice: **show the chat inbox tab/entry point only for
   `DISPATCHER` and `HOA_ADMIN`** on mobile. Don't reuse the blanket
   `isStaffRole` check for this — check the role explicitly, matching the
   backend's own narrower list.
2. **Two screens, not one.** A list screen (`StaffChatInboxScreen`) and a
   thread screen (`StaffChatThreadScreen`) — this mirrors how the web
   dispatcher page has both a conversation list and a message pane, and
   is a fundamentally different shape from the resident's single-thread
   `ChatScreen.tsx` (which stays completely untouched by this task).
3. **Reuse the exact WebSocket rooms Task 0020 already built — this is
   the third consumer, not a new mechanism.** `chat:tenant:<tenantId>:inbox`
   (join on the inbox list screen, for new-message-anywhere / unread-count
   updates) and `chat:conversation:<id>` (join when a specific thread is
   open, leave when leaving it) — `RealtimeGateway`'s authorization for
   these rooms already covers any authenticated staff client identically,
   no gateway changes needed. Use `mobile/src/lib/socket.ts` from
   Task 0024, same as the SOS screen and the resident `ChatScreen.tsx`
   already do.
4. **No polling.** Same rule as every task since Task 0020 — initial
   `GET` on mount/focus, socket for live updates, one reconciliation
   fetch on `reconnect`.
5. **Reuse the exact backend endpoints — zero backend changes.**
   `GET /chat/tenants/:tenantId/conversations`,
   `GET /chat/conversations/:id/messages` (also marks
   `lastReadByStaffAt` server-side — no separate "mark read" call needed
   from the client), `POST /chat/conversations/:id/messages`.
6. **Unread badge, matching what the backend already computes.**
   `getTenantConversations` already returns `unreadCount` per
   conversation — surface it on the inbox list (and optionally as a
   badge on the tab icon, your call on whether React Navigation's
   tab-badge API is worth wiring up for this or a simple in-list badge is
   enough).

---

## Subtask A — `mobile/src/api/chat.ts` additions

Add staff-facing methods alongside the existing resident ones (don't
touch `getMyConversation`/`sendMessage`): `getTenantConversations(tenantId)`,
`getConversationMessages(id)`, `sendStaffMessage(id, text?, photoUrl?)`,
typed against the same `Conversation`/`ChatMessage` interfaces already
defined there, extended with whatever additional fields the staff
endpoints return that the resident ones don't (`resident` on the
conversation, `unreadCount`, `lastMessage`) — check the actual response
shape from `chat.service.ts`'s `getTenantConversations`/
`getConversationMessages` rather than guessing field names.

## Subtask B — `StaffChatInboxScreen`

- List conversations for `user.tenantId`, each row showing resident
  name/unit, last message preview, timestamp, unread badge.
- On mount/focus: fetch the list, connect the shared socket, join
  `chat:tenant:<tenantId>:inbox`, listen for the inbox-update event
  Task 0020's web client already listens for
  (`chat:inbox:message` — verify the exact event name against
  `RealtimeGateway`'s `handleChatMessageCreated` rather than assuming)
  and refresh the affected conversation's preview/unread count in place.
- Tapping a conversation navigates to `StaffChatThreadScreen`.

## Subtask C — `StaffChatThreadScreen`

- Given a conversation id: fetch messages, connect the socket, join
  `chat:conversation:<id>`, listen for new messages (dedup by id, same
  pattern as `ChatScreen.tsx`/`StaffSosScreen.tsx`), leave the room and
  disconnect on blur/unmount.
- A text input + send button calling `sendStaffMessage` — reuse
  whatever message-bubble/input UI components `ChatScreen.tsx` already
  has if they're generic enough to share; don't duplicate a whole chat
  UI kit if one already exists in a reusable form, but don't force a
  shared component if the resident and staff message bubbles need
  meaningfully different information (e.g. showing which staff member
  sent a reply, if multiple dispatchers can respond) — your judgment
  call once you're looking at the existing component.

## Subtask D — Navigation wiring

- Add `ChatInboxTab` (or similar name) to `StaffTabsParamList`, rendered
  in `StaffMainTabs` **only when `user.role` is `DISPATCHER` or
  `HOA_ADMIN`** (decision #1) — conditionally render the `<Tab.Screen>`
  itself, don't just hide a button while leaving the route reachable.
  `StaffChatThreadScreen` is a stack screen pushed from the inbox tab,
  not a tab itself (matching how `RequestDetail`/`VotingDetails` are
  stack screens over the resident `MainTabs` today).
- Add a quick-access card on `StaffHomeScreen` mirroring the existing SOS
  card, same role condition.

---

## Acceptance criteria

- A `DISPATCHER`/`HOA_ADMIN` can see all of their ЖК's conversations,
  open one, and reply, from the mobile app, with live updates via the
  shared WebSocket rooms.
- `HOA_CHAIRMAN`/`SECURITY` see no chat inbox entry point anywhere in the
  staff UI.
- The resident-facing `ChatScreen.tsx` is completely unchanged.
- No backend changes — confirm explicitly in the PR.
- `npx tsc --noEmit` clean in `mobile/`.
- Full kk/ru/en i18n parity for any new strings.

## Explicitly out of scope

- Any other staff feature (service-request management, access-control
  management) — next tasks in this sequence.
- Typing indicators, read receipts beyond the existing unread-count
  mechanism, or file/photo attachment UI beyond whatever the resident
  screen already supports for `photoUrl`.
- Any backend or `RealtimeGateway` change.

## Deliverable

- One commit or PR.
- PR description confirms live-update behavior was verified manually
  (a message sent from the web dispatcher inbox or the resident mobile
  app appears in this new mobile inbox without a refresh, and vice
  versa), same verification style as Tasks 0020/0025.

---

## Review addendum (2026-09-10) — accepted, no issues found

**Verified good:** `ChatInboxTab` is genuinely conditionally rendered
(`{canAccessChat && <Tab.Screen .../>}`, not just visually hidden) for
exactly `DISPATCHER`/`HOA_ADMIN` in both `StaffMainTabs.tsx` and the
quick-access card on `StaffHomeScreen.tsx` — `HOA_CHAIRMAN`/`SECURITY`
get no chat entry point anywhere, matching decision #1 exactly.
`StaffChatThreadScreen` is correctly registered as a `RootStackParamList`
stack screen (not a tab), with typed params matching exactly what
`StaffChatInboxScreen` passes on navigation. Both socket event names
(`chat:inbox:message`, `chat:message`) verified against
`RealtimeGateway`'s actual emits from Task 0020 rather than assumed —
correct on both. `mobile/src/api/chat.ts`'s new methods hit exactly the
three existing staff endpoints, and the `Conversation`/`ChatMessage`
interface extensions (`resident`, `lastMessage`, `unreadCount`) match the
real backend response shape. The staff thread screen sensibly built its
own message-bubble UI (sender attribution — which dispatcher replied —
that the resident `ChatScreen.tsx` doesn't need) rather than forcing a
shared component; `ChatScreen.tsx` itself is confirmed untouched. Zero
backend changes (confirmed via diff — only pre-existing, unrelated
Task 0023 backend files are modified in the working tree). `tsc --noEmit`
clean in `mobile/`, full kk/ru/en parity (702/702/702 mobile keys, +19
new `staff.chat.*` keys). Task accepted, no fixes required.
