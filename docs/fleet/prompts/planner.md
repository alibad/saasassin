# Prompt for Claude — fully build SaaSassin Planner

Build SaaSassin Planner in `/Users/alibadereddin/Code/GitHub/saasassin`.

Do not restart strategy. Inspect `AGENTS.md`, `CLAUDE.md`, git status/history,
`docs/fleet/architecture.md`, the Planner registry entry, Motion target research,
current Firebase/Vercel configuration, and installed Next.js 16 docs. Confirm the
Performance evidence gate has been met; once open, implement immediately.

The product is SaaSassin Planner at `planner.saasassin.net`; Motion is the migration
target. Use the accepted SaaSassin mark and Planner wordmark.

Build a deterministic, explainable work planner. The golden workflow must let a
user sign up with Google or email, create a workspace, connect a calendar, capture
and estimate tasks, set working/focus constraints, generate a realistic day, inspect
the reason for every placement, preview a calendar write, and safely replan after a
new conflict without moving locked or completed work.

Complete boundary:

- inbox, tasks, projects, assignments, dependencies, estimates, priorities, recurring work;
- Google and Microsoft calendar OAuth, calendars, events, incremental sync, webhooks, and health history;
- working hours, time zones, deadlines, buffers, focus windows, energy preferences, and hard/soft constraints;
- a deterministic scheduling engine with fixtures, property tests, plan versions, and stable explanations;
- conflict detection, previewable tradeoffs, locks, undo, reversible replanning, and plan history;
- shared projects, workload visibility, granular roles, and least-privilege calendar access;
- reminders, notifications, daily/weekly planning, completion, and planning analytics;
- migration/import for tasks and calendar settings plus an open versioned export;
- API and signed webhooks;
- optional bring-your-own AI for intent parsing only—AI may suggest constraints but cannot silently schedule or override them.

Exclude email-client functionality, chat, full enterprise portfolio management,
employee surveillance, and autonomous external communication.

Work vertically: local planning core → Google calendar reliability → Microsoft
adapter → conflict/replan UX → shared team planning → import/export/API. Keep the
scheduler pure and separate from provider side effects. Calendar writes require a
human-readable preview and idempotency key. Manual locks always win.

Use Firebase Authentication with Google/email, host-only sessions, product and
tenant scoped persistence, fine-grained roles, immutable audit events, and
deny-by-default Firestore rules. Add cross-product/tenant/role tests, calendar token
protection tests, sync replay tests, scheduler unit/property tests, and time-zone/
DST fixtures. Use shadcn/ui, not native selects or fake dashboards.

Run lint, typecheck, tests, rules tests, and production build. Verify the full
workflow in a real browser at desktop/mobile sizes and test disconnect/reconnect,
expired tokens, duplicate events, DST, offline/retry behavior, undo, and explanations.
Deploy to the existing Vercel project and `planner.saasassin.net`, then production
smoke-test. Update docs, roadmap, registry status, and dated `todo` notes.

Do not create GitHub Actions. Do not commit or push without asking first. Continue
until the vertical product is working, verified, deployed, and cohort-ready.
