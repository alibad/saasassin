# SaaSassin Research — status (2026-10-26)

Open-source Dovetail replacement at `/apps/research` (research.saasassin.net).

## What users can do now

| Step | Works end-to-end (UI → API → Firestore) |
|------|------------------------------------------|
| Create a research workspace and invite people as admin / researcher / viewer | ✅ |
| Create projects (one research question each) | ✅ |
| Add an interview by uploading `.vtt` / `.srt` / `.txt` or pasting — parsed in the browser with a live preview, stored as text (no Firebase Storage) | ✅ |
| Record participant (name/pseudonym, company, email) and consent (status, captured date, retention date, notes) | ✅ |
| Read the transcript as speaker + timestamp segments; correct segment text and speaker; rename a speaker across the interview | ✅ |
| Select words to create a highlight with tags and a note (selection snaps to whole words; spans validated server-side) | ✅ |
| Highlights survive corrections: re-anchored to the same words, or flagged “words changed” if they were removed | ✅ |
| Create insights that must cite ≥1 highlight; each citation shows the quote, speaker, source, timestamp and char span, with “Open in transcript” jumping to and marking the exact span | ✅ |
| Group insights into themes (collections) | ✅ |
| Tag frequency view, filter by tag, rename / merge tags across the project | ✅ |
| Search transcripts, highlights, tags and insights in a project (server-side, membership-checked, ranked: insight > highlight > transcript > interview); results deep-link to the span | ✅ |
| Redact a transcript span: replaced with `[redacted]`, overlapping highlights rewritten, stored original upload discarded, audit event records who/when/why/length — never the words | ✅ |
| Delete an interview (owners/admins) with a reason: highlights removed, insights lose those links, audit event kept | ✅ |
| Retention & consent queue across the workspace (expired, withdrawn, ending within 30 days, consent pending) | ✅ |
| Import a Dovetail highlights export (CSV or JSON): preview the column mapping, skipped rows with reasons and unmapped columns, then import; imported interviews are marked “consent pending” | ✅ |
| Export one project as versioned JSON (`net.saasassin.research.project` 1.0.0) incl. corrected transcripts, stored originals, consent, highlights, insights, themes and the explicit insight → highlight → source span chain | ✅ |
| Export the whole workspace (shared manifest + every project + members + audit log) | ✅ |
| Audit log view | ✅ |
| Viewers can read, search and export but every write returns 403 from the server | ✅ |

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (23 research tests: VTT/SRT/plain parsing, timestamps, span validation, word snapping, re-anchoring, redaction offsets, search ranking/snippets/visibility, export shape and evidence chain, Dovetail mapping/report/JSON normalisation, roles, tag frequency, retention, action validation) and `pnpm build` all pass.
- Dev server: `/apps/research` and `/apps/research/sign-in` return 200 signed out; every `/api/research/**` route returns 401 without a session.
- The signed-in UI was exercised in a browser with a temporary harness that faked the API in memory (not committed): workspace tabs, transcript rendering with highlights and redaction markers, drag-select → highlight panel with correct offsets, insight evidence cards, search → transcript deep link, Add interview live SRT preview, and 390 px layout.
- **Not verified live:** writes against real Firestore. Per tonight’s rules no Firebase account was created or signed in. The data layer only uses single-field `where` queries (no composite indexes needed).

## Key decisions

- **One validated action endpoint** (`POST /api/research/tenants/:t/projects/:p`) with a zod discriminated union: one place for membership, role checks, validation and audit.
- **Transcripts are stored as segment arrays on the source document**; highlights store `segmentId + [start,end) + quote`, so the evidence chain is explicit and portable.
- **Redaction discards the stored original upload**, because keeping it would keep the redacted words.
- **Search is in-memory per project** after a server-side membership check. That is fine at tenant scale, and permissions apply automatically because only that project’s records are ever loaded.
- **Tags are normalised strings on highlights** (lowercase, hyphenated), so rename/merge is a single batched rewrite.

## Remaining / known gaps

- Audio/video upload, automatic transcription and clips need Storage plus a transcription provider (out of scope tonight). The Add interview dialog says so; only transcripts are ingested.
- Folder-level and artifact-level roles, view-as-role, legal holds, scheduled retention enforcement (the queue is manual), reports/canvases, version history, review/approval, semantic search, the API/webhooks, and optional AI assistance.
- Firestore rules tests for research paths: rules are shared (deny-all on `products/**` already covers browser access); research-specific rule tests were not added because `firestore.rules` is outside this agent’s ownership.
- Dovetail import covers highlight exports; it does not yet reconcile against a live Dovetail API, retry, or import insights/tags as separate entities.
- Firestore documents are capped at 1 MB, so transcripts are limited to 400k characters and the original is kept only when ≤ 250k characters.
