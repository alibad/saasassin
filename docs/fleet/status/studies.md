# SaaSassin Studies — status (2026-11-06, round 2)

Open-source replacement for Maze: unmoderated user research on data you own.

## What users can now do

| Who | Can now… |
|-----|----------|
| Researcher | Create a workspace, invite teammates by email as admin / researcher / viewer |
| Researcher | Build a study from blocks: welcome & consent, multiple choice (single/multi), opinion scale 1–5 or 1–10, open text, yes/no, website task, closed card sort, **tree test** |
| Researcher | Add skip-to logic and screener answers that end the study; preview the draft with nothing recorded |
| Researcher | Publish (freezes an immutable version), close, reopen; cap participants and set a close date; duplicate |
| Participant | Open `/apps/studies/p/{tenantId}/{studyId}`, consent and answer anonymously, resumable within the tab |
| Participant | **Navigate a text-only tree one task at a time** (open items, back up, "I'd find it here" or skip) |
| Researcher | See results per block, completion funnel, card-sort agreement matrix |
| Researcher | **See tree-test results per task: success rate, directness, median time, outcome split (direct/indirect success/failure, skip), first-click and chosen-destination distributions** |
| Researcher | **See every session with automatic quality flags and their reasons: speeders (study minimum, or a third of the median once 5 sessions completed), straight-lining (same rating on 3+ scales), empty or junk open text** |
| Researcher | **Exclude a session with a required reason, or keep a flagged one; both are audited. Results, block CSVs and the shared link leave excluded sessions out; a toggle shows everything** |
| Researcher | **View a session's raw answers and cite any answer straight into a finding** |
| Researcher | **Record findings with title, summary, severity, status and at least one piece of evidence (a specific session's answer or a whole block); the server resolves every citation and stores an excerpt; evidence from later-excluded sessions is called out** |
| Anyone with the share link | **Read findings with their evidence above the results** (no raw sessions on the link) |
| Researcher | **Import a Maze results CSV: preview exactly how each column maps (block type, timing, metadata, dropped), then import it as a closed, read-only study they can analyse, exclude, cite and export — or duplicate to re-run in Studies** |
| Owner/admin | **Add HTTPS webhook endpoints for `response.completed` and `study.closed` (manual close or cap reached); secret shown once; HMAC-SHA256 signed; enable/disable, send a test, delete; delivery log with honest failures** |
| Any member | View the audit log; download the study responses JSON (now with quality flags, decisions and findings), block CSVs, and the complete workspace export (now with findings, webhooks with secrets redacted, and delivery log) |

## Modules

| Module | State |
|--------|-------|
| Study builder, blocks, versions, logic, screeners | Done |
| Participant flow + server validation | Done |
| Results / analysis (funnel, distributions, card-sort matrix, time on task) | Done |
| Session quality flags + audited exclusions | **Done (round 2)** |
| Tree testing | **Done (round 2)** |
| Findings with evidence links | **Done (round 2)** |
| Maze import (results CSV) | **Done (round 2)** |
| Signed outbound webhooks | **Done (round 2)** |
| Exports (study JSON, block CSV, workspace bundle) | Done |
| Members, roles, audit log, duplicate, cap/close-at, shared results | Done |
| Prototype click paths / heatmaps, recordings | Not started (needs a prototype embed adapter) |
| Open card sort, participant-provider adapters, templates | Not started |

## Verification (2026-11-06)

| Check | Result |
|-------|--------|
| `tests/studies.emulator.spec.ts` against the Firestore emulator (port 8185) | **17 tests pass** |
| `tests/studies*.test.ts` unit tests (model, quality, tree, findings, Maze mapper, webhooks) | 35 tests pass; full suite 324 pass |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | pass |

Emulator command (needs a local `.emulator-studies.json`, never committed):

```
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-23.jdk/Contents/Home PATH="$JAVA_HOME/bin:$PATH" \
  pnpm exec firebase emulators:exec --config .emulator-studies.json --only firestore --project demo-saasassin \
  "pnpm exec vitest run --config vitest.emulator.config.mjs tests/studies.emulator.spec.ts"
```

The spec drives the same data-layer functions the route handlers call (export bundling moved out of the
route handlers into `src/lib/studies/data.ts` for this) and covers: role denials (viewer 403, outsider and
rival tenant 404) on every write; builder → publish → frozen version; anonymous submissions validated
against the frozen version (bad scale, unknown option, missing consent → 422; duplicate → 409; wrong
token / foreign session → 403); skip logic and screen-outs recomputed on the server; results aggregation;
cap, close date and manual close (410); draft and imported studies hidden from participants (404);
quality flags and exclusions through results, CSV, JSON and the share link; findings with evidence
validation (uncited/off-path 422, foreign session 404); Maze preview writes nothing, import is closed and
read-only (409 on edit/reopen); webhooks signed and verifiable, SSRF/HTTP refused, failing endpoints logged
as failed, secrets never in list or export; every researcher mutation audited; exports contain every record
and no session token hashes.

Round 1 had verified the golden path by hand only; the round 2 spec found no data-layer defects in it.

## Key decisions

- **The server recomputes the participant path** (unchanged) — and now also validates tree-test navigation: every opened item must exist and the chosen item must be the last one opened.
- **Quality flags are computed on read, decisions are stored.** Thresholds move as responses arrive, so storing flags would go stale; only the researcher's exclude/keep decision (with reason, who, when) is written. Nothing is auto-excluded.
- **Excluded ≠ deleted.** Excluded sessions stay in the JSON and workspace exports with `includedInResults: false`, their flags and the reason; CSVs omit them unless `all=1`.
- **Tree ids derive from the label path** (FNV-1a), so editing the outline keeps correct destinations wired to unchanged items. The tree is a flat list whose parents come first: no cycles, no nested arrays in Firestore.
- **Directness** = the participant went straight down from the top level without ever backing up; skips count as not direct.
- **Findings must cite evidence**, resolved server-side against frozen versions and stored responses, with an excerpt snapshot so a finding stays readable on the share link without exposing raw sessions.
- **Maze import is conservative.** Types are inferred from values (scales, yes/no, repeated values → choices, multi-select via `|`/`;`, 0–10 ratings kept as 11 choices, mission outcomes as choices, everything else open text). Emails, names, IPs, device and location columns are dropped and reported; click paths/misclicks are reported as not imported. Imported studies are closed, read-only and never reachable by participants.
- **Webhooks fire after the response** (`after()` in the route), never block or fail a participant's submission, are re-validated against the SSRF guard at send time, do not follow redirects, and time out at 5 s. `study.closed` fires on manual close and when a completion reaches the cap.
- **No composite indexes:** every query is a single `where` or single `orderBy`.

## Known gaps

- `study.closed` does not fire when a study closes by its **close date** (that closure is computed on read; there is no scheduler).
- Webhook deliveries are not retried automatically; use "Send test" or the log to diagnose. DNS rebinding is not defended beyond the hostname guard.
- Maze import maps the **results CSV** only (answers and mission outcomes); Maze click paths, heatmaps and screen recordings are not portable and are not imported.
- Tree tests are text-only (no visual design), one tree per block with up to 10 tasks and 300 items.
- Website tasks still measure "opened → answered", not instrumented clicks.
- Rate limiting on public participant routes relies on platform defaults.
- Member invite requires the invitee to already have a SaaSassin account (shared platform behaviour).
