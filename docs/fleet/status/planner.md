# SaaSassin Planner — build status

*Round 2 · 2026-11-06 · branch `worktree-agent-ab52152deb98055c1`*

## Signed-in product (2026-11-13)

- **Shell in Planner's own brand** (`planner-app.tsx`): sidebar with the mark, `WorkspaceSwitcher`,
  Calendar / Tasks / Projects / Insights and a Workspace group (Calendars, Team, Working hours,
  Webhooks, History); `AccountMenu` with the person's photo; `?view=` and `?workspace=` in the URL.
- **Calendar first** (`calendar-view.tsx`): week/day time grid of the current plan (blocks coloured
  by project, meetings hatched, now line), "my calendar" by default with a face-per-person filter,
  plan card (Replan, What if…), one-line quick add, Needs attention, Up next.
- **Team** is the shared `TeamPanel`; capacity and focus hours sit under it with faces. The old
  `members` route stays for compatibility. `readMembers` now joins each member's Planner profile
  (name, title, photo) server-side.
- **Demo data:** `scripts/seed-demo-planner.mjs` (fictional "Lumen Labs", emulators only).

Open-source Motion replacement. One-line takeaway: **the planning core now runs against a real
Firestore end to end**, and round 2 added repeating tasks, .ics calendar import, focus hours,
planning insights and signed webhooks — each with UI, API, server authorization, audit, export
and emulator coverage.

## Proof against Firestore (round 2, step 1)

```
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-23.jdk/Contents/Home PATH="$JAVA_HOME/bin:$PATH" \
pnpm exec firebase emulators:exec --config .emulator-planner.json --only firestore --project demo-saasassin \
  "pnpm exec vitest run --config vitest.emulator.config.mjs tests/planner.emulator.spec.ts"
```

`.emulator-planner.json` (uncommitted) uses Firestore port 8186, hub 8286, logging 8386.
**Result: 19/19 tests pass** (`tests/planner.emulator.spec.ts`). The spec throws at load unless
`FIRESTORE_EMULATOR_HOST` is set. Note: `PATH` must also point at JDK 21+, not only `JAVA_HOME`.

The spec drives the same functions the routes call (`src/lib/planner/service.ts`,
`src/lib/planner/webhook-delivery.ts`) with owner / member / viewer / outsider / rival-tenant users:

| Golden-path step | Proven |
|------------------|--------|
| Workspace settings | admin-only (member/viewer 403, outsider/rival 404), invalid hours rejected, read back |
| Projects → tasks with dependencies | persisted and read back; viewer 403; a dependency on another tenant's task id → 400 |
| Scheduler run → immutable plan version | v1 saved with fingerprint; dependency order honoured; same inputs → same hash |
| Mark done / reopen / push | `completedAt` set and cleared; push counted; another tenant's task id → 404 |
| Locks on re-run | locked block stays exactly at its time in v2; nothing overlaps it |
| What-if preview | returns a diff; **no plan and no audit event written** |
| Restore an earlier version | v3 = v1's blocks and fingerprint; v1 untouched; history 3, 2, 1 |
| Team capacity / assignment | admin-only; assigned work planned in that person's lane |
| Tenant isolation | rival cannot load, export or fetch ICS; nothing of theirs leaks into the export |
| Audit | every mutation action present (19 action types checked) |
| Export | every collection's record count matches Firestore; webhook secrets redacted |
| ICS | one VEVENT per block, `SEQUENCE` = plan version |

