# Prompt for Claude — fully build SaaSassin Mail

Build SaaSassin Mail in `/Users/alibadereddin/Code/GitHub/saasassin`.

Read `AGENTS.md`, `CLAUDE.md`, git state/history, `docs/fleet/architecture.md`, the
Mail registry entry, Superhuman Mail target research, and current infrastructure.
Audit the current leading open mail clients, their licenses, security posture,
provider adapters, offline model, and maintainer direction. Record and use a
maintainer-backed foundation; do not create another client before proving why.

The product is SaaSassin Mail at `mail.saasassin.net`; Superhuman is only the
migration target. Use the accepted SaaSassin mark and Mail wordmark.

Security gate: complete a threat model for OAuth tokens, message/attachment storage,
search index, HTML rendering, tracking pixels, remote images, and AI data egress
before connecting production mailboxes.

The web golden workflow must let a user sign up, connect one Gmail or Microsoft
test mailbox with least-privilege OAuth, complete resumable initial/incremental sync,
search locally, navigate and triage entirely by keyboard, open a safe-rendered thread,
compose and schedule a reply, undo send, snooze/set follow-up, disconnect/reconnect,
and inspect any AI summary or suggestion with exact source-message links.

Complete boundary:

- provider accounts, encrypted OAuth grants, mailboxes, sync cursors, labels, folders, and health history;
- threads, messages, participants, attachments, drafts, send jobs, delivery state, and safe HTML rendering;
- inbox states, splits, snooze, reminders, follow-up, shortcuts, command palette, undo, and accessibility;
- encrypted local/full-text search index, saved searches, ranking, snippets, and provider fallback;
- compose, reply/forward, signatures, scheduling, aliases where supported, and idempotent send;
- offline/resume behavior appropriate to a web MVP, conflict resolution, quota/backoff, and diagnostics;
- open settings/shortcut export and deletion workflows;
- optional writing assistance/thread summaries with opt-in model settings, redaction, evidence links, and AI audit.

Exclude mail-server hosting, marketing automation, CRM, provider scraping, and
native desktop/mobile clients in the web MVP.

Build vertically: threat model/foundation → OAuth and one provider sync → local
index/search → keyboard triage → compose/schedule/undo → second provider → optional
traceable AI. Keep provider adapters isolated. Sync and send jobs must be resumable,
idempotent, observable, and safe under duplicate/out-of-order events.

Use Firebase Auth Google/email only for the app identity; do not confuse Firebase
Google sign-in with mailbox OAuth consent. Use host-only sessions, product/tenant
authorization where teams exist, encrypted server-only provider tokens, immutable
security/audit events, and strict rules. Add cross-product/tenant tests, token access
tests, MIME/HTML security fixtures, sync replay/conflict/quota tests, send idempotency,
keyboard accessibility, and AI data-egress/evidence tests.

Use proper shadcn/ui. Run lint, typecheck, security/unit/integration/rules tests, and
production build. Browser-test the full workflow and error recovery at desktop and
mobile web sizes. Complete provider OAuth review requirements before production.
Deploy to the existing Vercel project and `mail.saasassin.net`, then smoke-test.

Update threat model, docs, roadmap, registry, and dated `todo` notes. Do not create
GitHub Actions. Do not commit, push, or contact upstream without explicit permission.
Continue until reliable two-provider sync and the premium keyboard loop are proven.
