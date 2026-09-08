# Task 0010: SOS button (экстренный вызов охраны/диспетчера)

**Status:** Completed (Ready for Review)
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

[PRODUCT_SPEC.md](PRODUCT_SPEC.md) §3.8 requires: *"SOS-кнопка (вызов охраны
ЖК/экстренных служб с автоматической передачей квартиры/локации)."* See
[PROGRESS.md](PROGRESS.md) — not started.

**Scope framing — read this first, it determines what NOT to build:**
this task builds an **in-app alert to on-site security/dispatch staff**,
not an automated call to government emergency services (101/102/112).
Actually dialing emergency services requires a telephony integration this
app has none of, plus serious legal/liability questions about a private
platform auto-contacting government dispatch on someone's behalf — that is
not something to wire up as a side effect of an app feature ticket. The
ТЗ's "экстренных служб" framing is satisfied by getting a human (the ЖК's
own security/dispatcher) alerted immediately with the resident's identity,
unit, and location, so *they* can decide whether to call real emergency
services. Don't build anything that claims to contact 101/102 — that would
be actively dangerous if it silently didn't work as claimed.

### Architecture decisions already made — do not re-litigate

1. **No PIN 2FA, no approval gate, no verification requirement.** Every
   other physical/financial action in this app (barrier, PIN, ownership
   verification) intentionally adds friction or requires staff sign-off.
   SOS is the opposite: **any authenticated resident** (`RESIDENT_OWNER` or
   `RESIDENT_TENANT`), verified ownership or not, can trigger it. An
   emergency must never wait on paperwork. The only friction allowed is a
   deliberate hold-to-confirm gesture (see Subtask D) to prevent accidental
   pocket-presses — nothing else.
2. **Idempotent per user, not per unit.** If a resident already has an
   `ACTIVE` alert, pressing again does **not** create a duplicate — it
   re-sends the push notification (in case the first one was missed/delayed)
   and returns the existing alert. Dedup is keyed on the triggering user,
   not the unit, so two different residents of the same household can each
   raise their own alert independently.
3. **Delivery: push notification + a polling-refreshed staff dashboard,
   not a new WebSocket subsystem.** This codebase has no real-time
   transport today (confirmed — no `@WebSocketGateway` anywhere). Building
   one is out of scope for this ticket. Use the existing
   [NotificationsService](../backend/src/modules/notifications/notifications.service.ts)
   for the immediate push, and a short-interval polling refetch (e.g. 15s)
   on the web dashboard's SOS board for the persistent/visual view — a
   push notification alone is not reliable enough for a life-safety
   feature (phone on silent, notification dismissed, app killed), so the
   dashboard must show active alerts even if the push never landed.
4. **Location is best-effort, never blocking.** Capture device GPS
   coordinates at the moment of triggering (new `expo-location` dependency,
   not currently in `mobile/package.json`), but with a short timeout
   (~3s) and full tolerance for denied permission or no fix — the alert
   fires immediately either way, with or without coordinates. Never show a
   permission dialog that could stall or block sending the alert itself.
5. **Recipients: `SECURITY`, `DISPATCHER`, `HOA_ADMIN` of that tenant get
   the push.** `HOA_CHAIRMAN` gets read-only visibility on the web board
   (same transparency pattern as finance/meters) but not a push — they're
   not a first responder and don't need to be paged for every alert.
   `SUPERADMIN` is not paged either (would mean push spam across every
   tenant on the platform) but retains cross-tenant read access on the web
   board like everywhere else in this codebase.
6. **Resolution, not deletion.** An alert gets marked `RESOLVED` or
   `FALSE_ALARM` by `SECURITY`, `DISPATCHER`, `HOA_ADMIN`, or `SUPERADMIN`,
   with an optional note — never deleted. This is a safety audit trail.

---

## Subtask A — Prisma schema

```prisma
enum SosAlertStatus {
  ACTIVE
  RESOLVED
  FALSE_ALARM
}

model SosAlert {
  id             String         @id @default(uuid())
  tenantId       String
  unitId         String?        // best-effort: the triggering resident's unit if they have one on file, null otherwise — never block on this
  triggeredById  String
  latitude       Float?
  longitude      Float?
  status         SosAlertStatus @default(ACTIVE)
  resolvedById   String?
  resolvedAt     DateTime?
  resolutionNote String?
  createdAt      DateTime       @default(now())

  tenant      Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  unit        Unit?  @relation(fields: [unitId], references: [id], onDelete: SetNull)
  triggeredBy User   @relation("SosTriggered", fields: [triggeredById], references: [id], onDelete: Cascade)
  resolvedBy  User?  @relation("SosResolved", fields: [resolvedById], references: [id], onDelete: SetNull)

  @@map("sos_alerts")
}
```

Add back-relations on `Tenant` (`sosAlerts`), `Unit` (`sosAlerts`), `User`
(`sosAlertsTriggered`, `sosAlertsResolved`). `prisma db push`, same
convention as every prior task.

---

## Subtask B — Backend

