# SaaSassin Mail — build status (2026-10-26)

**One line:** users can import real mail (.eml / .mbox), triage it entirely from the keyboard across rule-based splits, snooze, set follow-ups, label, draft replies, search, and export everything as versioned JSON. Live Gmail/Microsoft sync and sending show an honest "not configured" state.

## What users can do now

| Area | Works end-to-end (Firestore, tenant-scoped, audited) |
|------|------------------------------------------------------|
| Workspace | Create a mail workspace, switch workspaces, sign out |
| Import | Upload .eml files or an .mbox export → parsed server-side, threaded, deduplicated by Message-ID (re-import is safe), import history |
| Inbox | j/k navigate, Enter open, e archive (Done), # trash with Dialog confirm, s star, u read/unread, z undo, Esc back |
| Splits | Rule-based split tabs with unread/total counts: sender domain, sender address, calendar invite, newsletter (List-Unsubscribe), label, subject contains. Calendar + News seeded by default; Tab cycles splits |
| Snooze | h → presets or custom date; thread hidden until then, returns automatically; new mail un-snoozes |
| Follow-ups | f → "remind me if nobody replies by"; resurfaces in Inbox with a Follow up badge only if no new message arrived |
| Labels | l → add/remove labels; label views in the sidebar; labels can drive a split |
| Inbox zero | Celebrated empty state per split; distinct empty states for every view |
| Compose / reply | r reply (quoted, reuses an existing reply draft), c compose, snippets inserted at cursor, drafts saved; Send records the attempt and shows "Sending provider not configured … nothing was sent" |
| Search | / → in-memory full-text search over the whole tenant mailbox with from:, to:, subject:, has:invite, has:attachment; ranked, with snippets |
| Safety | Email HTML is never rendered: converted to text (scripts/styles/comments dropped, links shown as text, images reduced to alt text so tracking pixels never load) and rendered as escaped text |
| Team / audit / export | Invite by email with admin/member/viewer roles (viewers are read-only), append-only audit log view, `GET /api/mail/tenants/{id}/export` downloads manifest + threads, messages, drafts, splits, snippets, import runs, members, audit |
| Command palette | ⌘/Ctrl+K: fuzzy-filter every view, split, label, thread action, import, export, team and audit |
| Shortcut sheet | ? lists every shortcut |

## Modules

- **Done:** import + MIME parser, threading, split inbox, snooze, reminders/follow-up, labels, read/unread, star, undo (z), command palette, drafts, snippets/templates, search, per-split counts, members, audit view, export, provider adapter boundary.
- **Remaining:** Gmail/Microsoft OAuth adapters (interface `MailProviderAdapter` in `src/lib/mail/provider.ts`), encrypted token storage, incremental sync, real send with undo-send window and scheduling, attachment storage (needs Firebase Storage), optional AI assistance, command palette, saved searches.

## Key decisions

- **Parse on the server, split on the client.** The browser only splits an .mbox into raw messages and batches them (≤150 messages / ~2.5 MB per request); the route handler parses and validates, so nothing the browser claims about a message is trusted.
- **Order-independent threading.** Thread ids derive from the root reference, and parent ids cited by children are indexed, so replies imported before their parents still converge. Subject matching is only a fallback for "Re:" messages without headers.
- **No composite indexes.** Every query is a single `where` or single `orderBy`; filtering and sorting happen in memory (tenant mailboxes are small).
- **Honest provider state.** Adapters always report `not_configured`; send attempts are recorded as `send_blocked` with an audit event and never simulated.

## Known gaps

- Attachments are listed (name, type, size) but not stored.
- Search loads the tenant's messages per query; fine for imported mailboxes, needs an index for large synced ones.
- Message bodies are capped at 60k characters; raw messages over 3 MB are skipped on import.
- Not tested against live Firestore while signed in (no Firebase accounts were created tonight). Verified instead: signed-out `/apps/mail` and `/apps/mail/sign-in` return 200, the mail API returns 401 without a session, `pnpm build` passes, and the signed-in UI was driven in a browser against a mocked API (an uncommitted local page): j/k/Enter/Esc, # → Dialog confirm, ? sheet, r → reply → Send shows the honest not-configured state, and a 375px layout with no horizontal scroll.

## Tests

`tests/mail-parser.test.ts`, `tests/mail-workflow.test.ts`: multipart/alternative + mixed, quoted-printable, base64 with legacy charsets, RFC 2047 encoded-word subjects and names, address lists with quoted commas, generated ids, mbox splitting with >From unescaping, HTML-to-text sanitizing (script/style/comment/javascript: links/malformed tags), threading (in-order, reversed, cross-import, subject fallback, duplicates), split rules and counts, snooze/archive/follow-up logic, labels, search ranking and operators.
