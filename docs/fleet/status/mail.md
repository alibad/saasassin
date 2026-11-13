# SaaSassin Mail — build status (2026-11-06, round 2)

**One line:** users import real mail (.eml / .mbox) and triage it entirely from the keyboard — now with filter rules, an address book, multi-select bulk triage with undo, mute, an unsubscribe helper, send-later queues and an indexed search — and the whole data layer is proven against a real Firestore emulator. Live Gmail/Microsoft sync and sending still show an honest "not configured" state.

## Signed-in product (2026-11-13)

- **Dark-first, three-pane shell in Mail's own brand** (`mail-workspace.tsx`): sidebar (mark,
  `WorkspaceSwitcher`, Compose `c`, mailboxes with counts and `g`-shortcut hints, labels, Contacts /
  Splits & filters / Accounts / Team / Activity), split tabs over the list, reading pane with
  tooltip shortcuts, ⌘K command palette, a shortcut bar and an `AccountMenu` with the photo.
- **Faces:** `loadMailbox` returns `people` (active members with Mail profile name and photo;
  emails follow the team page's visibility rule). A sender, recipient or audit actor who is a
  teammate shows their photo; everyone else shows initials. Remote images are never fetched.
- **Team** is the shared `TeamPanel` (the old `members` route stays for compatibility).
- **Demo data:** `scripts/seed-demo-mail.mjs` (fictional "Fernhill Studio", emulators only).

## What users can do now

| Area | Works end-to-end (Firestore, tenant-scoped, audited, exported) |
|------|------------------------------------------------------|
| Workspace | Create a mail workspace, switch workspaces, sign out |
| Import | Upload .eml files or an .mbox export → parsed server-side, threaded, deduplicated by Message-ID (re-import is safe), import history. A reply imported before its parent now takes the original subject once the parent arrives |
| Inbox | j/k navigate, Enter open, e archive (Done), # trash with Dialog confirm, s star, u read/unread, z undo, Esc back |
| **Filters (new)** | Rules on from / to-cc / subject / List-Id / has-attachment (all or any) → label, archive, star, mark read, skip the inbox. Run on every import; **Test against existing mail** previews matching messages and threads before saving; **Apply to existing mail** is a separate, confirmed, audited step that never touches Trash; on/off switch; delete |
| **Contacts (new)** | Address book derived from imported mail headers: header name, address, messages sent/received, first seen, last contacted, frequent correspondents (you excluded). Contact page lists every shared thread (click opens it) and lets writers set a display name (empty restores the header name) |
| **Bulk triage (new)** | x selects, Shift+J/K extends the selection; e / # / s / u / l act on the whole selection (archive or restore, trash with Dialog confirm, star, read/unread, labels) from the keyboard or the selection bar. z undoes the bulk action exactly (server stores the prior field values per thread); all-or-nothing |
| **Mute + unsubscribe (new)** | m mutes: the thread goes to Done and later replies never bring it back (it still shows unread); Unmute or z returns it. Newsletters show their List-Unsubscribe targets: the web page opens only when clicked (no referrer), a mailto target becomes an ordinary draft. Nothing is ever requested automatically, including RFC 8058 one-click |
| **Send later (new)** | Send later (presets or a picked time) queues a draft; it stays editable (keeps its slot) and cancellable before its time; a Scheduled view lists the queue. Every scheduled draft says "will not send: no provider"; after its time it reads "due, not sent", and editing it returns it to Drafts |
| Splits | Rule-based split tabs with unread/total counts (sender domain/address, calendar invite, newsletter, label, subject); Calendar + News seeded; Tab cycles splits |
| Snooze / follow-ups | h snooze (hidden until the time, woken by new mail); f follow-up resurfaces only if nobody replied |
| Labels, drafts, snippets | l labels and label views; r reply / c compose with snippets; Send records `send_blocked` and shows "Sending provider not configured … nothing was sent" |
| **Search (faster)** | / with from:, to:, cc:, subject:, has:invite, has:attachment. Reads each message's stored token index, not every body; identical results to the old full scan. Mail imported before the index falls back to its body until a writer clicks **Build search index** |
| Safety | Email HTML is never rendered (text only, tracking pixels never load); unsubscribe links refuse javascript:/data:/credentialed URLs |
| Team / audit / export | admin/member/viewer roles (viewers read-only), append-only audit view, `GET /api/mail/tenants/{id}/export` → manifest + threads, messages, drafts, splits, snippets, filters, contact names, derived address book, bulk operations, import runs, settings, members, audit |
| Command palette / shortcuts | ⌘/Ctrl+K and ? cover the new actions (mute, contacts, filters, selection keys) |

## Emulator proof

```
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-23.jdk/Contents/Home PATH="$JAVA_HOME/bin:$PATH" \
  pnpm exec firebase emulators:exec --config .emulator-mail.json --only firestore --project demo-saasassin \
  "pnpm exec vitest run --config vitest.emulator.config.mjs tests/mail.emulator.spec.ts"
```

Result: **18/18 passed** (2026-11-06). (`JAVA_HOME` alone was not enough — `java` on PATH must be 21+.) `.emulator-mail.json` uses port 8188 (hub 8288, logging 8388) and is not committed.

`tests/mail.emulator.spec.ts` drives `src/lib/mail/service.ts` + `store.ts` (the exact functions the route handlers call) with owner / member / viewer / outsider users: import + Message-ID dedupe + re-import, reply-before-parent threading, splits and counts, archive/trash/restore/star/read/labels, snooze hidden-until and wake on new mail, follow-ups, drafts and the blocked (audited) send, snippets, search operators, filters (preview → import-time actions → explicit retro-apply → disable → delete), contacts (counts, shared threads, rename/clear), bulk triage with exact undo and no partial writes, mute + unsubscribe targets from stored headers, send-later lifecycle, indexed search == full scan (including legacy unindexed mail and reindex), viewer 403s on every write, outsider 404s, a second tenant's isolation, every mutation audited, and an export whose every file matches the stored record counts.

Bugs it found and fixed: route logic lived in handlers (moved to `service.ts` so the spec runs production code); a thread whose reply arrived first kept the "Re:" subject forever; saving a reply draft did not check the thread exists.

## Modules

- **Done:** import + MIME parser (now records List-Id and List-Unsubscribe-Post), threading, split inbox, snooze, follow-ups, labels, read/unread, star, undo, command palette, drafts, snippets, filters, contacts, bulk triage, mute, unsubscribe helper, send later (queue only), indexed search, members, audit, export, provider adapter boundary, emulator proof.
- **Remaining:** Gmail/Microsoft OAuth adapters (`MailProviderAdapter` in `src/lib/mail/provider.ts`), encrypted token storage, incremental sync, real send with undo-send and a worker that actually sends scheduled drafts, attachment storage (needs Firebase Storage), saved searches, optional AI assistance.

## Key decisions

- **Service layer.** Route handlers only resolve the session (`mailContext`) and parse input; `service.ts` re-checks the writer role itself (`assertWriter`), so no caller can skip it.
- **Filters vs mute share one rule.** `applyArrival` decides what new mail does to a thread: normally back to the inbox and unread; *skip the inbox* or *muted* keeps it where it is (new threads land in Done); *archive* always files it; *mark read* leaves unread as it was. Retro-apply is explicit and never touches Trash.
- **Contacts are derived, names are stored.** The address book is computed from message headers (`select()` — no bodies) on read; only display-name overrides are documents (`contacts/{c_hash}`), so counts never drift.
- **Bulk undo is server-side.** Each bulk action writes a `bulkOps` record with the prior values of exactly the fields it changed; undo restores those and refuses a second time.
- **Send later is honest.** No worker sends anything; status is computed (`queued` / `due_unsent`), never faked as sent.
- **Index equivalence by construction.** Tokens are maximal letter/digit/underscore runs; a term of only those characters is in the body iff it is in a token. Anything else is verified on candidate bodies. The old full scan (`searchMessages`) stays as the reference and is compared in tests.
- **No composite indexes.** Every query is a single `where` or a plain collection read; filtering and sorting are in memory.

## Known gaps

- Signed-in UI was typechecked/linted and built, but not driven in a browser this round (no Firebase test account); the data layer is emulator-proven.
- Mail imported before this round has no List-Id, so List-Id filters cannot match it (the preview says how many messages that is). Its search falls back to bodies until **Build search index** is run.
- Attachments are listed but not stored; message bodies capped at 60k chars; raw messages over 3 MB skipped.
- Contacts and filter preview read all message headers per request — fine for imported mailboxes, needs a stored aggregate for large synced ones.

## Tests

Unit: `tests/mail-parser.test.ts`, `tests/mail-workflow.test.ts`, `tests/mail-filters.test.ts` (conditions, all/any, outcome merge, arrival/skip-inbox/mute, retro patch, schema), `tests/mail-contacts.test.ts`, `tests/mail-unsubscribe.test.ts` (targets, refusals, mute + undo), `tests/mail-schedule.test.ts`, `tests/mail-search-index.test.ts` (indexed == full scan on 41 queries, with/without legacy mail, limits, bodies read). Emulator: `tests/mail.emulator.spec.ts` (18 tests).
