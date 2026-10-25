# SaaSassin Planner — build status

*2026-10-26 · branch `worktree-agent-a94e1afaf4c76b268`*

Open-source Motion replacement. One-line takeaway: **the local planning core is a
working product** — a signed-in user can go from an empty workspace to an
explained, versioned, exportable week plan, and replan safely.

## What users can do now

| Step | Works end-to-end | Where |
|------|------------------|-------|
| Sign up / sign in (Google or email) and sign out | Yes (shared fleet session) | `/apps/planner/sign-in`, header |
| Create a workspace, switch between workspaces | Yes | header picker / "New workspace" |
| Set time zone (IANA, DST-aware), working days, hours, horizon, min/max focus block | Yes (owner/admin) | **Hours** tab |
| Create projects; see progress (minutes done / total), forecast finish, at-risk count | Yes | **Projects** tab |
| Capture tasks: title, estimate, priority, deadline, earliest start, dependencies, project, assignee, notes | Yes | **Tasks** tab |
| Add fixed meetings as busy blocks (everyone, or one person) | Yes (manual) | **Meetings** tab |
| Run the auto-scheduler → new immutable plan version with input fingerprint | Yes | **Run scheduler** |
| Day / week time-blocked agenda, responsive to 390px | Yes | **Schedule** tab |
| "Why here?" on every block — queue rank, deadline/priority reason, constraint, chunking, capacity, lateness | Yes | click any block |
| See every task that cannot meet its deadline / does not fit / is blocked, with the reason | Yes | Schedule alert + task status column |
| Mark done, reopen, push to next working day, edit, delete (dialog confirm), then re-run | Yes | Tasks tab / block dialog |
| Lock a block in place — locks always win on every re-run; unlock later | Yes | block dialog |
| What-if preview: diff vs current plan (moved / added / dropped / newly at risk), optional hypothetical busy block, then apply | Yes (preview never writes) | **What-if preview** |
| Team: invite by email with admin/member/viewer role, per-person daily capacity, assignment lanes, planned minutes per person | Yes | **Team** tab |
| Plan history (versions, who, stats, fingerprint) and append-only audit log | Yes | **Activity** tab |
| Export the whole workspace as versioned JSON (`net.saasassin.workspace-export` manifest + per-file schemas) | Yes | **Export JSON** |
| Export any plan version as ICS (RFC 5545, stable UIDs, SEQUENCE = plan version) | Yes | **ICS** buttons |

## Scheduler (`src/lib/planner/scheduler.ts`)

Pure, deterministic TypeScript — no clock, I/O or randomness; `now` is an input.

- Free time = working windows in the workspace time zone (DST handled via Intl) − busy blocks − before `now` (rounded up to 15 min).
- Effective due = earlier of hard deadline and priority target (urgent 1, high 3, medium 7, low 14 working days); dependents' due times propagate back to prerequisites.
- List scheduling: the ready task with the earliest effective due goes next (ties: priority, earliest start, title, id).
- Chunks between min and max focus block; no slivers; per-person daily capacity; separate lanes per assignee.
- Flags: `late` (with free-minutes-before-deadline math), `unscheduled` (no partial blocks left behind), `blocked` (cycle or unschedulable prerequisite).
- Manual locks are placed first and never moved.
- 23 vitest cases in `tests/planner-scheduler.test.ts` (deadline met, overflow flagged, ordering, chunking, working-hour and weekend boundaries, busy blocks, slivers, earliest start, DST, dependencies, cycles, deleted deps, locks, capacity, determinism, diff) + 4 in `tests/planner-ics.test.ts`.

## Data and security

- `products/planner/tenants/{id}/{settings,projects,tasks,events,capacity,plans,auditEvents}`, server-side only.
- Every route: `requireFleetUser` → `requireTenantMember` (role-gated writes) → zod → write → `appendAuditEvent`.
- Roles: owner/admin (settings, invites, capacity), member (plan work), viewer (read + export).
- No composite indexes: single `orderBy` or single `where` per query.

## Remaining (not built tonight)

| Module | State | Why |
|--------|-------|-----|
| Google / Microsoft calendar OAuth, sync, webhooks, calendar write preview | Honest "connection not configured" state; meetings are manual | needs new OAuth apps/credentials (out of scope) |
| Recurring tasks, energy/focus windows, buffers | Not started | next most valuable after calendar sync |
| Undo of a plan (restore an older version as current) | History is immutable and exported; no one-click restore yet | — |
| Reminders/notifications, planning analytics, BYO-AI intent parsing, public API/webhooks | Not started | — |
| Firestore rules tests for planner paths | Not added (rules files are lead-owned; products/** is server-only) | — |

## Key decisions

- **Priority as a soft deadline.** Mixing priority and deadlines through one "effective due" keeps the order explainable in one sentence per block.
- **All-or-nothing placement.** A task that cannot fully fit leaves no partial blocks, so the freed time goes to work that can finish.
- **Plans are immutable versions** with an input fingerprint (FNV-1a over canonical input) — same inputs, same plan, provably.
- **Times are entered and shown in the workspace time zone**, not the browser's, so a team sees one consistent plan.
