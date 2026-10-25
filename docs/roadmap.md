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

### Vertical slice 2 — complete review operations

- Peer nomination plus self, manager, peer, and upward assignments.
- Scheduled cycles, reminders, deadlines, calibration, packets, and acknowledgement.
- Goals, feedback, evidence capture, 1:1 agendas and notes, and the unified employee timeline.

### Vertical slice 3 — portability and extensibility

- Composable analytics and report building.
- Complete workspace export using an open, versioned schema.
- API, webhooks, integration health history, and inspectable field mapping.
- Optional AI summaries whose individual claims link to source evidence.

Exit condition: one 25–250 employee design partner completes and exports a live cycle.

## Background — Canny to Fider, waiting

- The proposal remains public and upstream-first.
- No feature implementation proceeds while Fider maintainer input is pending.
- Resume only through an accepted contribution path with a representative export.

## Later portfolio

- Motion → Open Planner follows after Mission 01 meets its evidence gate.
- Dovetail → Open Research Repository remains the sensitive-data flagship candidate.

## Fleet foundations — routed, not activated

All ten researched targets now have capability-named product foundations and
canonical subdomains. A foundation includes an independent product identity, domain
model, golden workflow, invariants, exclusions, and a vertical delivery sequence.
It does not imply the portfolio mission is active or the backend is complete.

- Performance is the only active product build.
- Feedback remains blocked on Fider maintainer direction.
- Research and Planner retain their named activation gates above.
- Creator, Studies, Revenue, Community, Mail, and Trust require the upstream or
  component decisions recorded in `docs/fleet/architecture.md` before feature work.
