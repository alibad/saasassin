# Prompt for Claude — fully build SaaSassin Research

Build SaaSassin Research in the existing repository:

`/Users/alibadereddin/Code/GitHub/saasassin`

Do not reopen portfolio strategy. Inspect `AGENTS.md`, `CLAUDE.md`, git status and
history, `docs/fleet/architecture.md`, the Research entry in
`src/lib/fleet/apps.ts`, the Dovetail target data/page, Firebase configuration,
rules, and existing shared UI/auth code. Confirm the design-partner and security
gate; if it is open, begin implementation immediately. If it is not open, preserve
the foundation and report the exact missing gate rather than inventing customer
evidence.

The product is SaaSassin Research at `research.saasassin.net`. Dovetail is only the
migration target. Use the accepted SaaSassin mark plus the Research wordmark.

Build a self-hostable research repository for product and research teams handling
sensitive customer evidence. The first complete workflow must let a user create a
tenant and project, import or upload an interview, record consent metadata,
transcribe and correct it, create highlights/tags/clips, synthesize an insight with
source backlinks, retrieve it through search, and export the complete project.

Complete product boundary:

- organizations, workspaces, projects, folders, participants, consent, and retention;
- document, audio, video, transcript, and bulk archive ingest with resumable jobs;
- transcription status, speaker correction, timestamps, redaction, and original files;
- highlights, annotations, tags, clips, collections, links, and evidence provenance;
- insights, themes, canvases, reports, review/approval, and version history;
- full-text and semantic search that respects permissions and deletion state;
- granular project/folder/artifact roles, view-as-role, and access explanation;
- immutable audit events, deletion jobs, legal holds, and retention enforcement;
- lossless Dovetail import with a preview, mapping report, retries, and reconciliation;
- open versioned project/workspace exports containing sources and relationships;
- API, signed webhooks, integration health, storage/transcription adapters;
- optional AI assistance where every claim links to exact evidence spans and model use is opt-in.

Explicitly exclude a participant marketplace, general document-suite parity,
product analytics, unsupported emotion analysis, unreviewed autonomous conclusions,
and native mobile capture in the first release.

Build vertically: secure repository → ingest/transcript → evidence workflow →
traceable synthesis/search → migration/export. Use Firebase Authentication with
Google and email/password, host-only product sessions, product and tenant scoped
Firestore paths, server-side authorization, and deny-by-default rules. Add rule
tests for cross-product, cross-tenant, folder/project roles, search visibility, and
append-only audits. Encrypt or isolate sensitive storage metadata and never send
raw research content to analytics.

Use real shadcn/ui components and useful empty/error/recovery states. Do not ship
mock evidence as if it were customer data. Read the installed Next.js 16 docs before
framework changes.

Run lint, typecheck, unit tests, Firestore rules tests, import/export contract tests,
and production build. Browser-test upload, transcript correction, evidence links,
permission denial, search, deletion/retention, and export. Deploy to the existing
Vercel fleet and `research.saasassin.net`, then smoke-test production.

Update research/decision material, roadmap, product status, and dated `todo` notes.
Do not create GitHub Actions. Do not commit or push without asking first. Continue
until the golden workflow is real, verified, and deployed or a concrete gate blocks it.
