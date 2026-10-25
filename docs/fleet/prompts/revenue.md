# Prompt for Claude — fully build SaaSassin Revenue

Build SaaSassin Revenue in `/Users/alibadereddin/Code/GitHub/saasassin`.

Read `AGENTS.md`, `CLAUDE.md`, git state/history, `docs/fleet/architecture.md`, the
Revenue registry entry, Gong target research, and existing infrastructure. Review
the current Vexa project, license, APIs, maintainer direction, and supported meeting
providers before implementation. Back and extend Vexa through an adapter; do not
rebuild meeting capture without a proven blocker.

The product is SaaSassin Revenue at `revenue.saasassin.net`; Gong is only the
migration target. Use the accepted SaaSassin mark and Revenue wordmark.

Hard safety gate: establish recording-consent configuration, jurisdiction-aware
operator copy, retention, redaction, and access policy before capturing production
meetings. Do not claim legal compliance.

The golden workflow must let an authorized user sign up, create a tenant, configure
consent/retention, connect a meeting provider and test CRM, capture a consented
meeting, receive/correct a transcript, link an account/opportunity, inspect topics,
questions, objections, commitments, and risks with exact evidence spans, create a
clip/scorecard/coaching comment, preview and approve CRM field writes, and inspect
sync/audit history.

Complete boundary:

- Vexa capture adapter, meetings, consent records, recordings, transcripts, speakers, redaction, retention;
- accounts, contacts, opportunities, stages, owners, CRM connection and field mapping;
- evidence-backed topics, questions, objections, commitments, next steps, competitors, and risks;
- search, playlists, clips, comments, mentions, scorecards, coaching assignments, and acknowledgement;
- dashboards with explicit metric definitions and filters that preserve source drill-down;
- granular roles for recording, viewing, coaching, export, and administration;
- immutable audit, CRM sync preview, idempotent retries, mapping and health history;
- open versioned workspace export, API, signed webhooks, and deletion workflows;
- optional AI only when every signal/summary claim links to transcript timestamps.

Exclude CRM replacement, autonomous sales communication, employee surveillance,
emotion detection, and a new meeting-bot infrastructure layer.

Use Firebase Auth Google/email, host-only product sessions, product/tenant scoped
persistence, server authorization, and strict Firestore rules. Encrypt provider and
CRM tokens. Add cross-product/tenant/role tests, consent enforcement, webhook
signature/replay/order tests, redaction/retention tests, CRM write preview/idempotency,
and claim-to-evidence evaluations. Keep recordings/transcripts out of analytics/logs.

Use proper shadcn/ui, accessible media/transcript controls, and real error/recovery
states. Run lint, typecheck, all tests/rules tests, and production build. Browser-test
the complete golden path and failure recovery. Deploy to the existing Vercel project
and `revenue.saasassin.net`, then smoke-test production and inspect errors.

Update research, roadmap, registry status, and dated `todo` notes. Do not create
GitHub Actions. Do not commit, push, or contact upstream without explicit permission.
Continue until a governed ten-seat-ready workflow is working and verified.
