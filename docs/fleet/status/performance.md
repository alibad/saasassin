# SaaSassin Performance — status

Updated: 2026-10-26 (fleet build night)

Performance moved from a vertical slice (templates, cycles, self/manager reviews)
to the full review program plus continuous performance. All four "Now" stages from
`docs/fleet/architecture.md` §9 have a working end-to-end slice. Stage 5 (AI) was
not started.

Round 2 (same night) added five more slices:
- imported-employee identity linking;
- anonymity thresholds;
- scheduled cycle phases;
- saved report views;
- API keys, a read-only REST API, and signed webhooks.

## What users can do now

| Stage | Capability | Who |
| --- | --- | --- |
| 1 | Launching a cycle generates **self, manager, upward, and peer** reviews. Peers come from approved nominations, or from teammates (max 3) when nomination is off | Review admins |
| 1 | **Peer nomination**: employees nominate up to 5 peers (pending). Managers and admins nominate with auto-approval and approve or decline. Writing cannot open while any nomination is pending | Employees, managers |
| 1 | **Deadlines**: edit the cycle deadline. Per-reviewer status shows on track, due soon, or overdue | Review admins |
| 1 | **Reminders + escalation**: one reminder goes to each outstanding reviewer, and overdue reviewers are escalated to their manager. These land in a new in-app **Inbox** on Overview | Review admins → everyone |
| 2 | **Calibration**: each employee gets a review signal (averages by direction from rating questions), a calibrated 1–5 rating, and a private note | `reviews.calibrate` |
| 2 | **Review packets** are assembled on release. Self and manager reviews are attributed. Peer and upward reviews are anonymized ("Peer 1", "Direct report 1"). Calibration notes are never included | Automatic |
| 2 | **Acknowledgement** with an optional comment. **Safe reopen** of one packet requires a reason, and the prior acknowledgement is kept in packet history. Reopening the whole phase withdraws packets without losing reviews | Employee, calibrators |
| 3 | **Goals**: you or your manager create a goal (visible to everyone, or to owner and manager only). Owner or manager can check in with progress, status, and a note | Everyone |
| 3 | **Feedback**: praise or constructive, visible to the recipient only, recipient and manager, or everyone. The text never enters the audit log | Everyone |
| 3 | **One-to-ones** between an employee and their manager: shared agenda (add or tick), shared notes, complete | Participants only |
| 3 | **Employee timeline**: newest first, covering goals, check-ins, feedback, submitted reviews, packet release, acknowledgement, and 1:1s. It only shows what the viewer may see | Everyone |
| 4 | **Reports** filtered by cycle and team: completion by direction and team, packet acknowledgement %, goal health, feedback counts, calibrated-rating distribution | `reports.read` |
| 4 | **Complete workspace export**: one JSON download using the `net.saasassin.workspace-export` 1.0.0 manifest. It has 14 product files, each with its own schema id, version, record count, and sha256, plus migration notes. The export is audited | `workspace.export` |

| R2 | **Imported employees can sign in and act as themselves.** On a verified-email sign-in (or the next page load), each pending invite for that email is claimed. The directory record gets `authUid`, and `memberLinks/{uid}` maps the uid to the imported member id. Reviews, goals and packets keep their existing ids | Everyone |
| R2 | **Anonymity thresholds**: each cycle sets a minimum number of peer and upward responses (default 3). Below the minimum, those responses are withheld entirely, and the packet explains how many came in and how many are needed | Review admins |
| R2 | **Scheduled cycles**: set a launch date and end dates for nomination, writing (the deadline), calibration and acknowledgement. Overdue phases are detected each time the page loads ("Phase overdue Nd"). **Advance due phases** moves every due cycle one phase through the normal previewed, audited transition. Blocked cycles are reported, never forced | Review admins |
| R2 | **Saved report views**: save the current cycle and team filters, either private or shared with report viewers. Owners and admins can delete a view | `reports.read` |
| R2 | **API keys**: scoped (`directory:read`, `cycles:read`, `goals:read`), stored only as SHA-256 hashes, shown once, revocable, and audited, with a last-used time | `organization.manage` |
| R2 | **Read-only REST API**: `GET /api/lattice/v1/organizations/{org}/members\|cycles\|goals` with `Authorization: Bearer sk_perf.…`. Cycles return counts only, goals return public goals only, and review content is never included | API key |
| R2 | **Signed webhooks** for `review_cycle.transitioned`, `review_packet.acknowledged`, and a test event. Each request carries HMAC-SHA256 in `X-SaaSassin-Signature: t=…,v1=…`, computed over `t.body`. Only public HTTPS endpoints are allowed (SSRF guard), with a 5s timeout. Every attempt is logged with HTTP status, error and duration, and failures are shown as failures | `organization.manage` |

New UI tabs: **Growth**, **Timeline**, **Reports** (plus the **API and webhooks** panel for workspace managers). Reviews tab gains the
nominations, deadlines, calibration and packets panel; Overview gains Inbox and
My review packets. All controls are shadcn/ui (Select, Dialog, Checkbox, Table).
There is no native select, `confirm()`, or `alert()`.

## Key decisions

