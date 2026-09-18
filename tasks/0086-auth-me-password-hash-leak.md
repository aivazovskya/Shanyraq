# Task 0086: Stop leaking password/PIN hashes from GET /auth/me

**Status:** Done
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Security fix, found while reviewing [Task 0084](0084-community-board-phone-visibility-toggle-ui.md)'s
claim that `GET /auth/me` "already returns all scalar fields." That
claim is correct — and that's the problem. **Confirmed by reading
[auth.service.ts:768-793](../backend/src/modules/auth/auth.service.ts#L768-L793):**

```ts
async getMe(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: true, ownerships: { include: { unit: { include: { building: true } } } } },
  });
  ...
  return user;
}
```

`include` (unlike `select`) does not limit which scalar columns come
back — it only adds relations on top of *every* column on `User`.
Since the method then `return user;`s the raw Prisma result with no
projection at all, **`GET /auth/me`'s JSON response contains
`passwordHash` and `accessPinHash` (both bcrypt hashes) in plaintext-
hash form, for any authenticated user's own account, today.** No
`ClassSerializerInterceptor` or other global response-stripping
mechanism exists anywhere in this backend (confirmed — `main.ts` has
none), so nothing else catches this.

**Confirmed this is the only leak of its kind, not a wider pattern —
checked every other `return <raw prisma user>` in the backend:**
- `properties.service.ts`'s resident-detail lookup (the other `return
  user;` in the codebase) already uses an explicit `select` whitelist
  with no hash fields — safe, not affected.
- `jwt.strategy.ts`'s `return user;` is Passport's internal
  `validate()` return, attached to `req.user` for guards/decorators —
  never serialized directly into an HTTP response by any controller in
  this codebase (confirmed no controller does `return req.user` or
  `@CurrentUser()` without further processing in a way that would leak
  it).
- `AuthService.verifyOtp` ([auth.service.ts:296-309](../backend/src/modules/auth/auth.service.ts#L296-L309))
  already does this correctly — it manually projects the returned
  `user` into a safe literal (`{ id, phone, firstName, lastName, role,
  tenantId, isVerified, ownerships }`), deliberately omitting
  `passwordHash`/`accessPinHash`. **This is the established safe
  pattern already proven correct elsewhere in the same file** — `getMe`
  just never got the same treatment.
- `frontend-web` never calls `/auth/me` at all (confirmed by grep — the
  web dashboard reads the session from its own login response, not a
  live profile fetch), so the practical exposure today is to the
  mobile app's own authenticated user viewing their own account — not
  a cross-user leak. Still a real defense-in-depth violation: any
  logging, crash-reporting, or on-device inspection that captures an
  API response now captures that user's password/PIN hash for free,
  handing an attacker a head start on offline cracking without ever
  touching the database.

### Architecture decisions already made — do not re-litigate

1. **Switch `getMe`'s query from `include` to `select`, whitelisting
   exactly the fields this project's consumers actually need — not a
   blacklist that strips two named fields and stays silently
   vulnerable to the next sensitive column someone adds to `User`.**
   Before finalizing the field list, check what
   `mobile/src/api/auth.ts`'s `UserProfile` interface currently
   declares (id, phone, firstName, lastName, role, tenantId, tenant,
   isVerified, ownerships, and now `hidePhoneInListings` per Task
   0084) and confirm nothing else in the mobile app reads additional
   fields off the `/me` response that would silently break if
   omitted — grep `AuthApi.getMe()`'s call sites, don't just trust the
   TS interface (a caller could read an untyped field via `any`).
2. **Do not touch `verifyOtp`'s existing safe-projection pattern** —
   it's already correct; this task fixes `getMe` to match it, not the
   other way around.
3. **No change to what `mustChangePassword`/`isActive` exposure looks
   like** — those two are already returned elsewhere (e.g.
   `loginWithPassword`'s response) and aren't secrets; include them in
   the new `select` if the mobile client currently reads them from
   `/me`, per decision #1's verification step, don't reflexively
   exclude every non-obviously-public field out of caution once the
   two actual secrets (`passwordHash`, `accessPinHash`) are gone.
4. **`accessPinSetAt` (a timestamp, not a secret) can stay** if
   currently consumed — it reveals *that* a PIN was set and *when*,
   not the PIN itself; not in the same category as the two hash
   fields.

---

## Subtask A — Backend fix

- In [auth.service.ts](../backend/src/modules/auth/auth.service.ts),
  change `getMe`'s `prisma.user.findUnique` from `include` to `select`,
  whitelisting the fields per decision #1 plus the nested `tenant` and
  `ownerships.unit.building` relations (same shape as today, just
  reached via `select: { ..., tenant: true, ownerships: { include: {
  unit: { include: { building: true } } } } }` — Prisma allows mixing
  `select` at the top level with `include` inside a selected relation,
  verify the exact syntax compiles rather than assuming).
- Confirm `passwordHash`/`accessPinHash`/`accessPinSetAt`/`tokenVersion`
  (internal, not user-facing) are excluded unless decision #4 says
  otherwise for `accessPinSetAt`.

**Tests:** extend `auth.service.spec.ts`:
- `getMe`'s returned object does **not** have a `passwordHash` or
  `accessPinHash` property at all (not just `undefined` from a
  destructure — assert the key is genuinely absent from the returned
  object, e.g. `expect(result).not.toHaveProperty('passwordHash')`,
  since a mocked Prisma client could otherwise mask a `select` typo
  that silently still includes it).
- `getMe` still returns everything the mobile app currently needs
  (`id`, `phone`, `firstName`, `lastName`, `role`, `tenantId`, `tenant`,
  `isVerified`, `ownerships` with nested `unit`/`building`,
  `hidePhoneInListings`) — a regression test proving the fix didn't
  silently break the mobile profile screen by over-trimming the
  `select`.

---

## Acceptance criteria

- `GET /auth/me`'s response body contains no `passwordHash` or
  `accessPinHash` field, proven by a dedicated test asserting the
  key's absence, not just that the app still compiles.
- Every field the mobile app currently reads from this endpoint is
  still present and correctly shaped (no regression in
  `ProfileScreen`/`AuthContext`'s consumption of `GET /me`).
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/` and `mobile/`.

## Explicitly out of scope

- Any change to `verifyOtp`, `loginWithPassword`, or any other
  endpoint's response shape — this task is scoped to the one confirmed
  leak in `getMe`.
- Adding a global `ClassSerializerInterceptor` or similar cross-cutting
  response-sanitization mechanism — the one leak found has a direct,
  narrow fix; introducing new global infrastructure for a single call
  site would be over-engineering, matching this project's established
  "explicit, not magic" convention (see [Task 0041](0041-staff-audit-trail.md)
  decision #5's identical reasoning for a different cross-cutting
  concern).
- Rotating any already-issued credentials — bcrypt hashes are
  computationally expensive to reverse and there's no evidence of
  actual exploitation; this is a defense-in-depth fix for a latent
  exposure, not an active-breach response.

## Deliverable

- Single backend commit.
- PR description confirms the "no passwordHash/accessPinHash key"
  test result explicitly, and confirms the mobile app's profile screen
  was manually checked to still render correctly after the fix.