New module `backend/src/modules/sos/`.

**Extend [NotificationsService](../backend/src/modules/notifications/notifications.service.ts)**
with a `sendToTenantRoles(tenantId: string, roles: UserRole[], payload: PushPayload)`
method — same shape as the existing `sendToTenant()`, but filters device
tokens by `user: { tenantId, role: { in: roles } }` instead of just
`tenantId`. This is a small, generically useful addition (not SOS-specific)
that `SosService` will use to page `SECURITY`/`DISPATCHER`/`HOA_ADMIN` only.

**`SosService`:**
- `trigger(user, dto: { latitude?: number; longitude?: number })`:
  1. Resolve the user's unit best-effort: look up any ownership (verified
     or not, owner or tenant — don't gate on verification, see decision #1)
     for this user; use the first match's `unitId` if any, else `null`.
     Resolve `tenantId` from `user.tenantId`; if that's somehow null too
     (shouldn't happen for an authenticated resident, but don't crash if it
     does) reject with a clear error rather than creating a tenant-less
     alert.
  2. If an `ACTIVE` alert already exists for this `triggeredById`, skip
     creation, re-send the push (see step 4) for the existing alert, and
     return it.
  3. Otherwise create the `SosAlert` with whatever `unitId`/coordinates were
     resolved.
  4. Call `sendToTenantRoles(tenantId, [SECURITY, DISPATCHER, HOA_ADMIN], {...})`
     with a clear title/body including the resident's name, unit number (if
     known), and phone — staff need to call back immediately. Include the
     alert id and coordinates (if present) in `data` for the app to deep-link
     into the alert.
  5. Return the alert.
- `getTenantAlerts(tenantId, user, status?)` — `SECURITY`, `DISPATCHER`,
  `HOA_ADMIN`, `HOA_CHAIRMAN` (read-only), `SUPERADMIN`. Tenant-scoped via
  `assertUserBelongsToTenant`, full detail (resident identity, unit, phone,
  coordinates).
- `resolve(alertId, user, dto: { status: 'RESOLVED' | 'FALSE_ALARM'; note?: string })`
  — `SECURITY`, `DISPATCHER`, `HOA_ADMIN`, `SUPERADMIN` only (not chairman —
  read-only per decision #5). Tenant-scoped via the alert's own `tenantId`.
  Reject if already resolved (same "can't resolve twice" shape as
  `MetersService.reviewReading()`).
- `getMyAlerts(user)` — the calling resident's own alert history (past +
  active), no tenant restriction needed since it's already scoped to their
  own `triggeredById`.

