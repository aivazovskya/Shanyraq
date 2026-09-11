# Task 0059: Dispatcher chat transcript CSV export

**Status:** Completed
**Assignee:** Team lead (implementing directly while Antigravity is
out of quota, per the user's explicit instruction)
**Reviewer:** N/A for this task while implemented directly — an
independent review can be requested separately if desired.

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[chat.service.ts:409-472](../backend/src/modules/chat/chat.service.ts#L409-L472):**
`getConversationMessages` already fetches a single dialog's messages
for staff, but with two properties that make it unsuitable to reuse
as-is for an export:

1. It caps at `take: 100` — fine for a live inbox view (most recent
   window), wrong for an export meant to be a complete record for a
   dispute (a long-running conversation could easily exceed 100
   messages, silently truncating the "official" transcript).
2. It has a side effect — it updates `lastReadByStaffAt` on every
   call. An export is a reporting action, not "I am now reading this
   inbox"; running an export shouldn't silently mark the conversation
   as read out from under whichever dispatcher is actually working it.

This task adds a dedicated export method that fixes both: no message
cap, no read-state mutation.

### Architecture decisions already made — do not re-litigate

1. **New `exportConversationCsv` method on `ChatService`, not a reuse
   of `getConversationMessages`.** Per the Context section — the two
   methods have genuinely different correctness requirements (complete
   vs. windowed, side-effect-free vs. read-tracking), not just a
   formatting difference.
2. **No message cap — fetch the entire conversation.** This is the
   one property this task exists for: a transcript export must be
   complete, not the same 100-message window the live inbox uses.
3. **Read-only — never touches `lastReadByStaffAt`.** Exporting a
   conversation must not have the side effect of marking it read.
4. **Reuse `assertStaffRole` + `assertAccessToTenant`, exactly as
   `getConversationMessages` already does** — same role set
   (`DISPATCHER`, `HOA_ADMIN`, `SUPERADMIN`), same
   `conversation.tenantId` cross-tenant check. No new authorization
   decision.
5. **CSV convention: `buildCsv`, UTF-8 BOM, header rows naming the
   resident and ЖК** — same shape every prior CSV export in this
   project uses.

---

## Subtask A — Backend: export endpoint

In [chat.service.ts](../backend/src/modules/chat/chat.service.ts), add
`exportConversationCsv(id: string, user: any): Promise<{ buffer:
Buffer; filename: string }>`:

- `assertStaffRole(user)`.
- Fetch the conversation by `id`, including `resident` (`firstName`,
  `lastName`, `phone`, verified `ownerships.unit.unitNumber`+
  `building.blockName` — same shape `getConversationMessages` already
  includes) and `tenant` (`name`). 404 if not found (same code style as
  `getConversationMessages`).
- `assertAccessToTenant(user, conversation.tenantId)` (decision #4).
- Fetch **all** `ChatMessage` rows for the conversation, `orderBy:
  { createdAt: 'asc' }`, **no `take` limit** (decision #2), including
  `sender` (`firstName`, `lastName`, `role`).
- Build CSV via `buildCsv`: columns Дата и время, Отправитель (ФИО),
  Роль, Сообщение, Фото (ссылка). For a photo-only message, leave
  "Сообщение" blank and put the URL in "Фото (ссылка)" — don't
  concatenate them into one column. Header rows naming the resident
  (name, phone, unit if known) and the ЖК.
- Filename `chat-conversation-${id}-${dateStr}.csv` (`dateStr` = export
  date, `YYYY-MM-DD`).
- **Do not call `conversation.update` anywhere in this method**
  (decision #3 — the one thing to be careful not to copy from
  `getConversationMessages`).

In [chat.controller.ts](../backend/src/modules/chat/chat.controller.ts):

- `GET /chat/conversations/:id/export`, same
  `@Roles(DISPATCHER, HOA_ADMIN, SUPERADMIN)` as
  `getConversationMessages`/`sendStaffMessage` right above it
  (decision #4), `@Res()` streaming with `Content-Disposition`.

**Tests:** extend `chat.service.spec.ts` —
- A conversation with more than 100 messages exports all of them, not
  just the most recent 100 (proves decision #2 — this is the one test
  that would fail if this method were a thin wrapper around
  `getConversationMessages`'s query).
- Calling the export does **not** change `lastReadByStaffAt` — assert
  `conversation.update` is never called by this method (proves
  decision #3).
- A photo-only message (no `text`) appears with an empty "Сообщение"
  field and the photo URL in its own column, not concatenated.
- A resident and cross-tenant staff request are rejected (matches
  `getConversationMessages`'s existing role/tenant checks).
- Raw CSV bytes start with the UTF-8 BOM.

---

## Acceptance criteria

- The export is complete regardless of conversation length — proven
  by the >100-messages test.
- The export has no side effects on the conversation's read state.
- Role gate matches `getConversationMessages` exactly.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- A web download button — backend endpoint only, matching the staged
  approach of prior CSV export tasks.
- Exporting all of a tenant's conversations in one file (a bulk
  export) — this task is per-conversation, matching how disputes are
  actually handled (one resident's thread at a time).
- Any change to `getConversationMessages`'s own 100-message cap or its
  read-tracking behavior — that method is correct for its own purpose
  (a live inbox view); this task adds a separate method rather than
  changing it.

---

## Deliverable

- Single backend commit.
- PR description confirms the >100-messages completeness test and the
  no-side-effect-on-read-state test explicitly — those are the two
  properties this task exists to fix relative to
  `getConversationMessages`.

---

## Implementation notes (2026-09-12)

Implemented exactly per the spec above: `exportConversationCsv`
added to
[chat.service.ts](../backend/src/modules/chat/chat.service.ts) —
`assertStaffRole` + `assertAccessToTenant` (identical gate to
`getConversationMessages`), full `chatMessage.findMany` with no `take`
limit, no `conversation.update` call anywhere in the method. CSV
columns: Дата и время, Отправитель (ФИО), Роль, Сообщение, Фото
(ссылка) — a photo-only message leaves "Сообщение" blank rather than
concatenating the URL into it. `GET
/chat/conversations/:id/export` added to
[chat.controller.ts](../backend/src/modules/chat/chat.controller.ts)
with the identical `@Roles(DISPATCHER, HOA_ADMIN, SUPERADMIN)`.

Tests added to `chat.service.spec.ts` (6 new): a 137-message
conversation exports all of them (asserting no `take` param is even
passed to Prisma, not just checking the result length), a dedicated
assertion that `conversation.update` is never called, the photo-only
column-separation check, resident/cross-tenant rejection, UTF-8 BOM,
and a 404 for a missing conversation.

**Verified:** new tests 26/26 (20 prior + 6 new), full backend suite
528/528 (30 suites, 0 regressions), `tsc --noEmit` clean.

**Caveat:** implemented and verified by the same person (the
architect, standing in for Antigravity while it's out of quota) — no
independent second-pass review, same as Tasks 0056/0057/0058. Ask
separately if one is wanted.
