# SaaSassin Revenue — build status (2026-11-06, round 2)

Open-source Gong replacement: conversation intelligence on transcripts you control.
App: `/apps/revenue` (served at `revenue.saasassin.net`). API: `/api/revenue/tenants/[tenantId]/...`.

## Round 2 — what changed for users

- **Proven on a real Firestore.** `tests/revenue.emulator.spec.ts` drives the real data layer
  (27 tests) through the whole golden workflow and every round 2 slice, with role denials for
  admin/manager/rep/viewer, outsider 404s, cross-tenant isolation, audit events and the export.
- **Fixed: concurrent redactions could restore removed PII.** Two coaches redacting the same call
  at once each wrote back their own stale copy, so the later write put the first redacted text
  (a phone number in the test) back into storage. Redaction now runs in a transaction and carries
  a fingerprint of the segment text it was selected from; a stale selection is refused (409)
  instead of being applied to different text. Stage moves, coaching acknowledgement and
  first-load seeding are now transactional too (no lost stage history, trackers seeded once).
- **Role checks live in the data layer** as well as the routes, so the spec exercises the same gates.
- **Contacts**: add people to accounts (name, title, optional email) and give each a role per deal
  (champion, decision maker, economic buyer, influencer, blocker, end user). On a call, link each
  transcript speaker to a contact on the deal's account or to a teammate; exact-name matches are
  offered as one-click suggestions but never applied automatically. Contacts show talk time,
  calls, share of talk and last call. Deleting a contact unlinks it from every call.
- **Multi-threading risk**: an open deal whose calls have heard exactly one linked customer contact
  gets a `single_threaded` signal pointing at that contact's latest call. Unlinked speakers are
  never counted, so the rule only fires on evidence.
- **Forecast tab**: commit, best case, pipeline, weighted pipeline and closed won — overall, by
  close month and by rep — computed only from real deals. Weighted = amount × the workspace's
  stage probability (owners/admins edit them; won 100%, lost 0%). The deal owner calls the
  category; managers/admins/owners override it with a required reason. The owner's call stays
  visible, and calls, overrides, clears and probability edits are all audited.
- **Deal timeline** in the deal dialog: stage changes, calls, comments and detected next steps in
  one stream (each jumps to the call moment), time-in-stage bars per stage (with revisits), deal
  age, and a stalled badge. A `stalled_in_stage` risk fires past a configurable threshold
  (default 30 days); cards show days in stage and contact count.
- **Signed webhooks** (Integrations, owners/admins): `call.analyzed` (on log, re-analyze and
  redaction — analysis numbers only, never transcript text or next-step quotes) and
  `deal.stage_changed`. `X-SaaSassin-Signature: t=..,v1=<HMAC-SHA256(secret, "t.body")>`.
  HTTPS on 443 only; private/internal hostnames and literal private IPs are refused when saving,
  and the host is resolved again at delivery so DNS pointing inside is refused. The secret is
  shown once; reads show a hint and the export says `[redacted]`. Pause, send test, delete, and a
  delivery log (latest 50) that records delivered/failed with the real reason.
- **Retention made visible**: admins see a banner when calls are past retention and a queue on
  Trackers & settings listing each due call, its due date and days overdue, plus calls due in the
  next 14 days. Delete one call or all due calls (confirmed); the server refuses calls that are
  not actually due. Still admin-triggered, never automatic; audited with scope and call ids.
- **Export** now also carries `contacts`, `webhooks` (secret `[redacted]`) and
  `webhookDeliveries`; deals include forecast calls/overrides and calls include speaker links.

Emulator command (port 8189, uncommitted `.emulator-revenue.json`):
`JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-23.jdk/Contents/Home PATH="$JAVA_HOME/bin:$PATH" pnpm exec firebase emulators:exec --config .emulator-revenue.json --only firestore --project demo-saasassin "pnpm exec vitest run --config vitest.emulator.config.mjs tests/revenue.emulator.spec.ts"`
→ **27 passed**. Unit tests: `tests/revenue.test.ts` + `tests/revenue-round2.test.ts`.
(`java` must be 21+ on PATH; setting JAVA_HOME alone still picked up Java 17 here.)

## What users can do now (round 1)

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
| Emulator proof of the full data layer | Done (round 2), 27 tests |
| Contacts, deal roles, speaker linking, per-contact talk time, single-threaded risk | Done (round 2) |
| Forecast (weighted, categories, overrides, by month / rep, editable probabilities) | Done (round 2) |
| Deal timeline + time in stage + stalled risk | Done (round 2) |
| Signed outbound webhooks + delivery log | Done (round 2); single attempt, no automatic retry |
| Retention-due queue with selective apply | Done (round 2); still admin-triggered |
| Scheduled (cron) retention, mentions/notifications, webhook retries | Not started |

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

- Round 2: contact role is **per deal** (stored on the contact as `dealRoles`); speaker links are
  stored on the call as an array plus a denormalized `linkedContactIds` for single-field
  `array-contains` queries — still no composite indexes.
- Round 2: forecast categories follow the common convention (best case includes commit; Omitted
  drops a deal from every total). Probabilities are workspace-wide per stage, not per deal.
- Round 2: webhook delivery is awaited inside the mutation with a 5 s timeout and never throws, so
  a dead endpoint slows the request but cannot break it; the log records the honest outcome.
- Round 2 code layout: `data.ts` (core), `pipeline-data.ts` (contacts, links, forecast, timeline),
  `webhook-data.ts` + `delivery.ts` (webhooks); pure logic in `contacts.ts`, `forecast.ts`,
  `timeline.ts`, `webhooks.ts`, `retention.ts`.

## Known gaps

- Not browser-tested signed in (no test accounts are created, per fleet rules). Round 2 panels
  were server-rendered with realistic data in a throwaway smoke test and the build passes; the
  data layer is proven on the emulator.
- Retention is applied by an admin action, not a scheduled job (by design for now).
- Webhooks: one attempt per event, no retry queue; DNS is checked before fetch, but fetch resolves
  again, so a fast DNS rebind between the two is not fully closed.
- Tracker edits apply to new calls; existing calls update when someone clicks Re-analyze.
- Forecast has no snapshots/history yet (week-over-week movement); overrides are in the audit log.