**Tests:** new `sos.service.spec.ts` covering: unverified resident can
still trigger (no ownership-verification gate), a resident with zero
ownerships at all can still trigger (unit ends up `null`, doesn't throw),
duplicate trigger while `ACTIVE` doesn't create a second row and re-sends
the push, resolving requires the right roles and tenant match, chairman can
read but not resolve, `sendToTenantRoles` only pages the three specified
roles (verify a `HOA_CHAIRMAN`'s device token is excluded from the push
call's token lookup).

## Subtask C — Web: SOS board

New page `frontend-web/src/app/dashboard/sos/page.tsx`, visible to
`SECURITY`, `DISPATCHER`, `HOA_ADMIN`, `HOA_CHAIRMAN` (read-only for the
last one — hide/disable the resolve action for chairman), `SUPERADMIN`.
Same conventions as every prior page (`apiRequest`/`getStoredSession`,
i18n `t()` from the start, new `sos` namespace in all three locale files).

- Prominent list of `ACTIVE` alerts at the top (resident name, phone, unit,
  time elapsed since trigger, map link if coordinates present — a plain
  `https://maps.google.com/?q={lat},{lng}` link is enough, no embedded map
  widget needed), with Resolve/False-alarm actions.
- History section for `RESOLVED`/`FALSE_ALARM` alerts.
- Poll for updates every ~15s while the page is open (per architecture
  decision #3) — a simple `setInterval` + refetch is enough, no new
  dependency needed.
- Add a "SOS" nav entry in
  [dashboard/layout.tsx](../frontend-web/src/app/dashboard/layout.tsx),
  visible only to the roles above.

## Subtask D — Mobile: SOS button

Add a prominent, always-visible SOS button to
[DashboardScreen.tsx](../mobile/src/screens/dashboard/DashboardScreen.tsx)
(the app's home tab — reachable in one tap without further navigation,
per decision's spirit; making it reachable from *every* tab is a
reasonable future enhancement but not this task's floor).

- Reuse the hold-to-confirm interaction already built in
  [HoldToOpenButton.tsx](../mobile/src/components/access/HoldToOpenButton.tsx)
  (visually adapt it — this is an emergency action, not a barrier, so it
  should look distinctly urgent: red, larger, clearly labeled — but the
  underlying hold-gesture mechanic is the same, don't reimplement it from
  scratch).
- On confirm: attempt a best-effort location fix via `expo-location`
  (add the dependency) with a short timeout, then call the trigger
  endpoint regardless of whether a fix was obtained. Show a clear
  confirmation ("Охрана уведомлена") immediately after the request
  succeeds.
- A small "Мои обращения" history view (reuse the list-screen pattern
  already established for meters/bookings) — not the main focus of this
  task, but cheap to add given the pattern already exists, and gives the
  resident visibility into whether their alert was resolved.
- New `sos` i18n namespace, full kk/ru/en from the start.

---

## Acceptance criteria

- Any authenticated resident can trigger SOS regardless of verification
  status; `SECURITY`/`DISPATCHER`/`HOA_ADMIN` of their tenant receive a
  push immediately.
- Triggering again while an alert is still `ACTIVE` does not create a
  second alert row.
- The web SOS board shows active alerts (auto-refreshing) with resident
  identity, unit, phone, and location link when available; `HOA_CHAIRMAN`
  can view but not resolve.
- Resolving/marking false-alarm works only for the roles listed, is
  tenant-scoped, and can't be done twice on the same alert.
- Denying location permission (or a slow/failed GPS fix) never prevents
  the alert from being sent.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in all three
  apps; full kk/ru/en key parity.

## Explicitly out of scope

- Any real integration with government emergency dispatch (101/102/112) —
  see the scope-framing note above.
- Live map view / embedded mapping widget — a plain external maps link is
  enough for v1.
- WebSocket/real-time push-to-dashboard beyond polling — see decision #3.
- SOS accessible from every screen (persistent global overlay) — Dashboard
  entry point is the floor for this task.

## Deliverable

- Subtask A+B (backend) can ship separately from C/D (frontend), same as
  prior multi-platform tasks.
- PR description must confirm: no telephony/emergency-services integration
  was added, and the hold-to-confirm gesture is the only friction on
  triggering (no PIN, no approval step).

---

## Review addendum (2026-09-08) — a real bug, plus the usual i18n sweep

**Verified good:** the backend is thorough and well-tested — idempotent
trigger, unit resolution works correctly even for a resident with zero
ownerships (and the codebase's own navigation gating means the "can't
resolve tenantId at all" path is actually unreachable in practice, since
`hasOwnership` in
[AuthContext.tsx](../mobile/src/context/AuthContext.tsx) — which gates
whether a resident ever reaches the Dashboard/SOS button at all — becomes
true the moment *any* ownership row exists, verified or not, and
`claimOwnership()` already sets `user.tenantId` at claim time regardless of
verification; good that a test still exists for the reject path anyway).
`sendToTenantRoles()` correctly excludes `HOA_CHAIRMAN`. Role splits
(trigger: everyone, resolve: not chairman, read: chairman included) all
match. 175/175 backend tests pass, `tsc --noEmit` clean, mobile SOS files
are fully i18n-clean. Location capture is best-effort per the architecture
decision, no PIN/approval gate anywhere.

**Found — a real bug, not a style nit:**
[frontend-web/src/app/dashboard/sos/page.tsx:97](../frontend-web/src/app/dashboard/sos/page.tsx#L97)
— `` const effectiveTenantId = session.user.tenantId || 'tenant-1'; ``.
This hardcodes a fallback to a specific tenant (matching the demo seed
data) whenever the logged-in staff member's `tenantId` is falsy. No other
page in this codebase does this — every other staff page just uses
`session.user.tenantId` directly. For a page showing **live emergency
alerts**, silently falling back to a different, hardcoded tenant's data
if `tenantId` is ever missing (e.g. a misconfigured account, or any future
role that legitimately has no single tenant) is actively dangerous: staff
would see and act on what looks like their own ЖК's active SOS queue when
it might not be. This looks like leftover local-testing scaffolding that
shouldn't ship.

**Required fix:** remove the `'tenant-1'` fallback. If `session.user.tenantId`
is missing, show an error/empty state (same as this codebase's other pages
do when they can't resolve a required value) instead of silently
substituting a hardcoded tenant.

**Also found — the same class of leftover hardcoded strings caught in
earlier tasks' addenda, all in the same file:**
- `page.tsx:86` — `err.message || 'Ошибка загрузки вызовов SOS'`
- `page.tsx:138` — `alert(err.message || 'Ошибка обработки сигнала')`
- `page.tsx:147-153` (`formatElapsed`) — `'сек'`/`'мин'`/`'ч'` time-unit
  labels hardcoded; these are UI chrome (elapsed-time display), not data —
  English needs different abbreviations, same reasoning as the
  `common.iin`/`common.block` fixes from Task 0005.
- `page.tsx:220` — `'Все тревоги обработаны дежурной службой'` empty-state
  subtext.
- `page.tsx:227` — `'Житель'` fallback name label.
- `page.tsx:347`, `:349` — table headers `'Статус'`, `'Заметка'`.

**Required fix:** migrate the strings above to `t()` calls (extend the
`sos` namespace, keep full kk/ru/en parity), in addition to removing the
`'tenant-1'` fallback. No other files need touching — mobile and the
backend are confirmed clean.
