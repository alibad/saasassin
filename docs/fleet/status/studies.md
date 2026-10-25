# SaaSassin Studies — status (2026-10-26)

Open-source replacement for Maze: unmoderated user research on data you own.

## What users can now do

| Who | Can now… |
|-----|----------|
| Researcher | Create a workspace, invite teammates by email as admin / researcher / viewer |
| Researcher | Build a study from blocks: welcome & consent, multiple choice (single/multi), opinion scale 1–5 or 1–10, open text, yes/no, website task (URL + success question + time on task), closed card sort |
| Researcher | Add skip-to logic ("if answer is X, skip to block Y / end") and screener answers that end the study |
| Researcher | Publish (draft → live), close (live → closed), reopen (closed → live); publishing freezes an immutable version |
| Researcher | Set a participant cap and an automatic close date; the study closes itself when either is reached |
| Researcher | Duplicate a study (copies the published version's blocks into a new draft) to iterate after launch |
| Researcher | Preview the draft as a participant, including logic and screeners, with nothing recorded |
| Participant | Open `/apps/studies/p/{tenantId}/{studyId}`, consent, answer blocks in order, follow logic, submit — anonymously, resumable within the tab |
| Researcher | See results per block: response counts, option distributions, scale distribution + average, yes/no split, open-text list, website-task success rate + average/median time, card-sort agreement matrix, completion/drop-off funnel with average time per block |
| Researcher | Download responses as versioned JSON (`net.saasassin.studies.responses@1.0.0`) and any block as CSV |
| Owner/admin | Turn on a revocable read-only results link (`/apps/studies/r/{tenantId}/{studyId}/{token}`) |
| Any member | View the audit log; download the complete workspace export (studies, versions, responses, members, audit) |

## Modules

| Module | State |
|--------|-------|
| Study builder, blocks, versions, logic, screeners | Done |
| Participant flow + server validation | Done |
| Results / analysis (funnel, distributions, card-sort matrix, time on task) | Done |
| Exports (study JSON, block CSV, workspace bundle) | Done |
| Members, roles, audit log | Done |
| Duplicate, cap/close-at, shared read-only results | Done |
| Prototype click paths / heatmaps, recordings | Not started (needs a prototype embed adapter) |
| Session quality flags / exclusions with reasons, findings & evidence links | Not started |
| Maze import, webhooks, participant-provider adapters | Not started |
| Tree testing, open card sort | Not started |

## Key decisions

- **The server recomputes the participant path.** The browser sends answers only; `checkSubmission` walks the frozen version, validates each answer against its block schema, applies logic/screeners and drops answers to blocks that were never on the path. Clients cannot fabricate a path or answer unpublished questions.
- **Sessions start on the first "Start/Next"** and save progress after every block, so the funnel shows real drop-off. Each session gets a random token (only its SHA-256 is stored); a session can be finalized once.
- **No PII.** Responses store answers, path, per-block timings and timestamps only — no name, email, IP or user agent.
- **Versions are immutable.** Blocks lock once published; title, cap and close date stay editable. Results show the current version; responses to older versions stay in the export.
- **Effective status** (`effectiveStatus`) closes a live study at the cap or close date without a background job; both the start and final-submit routes enforce it.
- **No composite indexes:** every query is a single `where(studyId)` or single `orderBy(updatedAt)` on a tenant-scoped collection.
- **Card sort uses a Select per card** (not drag-and-drop) so it works with keyboard, screen readers and on a 390px phone.

## Verification (2026-10-26)

| Check | Result |
|-------|--------|
| `tests/studies.test.ts` — state machine, block schemas, answer validation, path/skip/screener, aggregation, funnel, card-sort agreement, CSV/JSON export | 11 tests pass |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | pass |
| Signed-out: `/apps/studies` 200, sign-in 200, unknown participant/results links 404, API 401 | pass |
| Full golden workflow against **local Firestore + Auth emulators** (no production data or accounts touched): create workspace → build → publish → participant consent + all 7 block types in the browser → results with real stored responses → CSV/JSON export → duplicate → share → close | pass |
| Server rules: empty study can't publish; live study can't re-publish; blocks frozen after launch; screen-out; duplicate submit 409; wrong session token 403; invalid answer 422; cap closes the study (410); closed study rejects new sessions; draft study link 404; other tenant 404; tokenHash never exported | pass |
| 390px mobile layout for workspace and participant flow | pass |

## Known gaps

- Website tasks open the site in a new tab; time on task is "opened → answered", not instrumented clicks.
- Rate limiting on the public participant routes relies on platform defaults; no per-IP throttle yet.
- Member invite requires the invitee to already have a SaaSassin account (shared platform behaviour).
