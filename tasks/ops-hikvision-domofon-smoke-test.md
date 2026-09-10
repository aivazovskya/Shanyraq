# Ops runbook: Hikvision DS-KV domofon smoke test

**Type:** Manual hardware verification (not a coding task — nothing here
goes to Antigravity). Run this once physical/network access to a real
Hikvision DS-KV device exists, then update
[PROGRESS.md](PROGRESS.md)'s домофон row from 🟡 to ✅.

## Why this exists

[Task 0008](0008-domofon-hikvision.md) implemented the Hikvision ISAPI
protocol against documentation and independent community references
(Home Assistant / Homebridge / Hubitat integrations against the same
DS-KV/DS-KD family) — never against a real device, because none was
available. The code is reviewed and tested (137/137 backend tests,
mocked HTTP layer), but "the digest-auth challenge/retry logic and XML
parsing are correct" is a different claim from "this opens a real door."
This checklist closes that gap the first time real hardware is reachable.

## Prerequisites

- [ ] IP address (or hostname) of the DS-KV unit, reachable from wherever
      the backend runs (same LAN, VPN, or port-forwarded — confirm which).
- [ ] Admin username/password for the device's own web UI (this is what
      goes into `HIKVISION_DEFAULT_USERNAME`/`HIKVISION_DEFAULT_PASSWORD`
      in `.env` — see [.env.example](../.env.example) line 45-48).
- [ ] Physical access to watch the actual door/lock during the test —
      a successful-looking API response is not proof the relay fired.
- [ ] A test tenant + verified resident account (or staff account) to run
      the open-flow through the app, not just raw HTTP calls.

## Step 1 — Confirm the device answers plain ISAPI (before touching the app)

From a machine on the same network as the device, using `curl` with
digest auth directly against the device — this isolates "is the device
what we think it is" from "does our adapter code work":

```bash
curl --digest -u admin:PASSWORD http://DEVICE_IP/ISAPI/System/deviceInfo
```

- [ ] Returns HTTP 200 with an XML body containing `<deviceInfo>`,
      `<model>`, `<serialNumber>` etc. — confirms it's genuinely a
      Hikvision device speaking ISAPI, not a different vendor or a
      generic web login page.
- [ ] Note the exact `<model>` value here for the record (e.g.
      `DS-KV8113-WME1`) — Task 0008's implementation targeted the
      DS-KV/DS-KD family specifically; a materially different model
      family is a signal to re-check the vendor docs before trusting the
      rest of this checklist.

If this fails (auth rejected, connection refused, non-XML response),
stop here — nothing past this point will work until the device itself
responds to basic ISAPI calls.

## Step 2 — Register the access point through the web panel

- [ ] Log in as `HOA_ADMIN`/`SUPERADMIN` for the test tenant, go to
      Дашборд → Доступ (`frontend-web/src/app/dashboard/access/page.tsx`).
- [ ] Register a new access point: type "Домофон" (`DOOR_INTERCOM`),
      controller type `HIKVISION_ISAPI`, endpoint URL
      `http://DEVICE_IP` (no trailing `/ISAPI/...` — the adapter appends
      the path itself).
- [ ] Set `HIKVISION_DEFAULT_USERNAME`/`HIKVISION_DEFAULT_PASSWORD` in the
      backend's actual `.env` (not just `.env.example`) to the device's
      real admin credentials, and restart the backend so `ConfigService`
      picks them up.
- [ ] Click "Проверить соединение" (health-check button, calls
      `GET /access/points/:id/health-check`) — confirms reachable.
      If this fails but Step 1's raw `curl` succeeded, the bug is in
      `HikvisionIsapiAdapter`/digest-auth handling, not the device —
      flag as a real bug, don't just retry.

## Step 3 — Open the door through the actual app flow

This is the step that matters — it exercises the full pipeline
(ownership/tenant check → PIN 2FA → adapter → audit log), not just the
adapter in isolation.

- [ ] From the mobile app (resident or staff account with access to this
      tenant), go to Access → "Домофоны" section, find the registered
      point, hold-to-open, enter PIN.
- [ ] **Physically watch the door/lock** — does it actually release?
      Timing: does it fire within a couple seconds, or does anything
      time out first (the adapter uses a 5s timeout —
      `access-control.service.ts:221,249`)?
- [ ] Check the response the app receives — success message, or a
      config/network error surfaced cleanly (not a raw 500)?
- [ ] Check `AccessLog` for this tenant (web panel or DB) — a new entry
      labeled `OPEN_INTERCOM` (not `OPEN_BARRIER`) with the correct
      timestamp and user.

## Step 4 — Negative cases worth checking once, not every time

- [ ] Wrong PIN → rejected before any network call to the device (PIN
      check happens first, per Task 0002 — the device should see zero
      traffic for a failed PIN attempt).
- [ ] Temporarily wrong `HIKVISION_DEFAULT_PASSWORD` → app surfaces a
      clear configuration/auth error, not a hang or a generic 500.
      Restore the correct password after this check.
- [ ] Unplug/power off the device (or block its IP) → attempt to open →
      confirm the 5s timeout actually bounds the request (the app
      shouldn't hang indefinitely) and a clear "unreachable" error comes
      back.

## If everything above passes

- [ ] Update [PROGRESS.md](PROGRESS.md)'s домофон row: 🟡 → ✅, note the
      confirmed device model and date.
- [ ] If anything in Steps 1-4 deviated from what Task 0008 assumed
      (different XML error field names, different door-index for
      multi-door units, different digest-auth quirks), write that up as
      a small follow-up fix task rather than silently patching — future
      installs of a *different* DS-KV model may hit the same thing.

## If something fails

Don't treat a failure here as "revert the feature" — isolate which layer
broke using Steps 1-3 in order (raw device → health-check → full app
flow) and file a focused fix task naming exactly which layer failed and
what the actual device returned (paste the raw XML response body, not
just "it didn't work").