**Real bug fixed by the spec work:** tasks could store `dependsOn` ids that do not exist in the
workspace (including another tenant's task ids); these are now rejected with 400. Logic that
lived in route handlers moved into `service.ts`, so routes are thin wrappers.

## What users can do now

| Area | Works end-to-end | Where |
|------|------------------|-------|
| Everything from round 1 (workspaces, hours, projects, tasks, quick capture, meetings, scheduler, why-here, locks, what-if, team, history/restore, JSON + ICS export) | Yes | all tabs |
| **Repeating tasks** — daily / every weekday / weekly on chosen days / monthly on day N, every N, ending on a date or after N times | Yes | Task form → Repeat |
| Each occurrence planned on its own day, due by that day's end; mark one occurrence done (with optional actual time) and the series keeps going | Yes | Schedule → block → "Mark this occurrence done" |
| **Import an .ics file** (Google / Outlook / Apple export) as busy time for everyone or one person; re-import updates instead of duplicating | Yes | Meetings → Import |
| **Focus hours** — tasks are Deep or Shallow; workspace default and per-person preferred hours; scheduler prefers them and explains when it can't | Yes | Hours tab, Team → Focus hours, Task form |
| People can set their own focus hours; admins anyone's | Yes | Team |
| **Insights** — planned vs completed hours per week, deadline hit rate, most-pushed tasks, estimate accuracy and biggest misses | Yes (real data only) | Insights tab |
| Record actual time when marking work done | Yes | Done checkbox / Mark done dialog |
| **Signed webhooks** on `plan.applied` and `task.at_risk`, test send, delivery log | Yes (admins) | Webhooks tab |
| Live Google / Microsoft calendar sync | Honest "connection not configured" | Meetings |

## Round 2 modules

| Module | Pure logic + unit tests | Server (auth → zod → write → audit) | UI | Export | Emulator |
|--------|------------------------|-------------------------------------|----|--------|----------|
| Recurring tasks | `recurrence.ts`, scheduler expansion — `tests/planner-recurrence.test.ts` (10) | `POST tasks/{id}/occurrences` (editors) | Repeat fields, series status, occurrence done | `tasks[].recurrence/occurrences` | yes |
| .ics import | `ics-import.ts` — `tests/planner-ics-import.test.ts` (9): unfolding, UTC/TZID/floating/all-day, Windows zone names, DURATION, RRULE FREQ/INTERVAL/BYDAY (incl. 2TU, -1FR)/BYMONTHDAY/COUNT/UNTIL, EXDATE, RECURRENCE-ID, DST, caps | `POST events/import` (editors) | Import card + summary + "imported" badge | `events`, `icsImports` | yes (idempotency, per-person scope, denials) |
| Focus windows | scheduler soft preference — `tests/planner-focus.test.ts` (6) + property test now randomizes windows and task types | `PUT members/{uid}/focus` (self or admin), settings `focus` | Hours + Team dialog + task "Kind of work" | `settings`, `capacity` | yes |
| Planning analytics | `analytics.ts` — `tests/planner-analytics.test.ts` (5) | `GET analytics` (any member), `POST tasks/{id}/push` (counts pushes), `actualMinutes` on done | Insights tab, mark-done dialog | `tasks[].actualMinutes/pushCount`, plans | yes |
| Webhooks | `webhooks.ts` — `tests/planner-webhooks.test.ts` (4): sign/verify, URL guard, private IPs, classification | `webhooks` CRUD + test (admins); dispatch on run/restore | Webhooks tab: create (secret once), test, delete dialog, delivery log | `webhooks` (secret `[redacted]`), `webhookDeliveries` | yes (signature verified, DNS-to-private refused, 500 logged as failed) |

Engine version is now `planner-scheduler/1.1.0` (fingerprints from older plans differ by design).

## Key decisions

- **Occurrences are dates, not documents.** A series expands deterministically inside the pure
  scheduler (`<taskId>@YYYY-MM-DD`); completions live in a map on the series. Counts are measured
  from the series start, so "10 times" means the same ten dates on every run.
- **Occurrences on non-working days are skipped with a warning**, not silently made late.
  Repeating tasks have no single deadline, lock or prerequisites, and other tasks cannot wait on one.
- **.ics import is scoped by (who is busy, UID).** The same meeting imported into two people's
  calendars stays two busy blocks; re-importing a UID replaces exactly that UID's instances in that
  scope, unchanged ones are not rewritten. Window: now − 1 day to now + 60 days.
- **Focus hours never cost a deadline.** A placement inside preferred hours is kept only if it
  still finishes by the task's effective due time; otherwise the earliest placement is used and
  the block says so. Untyped tasks count as deep work.
- **"Planned" per week = what each plan version scheduled while it was the current plan**, so
  replans do not double count. "Completed" uses recorded actual time, else the estimate.
- **Webhooks are delivered inline with a 5 s timeout**, never retried automatically, never follow
  redirects; only 2xx counts as delivered. The host is checked before and after DNS resolution.

## Gaps / not built

| Gap | Note |
|-----|------|
| Google / Microsoft live calendar sync, calendar write-back | needs OAuth apps (credentials) — honest "not configured" |
| Webhook DNS rebinding between the check and the connection | the resolved IP is checked but fetch resolves again; pinning the IP needs a custom agent |
| Webhook retries / backoff | failures are logged honestly; admins can "Test" to re-send |
| Recurring task "skip this occurrence", time-of-day for occurrences | occurrences are placed anywhere in their day |
| .ics: BYSETPOS, BYWEEKNO, BYYEARDAY, VTIMEZONE bodies with non-IANA names beyond the built-in Windows map | warned and ignored; unknown zones fall back to the workspace zone with a warning |
| Visual QA at 390px of the new tabs | built with the existing responsive classes, not screenshotted this round |
| Reminders / notifications, BYO-AI intent parsing, public API | not started |
