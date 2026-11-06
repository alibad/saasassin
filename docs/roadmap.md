# SaaSassin delivery roadmap

## Phase 0 — Foundation, complete

- Publish the catalog, scoring model, mission pages, and clean-room standards. **Complete**
- Connect Firestore and seed the researched portfolio. **Complete**
- Ship qualified-interest capture and private operations. **Complete**

## Mission 01 — Lattice Performance, active

Build an open-source performance system for organizations with 25–250 employees.

### Vertical slice 1 — trusted review spine

- Firebase Authentication with HTTP-only application sessions.
- Strict organization isolation in the data model, server authorization, and Firestore rules.
- Teams, reporting lines, employee directory, permission simulator, and immutable audit events.
- Previewed CSV import and safe employee/manager role mapping.
- Review templates, reversible review-cycle transitions, autosaved drafts, submissions, and audit inspection.

Exit condition: a user can create an organization, import employees, launch a cycle,
submit a review, and inspect the audit record against live Firebase persistence.

### Vertical slice 2 — complete review operations, complete October 26, 2026

- Peer nomination plus self, manager, peer, and upward assignments.
- Scheduled cycles, reminders, deadlines, calibration, packets, and acknowledgement.
- Goals, feedback, evidence capture, 1:1 agendas and notes, and the unified employee timeline.

### Vertical slice 3 — portability and extensibility, mostly complete October 26, 2026

- Composable analytics and report building.
- Complete workspace export using an open, versioned schema.
- API, webhooks, integration health history, and inspectable field mapping.
- Optional AI summaries whose individual claims link to source evidence. **Not started**

Shipped: saved report views, complete versioned export, read-only REST API with
hashed scoped keys, and HMAC-signed webhooks with delivery logs. Still owed:
integration health history, field mappings and webhook retries.

Exit condition: one 25–250 employee design partner completes and exports a live cycle.

## Fleet — ten working products, October 26, 2026

The owner lifted the evidence and upstream gates, and all ten products were built in
parallel on a shared fleet platform: product-specific sessions, tenant workspaces,
roles, append-only audit, server-only Firestore data, and a versioned export.

| Product | Golden workflow live | Emulator-proven |
| --- | --- | --- |
| Performance | Review cycles through acknowledgement, growth, reports, API, webhooks | Yes |
| Research | Interviews → transcript correction → highlights → evidence-linked insights → search → export | Yes |
| Planner | Tasks → deterministic auto-schedule with explanations → plan versions → ICS | Yes |
| Creator | Courses → publish → public page → enroll → progress, quizzes, drip, certificates | Yes |
| Feedback | Public boards, votes, merges, roadmap, changelog, Fider and Canny mappings | Yes |
| Studies | Study builder → anonymous participant link → results and funnels | Yes |
| Revenue | Deals → consented call transcripts → analysis, trackers, risk signals, scorecards | Yes |
| Community | Spaces, invite links, posts, events, moderation, plans, courses | Yes |
| Mail | .eml/.mbox import → keyboard triage, splits, snooze, drafts, search | Yes |
| Trust | Controls, evidence, policies, risks, vendors, auditor access, trust center | Yes |

Capabilities, verification and gaps per product: `docs/fleet/status/<product>.md`.
What each product still owes before customer launch: `docs/fleet/architecture.md` §9.

### Canny to Fider

Feedback ships natively with Fider-compatible data and a Fider-shaped export. The
upstream proposal remains public; record Fider maintainer direction before moving
the contribution upstream.
