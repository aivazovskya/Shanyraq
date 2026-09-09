# Task 0020: Real-time updates via WebSocket (chat + SOS dashboard)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

This is the **first real-time transport ever built in this codebase** —
every prior feature (chat, SOS) deliberately used polling because building
a full WebSocket layer was out of scope for those tasks. Now that the ТЗ
is fully implemented and the security audit ([Task 0019](0019-security-hardening.md))
is closed, this task adds it properly, replacing polling in exactly the
three places that currently use it:
- [frontend-web/src/app/dashboard/chat/page.tsx](../frontend-web/src/app/dashboard/chat/page.tsx) —
  20s poll for the conversation list, 10s poll for the open conversation's
  messages.
- [frontend-web/src/app/dashboard/sos/page.tsx](../frontend-web/src/app/dashboard/sos/page.tsx) —
  15s poll for the alert list. **Do not touch** the unrelated `setInterval`
  on line 71 that just re-renders elapsed-time labels every 10s — that's
  cosmetic ticking, not data fetching.
- [mobile/src/screens/chat/ChatScreen.tsx](../mobile/src/screens/chat/ChatScreen.tsx) —
  7s poll for the resident's own conversation.

This does **not** replace or touch the existing Expo push-notification
system ([notifications.service.ts](../backend/src/modules/notifications/notifications.service.ts)) —
that's for alerting a user whose app is closed/backgrounded and stays
exactly as-is. This task is only about live-updating a screen that's
already open and visible.

### Architecture decisions already made — do not re-litigate

1. **Socket.io, not raw `ws`.** Use `@nestjs/websockets` +
   `@nestjs/platform-socket.io` on the backend, `socket.io-client` on both
   web and mobile. Socket.io's built-in reconnection and transport
   fallback matters more here than raw `ws`'s smaller footprint,
   especially for the mobile app on flaky cellular connections.
2. **Decouple business logic from transport via `@nestjs/event-emitter`.**
   `ChatService`/`SosService` must NOT be injected with the WebSocket
   gateway directly. Instead, after persisting a message/alert, they emit
   an internal domain event (`this.eventEmitter.emit('chat.message.created',
   payload)`, `'sos.alert.triggered'`, `'sos.alert.updated'`) via
   `EventEmitter2`. A single `RealtimeGateway` subscribes to those events
   with `@OnEvent(...)` and pushes them over the socket. This keeps
   `ChatService`/`SosService` unit-testable exactly as they are today
   (no socket/gateway mocking needed in their existing spec files) and
   keeps the transport layer swappable later if needed.
3. **One gateway, not one per feature.** A single `RealtimeGateway`
   (in a new `RealtimeModule`) handles both chat and SOS rooms — there's
   no need for two separate WebSocket namespaces for a feature this size.
4. **Room naming and authorization — reuse existing service logic, don't
   reinvent it:**
   - `chat:conversation:<conversationId>` — joined by the resident who
     owns that conversation and any staff member currently viewing it.
     Before allowing a `join`, call into the same authorization check
     `chat.service.ts` already does for reading a conversation (tenant
     membership for staff, ownership for the resident) — do not write new
     authorization logic in the gateway.
   - `chat:tenant:<tenantId>:inbox` — joined by staff
     (`DISPATCHER`/`HOA_ADMIN`/`SUPERADMIN`, matching `assertStaffRole` in
     `chat.service.ts`) so the inbox list / unread badges update without
     joining every individual conversation.
   - `sos:tenant:<tenantId>` — joined by staff/chairman roles matching
     `assertStaffOrChairmanRole` in `sos.service.ts`.
   - Reject any `join` request for a room the authenticated socket isn't
     authorized for (disconnect or emit an error event — your call, but
     never silently allow it).
5. **Socket-level auth, not a new mechanism.** In `handleConnection`,
   extract the JWT the same way `jwt.strategy.ts` does (Bearer token, this
   time from `client.handshake.auth.token` since there's no HTTP header on
   a socket handshake), verify it with the same secret/`JwtService`, and
   run the same `isActive`/`tokenVersion` checks `jwt.strategy.ts` already
   does. Disconnect immediately on failure. Don't accept an unauthenticated
   socket and only check auth on room-join — reject at connection time.
