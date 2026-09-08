# Task 0008: Domofon integration — Hikvision DS-KV (ISAPI)

**Status:** Completed (Ready for Review)
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

[PRODUCT_SPEC.md](PRODUCT_SPEC.md) §3.3 requires door-intercom opening from
the app. [PROGRESS.md](PROGRESS.md) has tracked this as blocked: schema
already has `AccessPointType.DOOR_INTERCOM`, but
[access-control.service.ts](../backend/src/modules/access-control/access-control.service.ts)
`openBarrier()` only accepts `BARRIER`/`GATE`. The pilot site's intercom
looks like a **Hikvision DS-KV** series unit from a site photo — not
confirmed via documentation or vendor contact, and there is **no physical
device or network access to test against**. Treat this the same way the
codebase already treats `MockBarrierAdapter`: implement the real protocol
correctly, but don't claim it's verified against hardware until someone
actually smoke-tests it against a real DS-KV.

**Researched, not guessed:** the ISAPI door-unlock call below comes from
Hikvision's own developer documentation and multiple independent
integration write-ups (Home Assistant / Homebridge / Hubitat community
integrations against DS-KV/DS-KD models specifically), not from memory.
Verify against the authoritative source before shipping:
[Hikvision ISAPI & OTAP Developer Guide (TPP)](https://tpp.hikvision.com/download/ISAPI_OTAP)
— this requires a (free) Hikvision partner-portal account to download the
full spec; the endpoint/payload below is confirmed independently by:
[Home Assistant community: Hikvision door station ISAPI remoteCheck](https://community.home-assistant.io/t/hikvision-door-station-isapi-remotecheck/828025),
[homebridge-camera-ffmpeg discussion on DS-KD8003 ISAPI door/relay command](https://github.com/Sunoo/homebridge-camera-ffmpeg/discussions/1145),
and [Hikvision-Addons doorbell ISAPI reference](https://github.com/pergolafabio/Hikvision-Addons/blob/main/doorbell/ISAPI.md).

- **Auth:** HTTP Digest authentication (not Basic) against the device's own
  admin credentials.
- **Unlock call:** `PUT http://{device-ip}/ISAPI/AccessControl/RemoteControl/door/1`
  with XML body `<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>`.
- **Related read-only endpoint** (useful for a connectivity/health check,
  see Subtask C): `GET /ISAPI/System/deviceInfo` — returns device model/
  serial as XML, a cheap way to confirm the IP+credentials actually reach a
  real Hikvision device before anyone tries to open a real door with it.
- **Response handling:** Hikvision devices can return **HTTP 200 with an
  XML error body** — don't treat HTTP status alone as success. Parse the
  response body's status code/message per the ISAPI spec (confirm exact
  field names against the TPP doc above when implementing) and only report
  success when the device itself confirms the command succeeded.

### Architecture decision — extend `openBarrier()`, don't fork it

`DOOR_INTERCOM` opening is functionally the same user-facing action as
opening a barrier: hold-to-open in the app, PIN 2FA check (Task 0002),
tenant/ownership verification, audit log. Don't duplicate that entire
security-critical pipeline for a second endpoint. Instead:

- Extend the type guard in `openBarrier()` (currently
  `if (accessPoint.type !== BARRIER && accessPoint.type !== GATE)`) to also
  accept `DOOR_INTERCOM`.
- Everything else in that method — ownership/tenant checks, PIN
  verification and lockout, audit logging — applies unchanged. This is the
  entire point of doing it this way: Task 0002's PIN 2FA work automatically
  covers domofon too, for free.
- The only thing that changes per access-point is **which adapter actually
  fires the relay** — see below.

### Architecture decision — adapter selection by `controllerType`

`AccessPoint.controllerType` is already a free-form string field (current
values in use: `"PAL_ES"`, mentioned in schema comments: `"MQTT_RELAY"`,
`"RTSP_CAMERA"`) — no schema change needed to add a new value. Today,
`AccessControlService` hardcodes a single
`private barrierAdapter: IBarrierAdapter = new MockBarrierAdapter();`
instance used for everything. Change this to a **selection function**:

```ts
private resolveAdapter(controllerType: string): IBarrierAdapter {
  if (controllerType === 'HIKVISION_ISAPI') {
    return this.hikvisionAdapter; // real implementation, see Subtask A
  }
  return this.mockAdapter; // existing MockBarrierAdapter, unchanged — still used for PAL_ES, MQTT_RELAY, and anything else until those get real adapters too
}
```

Call `this.resolveAdapter(accessPoint.controllerType).triggerOpen(...)`
instead of the hardcoded instance. This means: nothing changes for existing
`PAL_ES`-configured barriers (still mocked, since that vendor is still
unconfirmed per [PROGRESS.md](PROGRESS.md)); a `DOOR_INTERCOM` access point
only gets real Hikvision calls once staff explicitly sets its
`controllerType` to `HIKVISION_ISAPI` with a real `endpointUrl` — nobody
gets a surprise real HTTP call to a nonexistent device.

### Credentials — single shared config for now, not per-device

There is exactly zero real Hikvision installations to manage today. Don't
build a per-device credential vault. Add two new env vars,
`HIKVISION_DEFAULT_USERNAME` / `HIKVISION_DEFAULT_PASSWORD`, read via
`ConfigService` the same way `JWT_ACCESS_SECRET` etc. already are, and used
by `HikvisionIsapiAdapter` for every `HIKVISION_ISAPI`-typed access point.
Unlike `JWT_ACCESS_SECRET`, **don't** throw at app startup if these are
unset — this integration is optional per deployment (not every ЖК has this
hardware). Instead, throw a clear, specific error only when
`HikvisionIsapiAdapter.triggerOpen()` is actually invoked without
credentials configured. Add both vars to
[.env.example](../.env.example) with a comment noting they're only needed
if a `HIKVISION_ISAPI` access point is configured, and that per-device
credentials are a future enhancement once there's more than one real
installation to justify it.

### Audit log clarity

`AccessLog.action` is currently always the literal string `'OPEN_BARRIER'`
regardless of access-point type. Derive it from `accessPoint.type` instead
(e.g. `'OPEN_INTERCOM'` for `DOOR_INTERCOM`) so the audit trail actually
says what happened — small change, don't skip it.

---

## Subtask A — Backend: AccessPoint registration (missing prerequisite)

There is currently **no way to create an `AccessPoint` at all** outside of
`seed.ts` — [access-control.controller.ts](../backend/src/modules/access-control/access-control.controller.ts)
only has read/open/guest-pass/logs endpoints. Without this, staff can't
actually add a domofon (or a barrier, or a camera) through the app at all.
Add, following the exact pattern of `addUnit()`/`createMeter()`
(`HOA_ADMIN`, `SUPERADMIN` only, tenant-scoped):

- `POST /access/tenants/:tenantId/points` — create (`name`, `type`,
  `controllerType`, `endpointUrl?`, `rtspStreamUrl?` for cameras,
  `streamName?`).
- `PATCH /access/points/:id` — edit / deactivate (`isActive`). Tenant-scoped
  via the existing point's `tenantId`.

Keep this generic (works for any `AccessPointType`), not domofon-specific —
it's a gap that happens to block this task, not a domofon-only feature.

## Subtask B — Backend: Hikvision ISAPI adapter + DOOR_INTERCOM wiring

In [access-control.service.ts](../backend/src/modules/access-control/access-control.service.ts):

- Implement `HikvisionIsapiAdapter implements IBarrierAdapter`:
  - `triggerOpen(endpointUrl, controllerType)` sends the digest-authenticated
    `PUT .../ISAPI/AccessControl/RemoteControl/door/1` call described above.
  - Reasonable timeout (5s) — a hung network call to an unreachable device
    must not hang the whole request.
  - Catch network errors and non-success ISAPI responses, surface a clear
    failure (don't let a raw HTTP client exception bubble up as a 500 with
    no useful message).
  - Use a Node HTTP digest-auth capable client — check what's already
    available in `package.json` before adding a new dependency; if nothing
    suitable exists, a small hand-rolled digest-auth implementation (parse
    the `WWW-Authenticate` challenge, retry with the computed digest header)
    is well-documented and doesn't need a heavy library.
- Add the `resolveAdapter()` selection method described above, replacing
  the hardcoded single instance.
- Extend `openBarrier()`'s type guard to accept `DOOR_INTERCOM`.
- Derive `AccessLog.action` from the access point's type.
- Add `HIKVISION_DEFAULT_USERNAME`/`HIKVISION_DEFAULT_PASSWORD` to
  `ConfigService` usage and `.env.example`, per the credentials note above.

**Tests:** extend `access-control.service.spec.ts` — `openBarrier()` now
succeeds for a `DOOR_INTERCOM` access point (mocked adapter path, same as
existing barrier tests), `resolveAdapter()` picks the Hikvision adapter
only for `controllerType: 'HIKVISION_ISAPI'` and the mock adapter for
everything else, `HikvisionIsapiAdapter.triggerOpen()` throws a clear error
when credentials aren't configured (mock `ConfigService` returning
undefined for the two new keys). Don't attempt to test against a real
network call in the unit suite — mock the HTTP client.

## Subtask C — Web: register access points + connectivity check

Extend [access/page.tsx](../frontend-web/src/app/dashboard/access/page.tsx)
(`HOA_ADMIN`/`SUPERADMIN` only for the write actions) with:

- A form to register a new access point (name, type dropdown including
  "Домофон", controller type, endpoint URL).
- For a `HIKVISION_ISAPI`-typed point, a "Проверить соединение" button that
  calls a new lightweight endpoint,
  `GET /access/points/:id/health-check` (`HOA_ADMIN`/`SUPERADMIN`), which
  does the digest-authenticated `GET .../ISAPI/System/deviceInfo` call and
  reports reachable/unreachable — so staff configuring a real device for
  the first time gets immediate feedback instead of finding out the IP was
  wrong only when a resident complains the door didn't open.
- Full kk/ru/en i18n from the start, same as every prior web task — extend
  the existing `access` namespace.

## Subtask D — Mobile: show domofon points in AccessScreen

[AccessScreen.tsx](../mobile/src/screens/access/AccessScreen.tsx) currently
has a single "Шлагбаумы и въездные ворота" section rendering `HoldToOpenButton`
for `BARRIER`/`GATE` points. Add a "Домофоны" section rendering the same
`HoldToOpenButton` + `PinEntryModal` flow (already built in Task 0002, needs
no changes) for `DOOR_INTERCOM` points — the API call is identical, only the
access-point `type` differs. Extend the `access` i18n namespace for the new
section header.

---

## Acceptance criteria

- Staff can register a new `DOOR_INTERCOM` access point through the web
  panel; it appears in the mobile app's new "Домофоны" section for
  verified residents of that tenant.
- Opening a domofon point requires PIN confirmation exactly like a barrier
  (Task 0002's flow, unmodified, now also covers this type).
- With `controllerType: 'HIKVISION_ISAPI'` and no credentials configured,
  attempting to open returns a clear configuration error, not a crash.
- `AccessLog` entries for a domofon open are labeled distinctly from
  barrier opens.
- Existing `PAL_ES`/mock-controlled barriers behave exactly as before —
  zero behavior change for anything not explicitly set to
  `HIKVISION_ISAPI`.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in all three
  apps; full kk/ru/en key parity maintained.

## Explicitly out of scope

- **Video/call handling** (answering a video call from the panel, seeing
  who's at the door before opening) — ТЗ §3.3 asks for door opening, not a
  full video-intercom experience in-app; that's a much larger feature
  (real-time signaling, likely SIP or Hikvision's own push protocol) and
  not something to fold in here.
- **Per-device credentials** — see the credentials note above.
- **Barrier/СКУД hardware** (as opposed to the domofon) — vendor still
  unknown per [PROGRESS.md](PROGRESS.md), untouched by this task.
- **Confirming the DS-KV model/API against an actual device or Hikvision
  support** — nobody on this project has done that yet; this task
  implements the documented protocol faithfully but the "unverified against
  real hardware" caveat stays until someone does.

## Deliverable

- Subtask A+B (backend) can ship separately from C/D (frontend), same as
  prior multi-platform tasks.
- PR description must state plainly: **this has not been tested against a
  real Hikvision device** — implemented per the cited documentation/
  community references, needs a smoke test once device access exists.

---

## Review addendum (2026-09-08) — wrong `.env.example` file

**Verified good:** everything else — `openBarrier()` extension, adapter
selection, real digest-auth flow (tested against a mocked 401 challenge +
authenticated retry, not just happy-path), XML response/error parsing,
AccessPoint CRUD with correct role checks, health-check endpoint, mobile
"Домофоны" section, 137/137 backend tests, `tsc --noEmit` clean in all
three apps, full kk/ru/en key parity (373 mobile / 435 web). No schema
change was needed and none was made, as expected.

**Found:** the two new env vars
(`HIKVISION_DEFAULT_USERNAME`/`HIKVISION_DEFAULT_PASSWORD`) were added to a
**newly created `backend/.env.example`**, not to the existing canonical
[.env.example](../.env.example) at the repo root. The two files have now
diverged — the new one even uses different placeholder text for the JWT
secrets (`"your-jwt-access-secret"` vs. the root file's
`"CHANGE_ME_IN_PRODUCTION_generate_with_openssl_rand_hex_32"`) and drops the
production security-warning comments the root file has. Since
`ConfigModule` reads `.env`/`../.env` at runtime (never `.env.example`
directly), this doesn't break anything functionally — but anyone following
the established setup convention (copy the root `.env.example`) will never
see the Hikvision variables, and now there are two inconsistent templates
to maintain.

**Required fix:** add the two Hikvision variables (with the same comment
explaining they're optional) to the root `.env.example`, and delete
`backend/.env.example` entirely — there should be exactly one template file,
as before this task.

**Optional, not blocking:** `access-control.controller.ts` now has both
`tenant/:tenantId/points` and `tenants/:tenantId/points` (singular and
plural) as aliases for both the GET and new POST routes — apparently added
to reconcile the existing singular convention with this task's spec text,
which used the plural form by mistake (copied from the finance/meters
modules' convention rather than checking this module's existing routes
first — that's on this spec, not on the implementation). Four routes doing
two things is a little untidy; feel free to drop the plural aliases and
keep only the existing singular form for consistency, but this isn't worth
a re-review cycle on its own.
