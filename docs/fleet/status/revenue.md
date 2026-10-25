# SaaSassin Revenue — build status (2026-10-26)

Open-source Gong replacement: conversation intelligence on transcripts you control.
App: `/apps/revenue` (served at `revenue.saasassin.net`). API: `/api/revenue/tenants/[tenantId]/...`.

## What users can do now

- **Sign in and create a team workspace**; switch between isolated workspaces; sign out.
- **Build the pipeline**: add accounts, then deals with stage, amount, close date and owner.
  The deal board shows every stage column with count and value, each deal's last call, and
  **risk signals** (no calls, no call in N days, no next step in the latest call, competitor
  mentioned in the latest call, close date passed). Each signal says which rule fired and
  links to the call (and timestamp) that caused it.
- **Move deals through stages** with a server-enforced stage machine and a full stage history
  (who, when, from → to). Closed deals can only be reopened by an owner/admin.
- **Log a call against a deal** by pasting or uploading a transcript (WebVTT, SRT, or
  `Speaker: text` lines with optional `[mm:ss]` stamps). No audio is processed and no bots join
  meetings. **A recording-consent record is mandatory**: jurisdiction, consent basis (all-party
  verbal / written / notice-and-continue) and an all-party confirmation. The server rejects
  transcripts without it (422); the UI keeps the submit disabled until it is complete.
  The form previews the parse and analysis live in the browser before saving.
- **Automatic deterministic analysis** (pure module, same input → same output): talk ratio per
  speaker, longest monologue, question count, interactivity (speaker switches/min scaled to
  0–10), keyword/competitor tracker hits with timestamps and character offsets, and next steps
  detected by named phrase rules.
- **Review a call**: transcript with tracker highlights (click a tracker to focus it), next-step
  badges, clickable timestamps that jump to the evidence, consent record, and stats.
  Reps add **comments at a timestamp** (or on the whole call).
- **Scorecards**: managers/admins score calls against a weighted 1–5 rubric; the percent and
  notes show on the call and roll into the dashboard.
- **PII redaction**: managers/admins redact an exact span of a segment. The text is replaced by
  `[REDACTED]`, never retained, analysis is recomputed, and the audit log records who, where,
  length and reason — not the removed text.
- **Search every transcript** for a word or phrase and open the call scrolled to the match.
- **Coaching clips & playlists**: reps clip a range of segments into a named playlist with a
  note; the Coaching tab groups clips by playlist and opens each at its moment. Clips store
  timestamps only, so redactions and deletions always apply.
- **Coaching assignments**: managers assign a call (optionally at a timestamp) to a rep with a
  focus note; the rep acknowledges it from their queue. Only the assignee can acknowledge.
- **Editable scorecard rubric** (owners/admins): criteria and weights; saved scorecards keep the
  rubric they were scored with.
- **Retention & deletion**: owners/admins set a retention period, preview exactly which calls
  it would delete, and apply it; single calls can be deleted with a recorded reason. Deletes
  cascade to comments, scorecards, clips and assignments; the audit keeps metadata only.
- **CRM write preview**: each deal lists the CRM fields an approved sync would write (stage,
  amount, close date, last call date, next step, competitors) with a link to the transcript
  moment behind each call-derived value. No CRM is connected, so nothing is written — the
  Integrations tab says so plainly, as it does for Vexa meeting capture.
- **Configurable trackers** (owners/admins): create/edit/delete keyword or competitor trackers;
  re-analyze any call with the current trackers. Stale-call threshold is configurable.
- **Team dashboard** computed only from this workspace's logged calls: per-rep calls, minutes,
  average rep talk ratio, longest monologue, questions/call, interactivity, next-step rate and
  average score — with explicit metric and risk-rule definitions on the page.
- **Members & roles**: owner/admin grant access by email as admin, manager, rep or viewer.
- **Audit log** view (owner/admin/manager) of every mutation; transcript text is never written
  to the audit log.
- **Export**: owners/admins download a complete versioned JSON export
  (`net.saasassin.workspace-export` manifest + accounts, deals, calls with transcripts and
  consent, comments, scorecards, trackers, settings, members, audit events).

## Modules

| Module | State |
| --- | --- |
| Golden workflow (workspace → accounts/deals → consented call → analysis → call page → board risks → export) | Done |
| Transcript parsing (VTT/SRT/plain), analysis, trackers, next steps | Done, unit-tested |
| Deal stage machine + stage history | Done, unit-tested |
| Risk signals | Done, unit-tested |
| Scorecards | Done, unit-tested |
| PII redaction with audit | Done, unit-tested |
| Team/rep dashboard | Done, unit-tested aggregation |
| Members, audit view, export | Done |
| Transcript search | Done, unit-tested |
| Clips + playlists, coaching assignments + acknowledgement | Done, unit-tested rules |
| Rubric editor | Done, unit-tested normalization |
| Retention (preview + apply) and audited call deletion | Done, unit-tested selection |
| CRM write preview with evidence links | Done, unit-tested; actual sync needs a CRM OAuth app |
| Vexa capture adapter, recordings | Honest "not configured" state; needs a Vexa deployment + key |
| Signed webhooks, scheduled retention job, mentions/notifications | Not started |

## Key decisions

- **Transcripts in, no audio.** Capture stays a replaceable upstream adapter (Vexa later); the
  product is useful today with transcripts exported from any meeting tool.
- **Consent is a hard server gate**, enforced twice (zod `z.literal(true)` + explicit check in
  `createCall`). Copy is explicit that Revenue records the attestation and does not decide
  legality.
- **No opaque scores.** Every metric has a written definition; every signal carries a rule id and
  a transcript segment/timestamp. Risk signals are computed at read time, not stored.
- **Firestore without composite indexes**: tenant-scoped collections, single-field queries
  (`callComments`/`scorecards` by `callId`), sorting in memory. Segments live on the call
  document (transcripts are capped at 400k characters / 4,000 segments).
- Roles: owner/admin (privileged), manager (coach: score, redact, audit), rep (write), viewer
  (read). Legacy `member` is treated as rep.

## Known gaps

- Not browser-tested signed in (no test accounts were created, per fleet rules); signed-out
  landing and API auth were checked with curl. Unit tests cover the pure logic only.
- Retention is applied by an admin action, not a scheduled job.
- Tracker edits apply to new calls; existing calls update when someone clicks Re-analyze.
- Contacts (people on accounts) are not modelled yet; speakers are free-text from transcripts.