6. **Push full payloads, not just "something changed" pings.** Emit the
   actual created message / alert object over the socket — both are small
   — so the client can render immediately without an extra REST round
   trip. The REST GET endpoints remain the source of truth for initial
   load and reconnect-reconciliation (decision #7).
7. **Replace polling, don't stack it.** Once a screen's socket connection
   is established, remove its `setInterval` polling entirely — don't run
   both. Add one reconciliation fetch (call the existing REST GET again)
   on the socket's `reconnect` event, to catch anything missed while
   disconnected. If the socket is down for an extended period, it's
   acceptable for the screen to just show slightly stale data until
   reconnect fires the reconciliation fetch — don't build a secondary
   polling fallback on top of this.
8. **Mobile SOS trigger screen is explicitly out of scope** — it's a
   button that performs an action, not a live feed; nothing to make
   real-time there.

---

## Subtask A — Backend: `RealtimeModule` + `RealtimeGateway` foundation

- Add `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`,
  `@nestjs/event-emitter` to `backend/package.json`; register
  `EventEmitterModule.forRoot()` in `app.module.ts`.
- Create `backend/src/modules/realtime/realtime.gateway.ts`: a
  `@WebSocketGateway()` class implementing `OnGatewayConnection`,
  `OnGatewayDisconnect`. `handleConnection` does the JWT verification from
  decision #5 and disconnects unauthenticated sockets. Track connected
  sockets by user id (a simple in-memory map is fine — this app runs as a
  single backend instance today, no need to build Redis-adapter
  multi-instance socket scaling for this task).
- Add `@SubscribeMessage('chat:join')` / `@SubscribeMessage('sos:join')`
  handlers implementing the authorization-then-join logic from decision
  #4, reusing `ChatService`/`SosService` methods (inject them into the
  gateway — this direction, gateway-depends-on-service, is fine; it's the
  other direction, service-depends-on-gateway, that decision #2 forbids).
- CORS for the socket server needs the same allowlist as the REST CORS
  config from [Task 0019](0019-security-hardening.md) (`CORS_ALLOWED_ORIGINS`)
  — don't reintroduce an open `origin: true` here.

**Test:** connection with no/invalid token is rejected; connection with a
valid token succeeds; a staff member of Tenant B attempting to join
Tenant A's `sos:tenant:<A>` or `chat:tenant:<A>:inbox` room is rejected; a
resident attempting to join a conversation they don't own is rejected.

## Subtask B — Backend: chat events

In `chat.service.ts`'s `sendResidentMessage` and the staff-reply method,
after `prisma.chatMessage.create(...)` succeeds, emit
`'chat.message.created'` with the created message + conversation id.
`RealtimeGateway` relays it to both `chat:conversation:<id>` and
`chat:tenant:<tenantId>:inbox`.

## Subtask C — Backend: SOS events

In `sos.service.ts`'s `trigger` and `resolve`, after the alert is
created/updated, emit `'sos.alert.triggered'` / `'sos.alert.updated'`.
`RealtimeGateway` relays to `sos:tenant:<tenantId>`.

## Subtask D — Web client: chat + SOS dashboard

- Add `socket.io-client` to `frontend-web/package.json`.
- In `dashboard/chat/page.tsx`: connect once (pass the stored session
  token as `auth.token`), join the tenant inbox room and, when a
  conversation is selected, that conversation's room (leaving the
  previous one). Remove the 20s/10s `setInterval`s. On the socket's
  `connect`/`reconnect` event, do one reconciliation fetch via the
  existing REST calls.
- In `dashboard/sos/page.tsx`: connect, join `sos:tenant:<id>`, remove the
  15s alert-polling interval (leave the cosmetic 10s elapsed-time ticker
  alone). Reconciliation fetch on reconnect, same as above.
- If you add any new user-facing text (e.g. a "reconnecting..."
  connection-status indicator), add it through `t()` with full kk/ru/en
  parity — don't introduce a new hardcoded string.

## Subtask E — Mobile client: chat

- Add `socket.io-client` to `mobile/package.json`.
- In `ChatScreen.tsx`: connect on focus (mirroring the existing
  `useFocusEffect`), join the conversation room, remove the 7s interval.
  Disconnect on blur/unmount to avoid leaking sockets when the user
  navigates away, then reconnect and do one reconciliation fetch when the
  screen regains focus.

---

## Acceptance criteria

- All three polling locations listed in Context have their `setInterval`
  removed and replaced by the socket + reconnect-reconciliation pattern.
- Unauthorized connection and unauthorized room-join are both rejected,
  each with a test proving it (see Subtask A's test list).
- A message sent by a resident appears in the dispatcher's open
  conversation view, and in their inbox list, without waiting for any
  poll interval — verify this manually in the dev server (two browser
  tabs or a tab + the mobile app) since this is a UI-feel feature that
  automated tests can't fully capture; describe what you did to verify it
  in the PR description.
- Existing REST endpoints for chat/SOS are completely unchanged — sockets
  are additive, not a replacement for the HTTP API.
- All existing backend tests for `chat` and `sos` still pass unmodified
  (decision #2 means their spec files shouldn't need any gateway-related
  changes at all — if you find yourself needing to mock a gateway inside
  `chat.service.spec.ts`/`sos.service.spec.ts`, something's wrong with the
  decoupling).
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in all three
  apps.
- Any new i18n keys have full kk/ru/en parity (see Subtask D's note —
  likely zero new keys unless a connection-status indicator is added).

## Explicitly out of scope

- Multi-instance/horizontal-scaling socket support (Redis adapter for
  Socket.io) — this app runs single-instance today; revisit if that
  changes.
- Any change to the Expo push-notification system — real-time sockets and
  push notifications solve different problems (open screen vs. closed
  app) and both stay.
- Real-time for any screen other than the three listed (e.g. service
  requests, community board, votings) — those don't currently poll and
  adding real-time to them is a separate, future task if ever wanted.
- The mobile SOS trigger screen — see decision #8.
- Redesigning the chat/SOS UI — this is a data-transport change, the
  screens should look and behave the same, just update live instead of on
  a timer.

## Deliverable

- Can ship as separate commits per subtask (A is the foundation everything
  else depends on) or one PR — your call.
- PR description should include how you manually verified the two-client
  live-update behavior for both chat and SOS (Acceptance criteria above),
  since that's the actual point of this task and can't be fully proven by
  the automated test suite alone.
