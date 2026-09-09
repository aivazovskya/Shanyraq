# Task 0012: Chat with dispatcher (чат с диспетчером УК)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

[PRODUCT_SPEC.md](PRODUCT_SPEC.md) §3.6 requires: *"Чат с диспетчером УК"*
as a mobile resident-facing feature. See [PROGRESS.md](PROGRESS.md) — not
started. This is a general-purpose support channel, **distinct from**
`RequestComment` (the existing per-service-request comment thread in
[service-requests.service.ts](../backend/src/modules/service-requests/service-requests.service.ts))
— a resident should be able to message the dispatch team without it being
tied to any specific request.

### Architecture decisions already made — do not re-litigate

1. **Polling, not WebSocket.** Same reasoning as [Task 0010](0010-sos-button.md)
   (SOS): this codebase has no real-time transport (`@WebSocketGateway`)
   anywhere, and building one is a real, separate infrastructure
   investment that shouldn't be a side effect of one chat feature. Use a
   short-interval polling refetch instead — mobile refetches the open
   conversation every ~5-10s, the web dispatcher inbox refetches the
   conversation list every ~20-30s and an open thread every ~10s. This
   won't feel as instant as a real chat app; that's an accepted,
   proportionate tradeoff for a first cut, not an oversight. If a second
   feature later also wants real-time delivery, that's when building actual
   WebSocket infrastructure becomes justified — not before.
2. **One conversation per resident per tenant, shared staff inbox.** Not a
   1:1 resident-to-specific-dispatcher assignment — any `DISPATCHER`/
   `HOA_ADMIN` of that tenant can see and reply to any resident's
   conversation, the way a small support team shares one inbox. This is
   simpler than per-agent assignment/routing and matches how service
   requests are already handled (any dispatcher can pick up any request).
   `@@unique([tenantId, residentId])` enforces exactly one thread per
   resident — get-or-create it, don't let multiple threads spawn.
3. **Access gate matches Tasks 0009/0011, not Task 0010 (SOS).** This is a
   support channel, not an emergency — require the same bar already used
   for bookings/community-board: verified ownership (owner or tenant, any
   type) for residents, tenant match for staff, unrestricted for
   `SUPERADMIN`. **Copy the exact `assertAccessToTenant()` shape already
   built in
   [bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts)
   /
   [community-board.service.ts](../backend/src/modules/community-board/community-board.service.ts)
   — this is now the third module using this pattern, so there is no excuse
   for it to diverge.**
4. **Read tracking at the conversation level, not per-message.**
   `lastReadByResidentAt`/`lastReadByStaffAt` timestamps on the
   `Conversation`, updated whenever that side fetches the thread. Unread
   count/indicator = messages created after the relevant timestamp. Simpler
   than per-message read receipts and sufficient for an unread badge.
5. **Text + optional single photo per message**, reusing the existing
   `/uploads` flow already used for service-request attachments and meter
   reading photos — don't build a new upload mechanism.
6. **No dispatcher role table has HOA_CHAIRMAN in this feature.** Chat
   isn't a financial-transparency matter (unlike finance/meters), so
   there's no reason to give the chairman read access here — staff who can
   see/reply are `DISPATCHER`, `HOA_ADMIN`, `SUPERADMIN` only.
7. **No new bottom tab.** Reached from a Dashboard quick-link card, same as
   every other feature added since Task 0006 — the 5-tab bar
   (`MainTabs.tsx`) stays as-is.

---

## Subtask A — Prisma schema

```prisma
model Conversation {
  id                   String    @id @default(uuid())
  tenantId             String
  residentId           String
  lastReadByResidentAt DateTime?
  lastReadByStaffAt    DateTime?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  tenant   Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  resident User          @relation("ConversationsAsResident", fields: [residentId], references: [id], onDelete: Cascade)
  messages ChatMessage[]

  @@unique([tenantId, residentId])
  @@map("conversations")
}

model ChatMessage {
  id             String   @id @default(uuid())
  conversationId String
  senderId       String
  text           String
  photoUrl       String?
  createdAt      DateTime @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       User         @relation("ChatMessagesSent", fields: [senderId], references: [id], onDelete: Cascade)

  @@map("chat_messages")
}
```

Add back-relations on `Tenant` (`conversations`), `User`
(`conversationsAsResident`, `chatMessagesSent`). `prisma db push`, same
convention as every prior task.