- **New permissions** are `reviews.calibrate`, `reports.read`, and `workspace.export`. Built-in roles now always include their code-defined grants (`effectiveRolePermissions`). Existing workspaces pick up the new capabilities with no data migration. Custom roles only ever hold what was stored.
- **Server-only writes.** Every program record (nominations, calibrations, packets, goals, feedback, 1:1s, notifications) is written through the Admin SDK after relationship-aware checks. Those checks are: is the actor the subject, the subject's manager, a participant, or a holder of a permission. Firestore rules deny all client writes to these collections and allow only narrow reads.
- **Assignment generation never overwrites.** Reopening and re-advancing a phase skips assignments that already exist, so drafts and submissions survive. Generation and packet writes are chunked (≤400 per batch) before a guarded state-flip transaction. This removes the old 500-write limit for orgs of about 250 people.
- **Sensitive content stays out of logs.** Audit summaries record facts such as "Gave praise feedback to Ana". They never record feedback text, review answers, or calibrated ratings.
- The pure logic lives in `src/lib/lattice/program.ts`, and the export contract lives in `src/lib/lattice/export.ts`. Both are fully unit-tested.
- **Identity linking without a migration.** Imported members keep their hashed ids because every review, goal and packet references them. CSV import writes an invite index at `latticeInvites/{sha256(email)}/organizations/{org}`, so linking needs no collection-group query or index. Linking runs only for a verified email and is refused if the record is already claimed by another uid. Rules resolve identity through `myMemberId()`, which reads the link document. **Records imported before this change have no invite: re-import the CSV once to backfill.** Email/password users must verify their email before they can link.
- **Withhold below the threshold; don't average.** Averaging one or two answers can still identify the author.
- **No cron.** Due phases are computed on read and advanced by an admin action that reuses the transition guard, so a schedule can never skip a blocker.
- **Webhooks are attempted once per event, with no automatic retries yet.** "Send test" acts as a manual retry. Signing secrets have to be readable by the server, so they are stored server-only and rules deny all client access to `apiKeys`, `webhooks` and `reportViews`.

## Verification

- Round 2 totals: `pnpm test` 57 pass, `pnpm test:rules` 17 pass, and the emulator suite 12 pass. The emulator suite covers linking, the scheduler, saved views, and the API key and webhook lifecycle (including a failed delivery logged honestly). `pnpm build` is green.
- Round 2 browser check against the local emulators, signed in as the owner:
  - "Advance due phases" reports a blocked cycle honestly (12 of 12 reviews incomplete).
  - The saved-view controls and the API and webhooks panel render.
  - The check found duplicate React keys for reviews that share an id across cycles (review ids are not cycle-scoped). Keys and field ids are now scoped by cycle.
- Round 1: `pnpm test`: 27 unit tests pass. The new `tests/lattice-program.test.ts` covers assignment generation, nomination validation, deadlines, reminder and escalation planning, rating summaries, packet anonymization, timeline, report filters, transition blockers and warnings, built-in permission union, and the export contract (envelope, determinism, tamper detection).
- `pnpm test:rules`: 10 pass, including 5 new program-record tests. These cover own-packet only, hidden calibration, manager-only goals, private feedback and 1:1s, no client writes even for owners, and cross-tenant denial.
- **Golden path against the Firestore emulator** (`tests/lattice-program.emulator.spec.ts`): 7 pass. It runs the real data layer through the whole sequence:
  - launch → nominate → blocked → approve → writing → reminders and escalations → submit all → calibrate → release → acknowledge → reopen → phase reopen and re-release (reviews intact) → close;
  - goals, feedback and 1:1s, with a visibility check per role;
  - export verification and the audit trail.

  Run it with:
  `pnpm exec firebase emulators:exec --only firestore "pnpm exec vitest run --config vitest.lattice.config.mjs"`
  It needs Java 21 or newer on PATH (`JAVA_HOME=$(/usr/libexec/java_home -v 21+)`).
- `pnpm typecheck` is clean once Next route types exist. On a fresh checkout there are 2 existing `PageProps` errors in `src/app/targets/[slug]/page.tsx` until `next build` or `next typegen` has run. `pnpm lint` is clean. `pnpm build` is green, and the new routes are listed.
- **Signed-in browser check against local emulators.** Firestore and Auth emulators ran with an emulator session cookie, and `next dev` pointed at them. Checked as the owner at desktop and 375px mobile widths:
  - Overview inbox and packets;
  - Reviews program panel (progress, nominations, packets with reopen), plus reopening a closed cycle through the preview dialog;
  - Growth (submitting feedback through the shadcn Select form);
  - Timeline and Reports, plus the export download (200, manifest 1.0.0, 14 files).

  No console errors and no horizontal overflow on mobile. Checked as employee Ana: packet shows "Peer 1", there is no Reports tab, and export returns 403. Unauthenticated API returns 401.
- Not done: a smoke test on production. The lead deploys.

## Deploy notes for the lead

- **`firestore.rules` changed again in round 2** (organizations namespace only):
  - member identity now resolves through `memberLinks/{uid}` (`myMemberId()`);
  - new read-own rule for `memberLinks`;
  - review, packet, goal, feedback, 1:1 and notification reads compare against the linked member id.

  Deploy with `firebase deploy --only firestore:rules`.
- **No composite indexes needed.** The new queries are single-field: notifications by recipient and read state, goals by visibility, webhooks by active, deliveries ordered by attempt time. `firestore.indexes.json` is unchanged.
- The top-level `latticeInvites` collection is server-only and covered by the global deny rule.
- No new dependencies, and no edits to the lockfile or `package.json`.

## What's left

- Webhook automatic retries with backoff, and a redeliver button per delivery. Integration health history and field mappings.
- Write scopes for the API, and per-key rate limiting.
- A scheduled trigger for "advance due phases". It is admin-run today by design; a Vercel cron could call it later. Email reminders.
- Saved views and API key or webhook records are not in the export yet. That would be an additive change, so the export version becomes 1.1.0.
- Evidence links from goals and feedback into review writing.
- Stage 5: evidence-linked AI summaries. Not started by design.
- A production smoke test after deploy: sign-up, imported-employee sign-in, the full cycle, and export.