---

## Subtask B — Backend

New module `backend/src/modules/chat/`.

**Access helper:** copy `assertAccessToTenant()` verbatim from
[bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts)
— see decision #3.

**Resident-facing:**
- `GET /chat/my-conversation` — get-or-create the caller's conversation for
  their tenant (resolve tenant the same way
  [SosService.trigger()](../backend/src/modules/sos/sos.service.ts) does:
  `user.tenantId`, reject with a clear error only in the practically-
  unreachable case it's missing — see that file's handling for reference).
  Requires the resident branch of the access helper (verified ownership).
  Returns the conversation with its messages (paginate or just cap at,
  say, the most recent 100 — no need for real pagination machinery in v1)
  and updates `lastReadByResidentAt = now()`.
- `POST /chat/my-conversation/messages`, body
  `{ text: string; photoUrl?: string }` — appends a `ChatMessage` with
  `senderId = user.id`, then notifies staff via
  `NotificationsService.sendToTenantRoles(tenantId, [DISPATCHER, HOA_ADMIN], ...)`
  (already built in Task 0010 — reuse it, don't duplicate).

**Staff-facing** (`DISPATCHER`, `HOA_ADMIN`, `SUPERADMIN`):
- `GET /chat/tenants/:tenantId/conversations` — list conversations for the
  tenant (resident name/phone, last message preview, unread count = count
  of messages after `lastReadByStaffAt`), tenant-scoped via the access
  helper, sorted by most recent activity.
- `GET /chat/conversations/:id/messages` — full thread, tenant-scoped via
  the conversation's own `tenantId`, updates `lastReadByStaffAt = now()`.
- `POST /chat/conversations/:id/messages`, body
  `{ text: string; photoUrl?: string }` — appends a message with
  `senderId = user.id`, notifies the resident via
  `NotificationsService.sendToUser(conversation.residentId, ...)`.

**Tests:** new `chat.service.spec.ts` covering: verified resident can
get-or-create their conversation and send messages, unverified resident
cannot, a second call to get-or-create returns the same conversation (no
duplicate created, exercises the `@@unique` constraint path), a different
tenant's resident can't reach this tenant's conversation, staff can list/
reply within their own tenant, staff from another tenant cannot, unread
count reflects messages after the relevant `lastReadBy*At` timestamp and
resets after fetching.

## Subtask C — Web: dispatcher inbox

New page `frontend-web/src/app/dashboard/chat/page.tsx` (`DISPATCHER`,
`HOA_ADMIN`, `SUPERADMIN`), same conventions as every prior page
(`apiRequest`/`getStoredSession`, i18n `t()` from the start, new `chat`
namespace in all three locale files):

- Conversation list (resident name, last message preview, unread badge),
  polling refresh (~20-30s per decision #1).
- Selected-conversation thread view with a reply box, polling refresh
  (~10s) while open.
- Add a "Чат с жильцами" (or similar) nav entry in
  [dashboard/layout.tsx](../frontend-web/src/app/dashboard/layout.tsx),
  visible to the staff roles above.

## Subtask D — Mobile: chat screen

New screen `mobile/src/screens/chat/ChatScreen.tsx` (new `chat` i18n
namespace), reached from a Dashboard quick-link card (with an unread-count
badge if there's an easy way to surface one without an extra request —
otherwise skip the badge, not essential), **not** a new bottom tab.

- Standard chat UI: message bubbles (own messages right-aligned, staff
  messages left-aligned or similar convention — match whatever styling
  primitives already exist in this codebase's component library rather
  than inventing new ones), text input, photo attach button reusing the
  existing upload flow (see
  [CreateRequestScreen.tsx](../mobile/src/screens/requests/CreateRequestScreen.tsx)
  for the established pattern).
- Poll for new messages every ~5-10s while the screen is focused (stop
  polling when unfocused/backgrounded — no need to drain battery for a
  screen the user isn't looking at).

---

## Acceptance criteria

- A verified resident can open their conversation (auto-created on first
  access) and send messages with an optional photo; an unverified resident
  cannot.
- Sending a message as a resident pages `DISPATCHER`/`HOA_ADMIN` of that
  tenant; a staff reply notifies the specific resident.
- Staff can see and reply to any conversation in their own tenant; cannot
  see or reply to another tenant's conversations.
- Reopening `GET /chat/my-conversation` never creates a second conversation
  for the same resident.
- Unread counts reflect unread messages accurately from each side's
  perspective and clear after that side views the thread.
- Web and mobile both ship with full kk/ru/en keys from the start.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in all three
  apps; full kk/ru/en key parity.

## Explicitly out of scope

- WebSocket/real-time delivery — see decision #1.
- Per-agent conversation assignment/routing — see decision #2.
- Group chat / more than resident+staff in one thread.
- Message editing or deletion.
- `HOA_CHAIRMAN` visibility — see decision #6.

## Deliverable

- Subtask A+B (backend) can ship separately from C/D (frontend), same as
  prior multi-platform tasks.
- PR description should confirm: the access-control helper matches Tasks
  0009/0011's `assertAccessToTenant()` shape exactly, and no WebSocket
  dependency was introduced anywhere.

---

## Review addendum (2026-09-09) — a real data-modeling gap, traced back to this spec

**Verified good:** the access helper is a faithful copy, `getMyConversation`
correctly handles the get-or-create race with a catch-and-refetch on the
unique-constraint path, unread counts and `lastReadBy*At` tracking work,
`HOA_CHAIRMAN` is explicitly tested as excluded (decision #6), tenant
isolation holds on every path, notifications reuse `sendToTenantRoles`/
`sendToUser` without duplication. 214/214 backend tests, `tsc --noEmit`
clean, full kk/ru/en parity (482 mobile / 585 web).

**Found — this one traces back to a gap in this spec, not a mistake by the
implementation, but the fix as shipped needs to change:** this task
specified `ChatMessage.text String` (required, non-nullable) and "text +
optional single photo" without addressing what happens when a resident
wants to send **only** a photo, no caption. `CreateChatMessageDto.text` is
`@IsNotEmpty()`, so a photo-only send has no valid empty string to submit.
The workaround that shipped, in both clients:
- [ChatScreen.tsx:105](../mobile/src/screens/chat/ChatScreen.tsx#L105) —
  `` ChatApi.sendMessage(textToSend || 'Фотография', attachedPhoto || undefined) ``
- and the equivalent placeholder shown in the web inbox preview at
  [page.tsx:415](../frontend-web/src/app/dashboard/chat/page.tsx#L415)

...sends the literal Russian word **"Фотография" as the actual persisted
`ChatMessage.text`** for any photo-only message. This is not a display-only
i18n miss fixable by wrapping a render call in `t()` — the wrong string is
what gets **stored**, permanently, regardless of the sender's or reader's
language, for every photo-only message anyone ever sends. Wrapping the
*display* in `t()` doesn't fix already-wrong data or future sends from a
kk/en-language client.

**Required fix:**
- Schema: make `ChatMessage.text` nullable (`String?`).
- `CreateChatMessageDto`: make `text` optional, but validate that **at
  least one of `text` or `photoUrl` is present** (reject a request with
  neither) — a custom class-validator check or a manual check in the
  service, either is fine.
- `ChatService.sendResidentMessage`/`sendStaffMessage`: store `text` as
  given (including `null`/omitted for a photo-only message), don't
  synthesize placeholder content server-side either.
- Both mobile and web: when rendering a message (or a conversation-list
  preview) with no `text` but a `photoUrl`, show a **localized** placeholder
  (e.g. `t('chat.photoLabel')`) at render time — this is the correct place
  for "Photo"/"Фото"/"Сурет", not baked into the data.
- Remove the `|| 'Фотография'` fallback in `ChatScreen.tsx` entirely; it
  should send `text: undefined` (or omit it) when there's no caption.

**Test to add:** sending a photo with no text succeeds and stores `text`
as `null`/empty, not a placeholder string.

**Also found, optional/not blocking:** `sendResidentMessage` does its own
get-or-create for the conversation (lines ~244-262) but, unlike
`getMyConversation`, has no catch-and-refetch around the `create()` call —
two truly simultaneous first-messages from the same brand-new resident
(e.g. a double-tap on "send" before the UI disables the button) could hit
the `@@unique` constraint as an unhandled error. Narrow and low-stakes
(matches the kind of accepted race already noted for Task 0009's booking
overlap check), so not required, but worth mirroring the same
catch-and-refetch if you're already touching this file for the fix above.
