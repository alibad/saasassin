# Prompt for Claude — fully build SaaSassin Performance

Continue building SaaSassin Performance in the existing repository:

`/Users/alibadereddin/Code/GitHub/saasassin`

Do not restart product strategy and do not replace the existing implementation.
First inspect `AGENTS.md`, `CLAUDE.md`, git status and recent history,
`docs/fleet/architecture.md`, `src/lib/fleet/apps.ts`, the Lattice research page,
the existing `/lattice` routes and APIs, Firebase configuration, Firestore rules,
and tests. Then continue implementation immediately.

The product is SaaSassin Performance at `performance.saasassin.net`. Lattice is a
migration target, not the product name or visual identity. Keep the accepted
SaaSassin mark and Performance lockup. Keep Logo Lab hidden.

The existing vertical slice already has Firebase email/password and Google auth,
host-only sessions, tenant isolation, organizations, employee CSV import, review
templates, reversible review-cycle transitions, review submission, role simulation,
and immutable audit history. Preserve and harden it. Do not replace real data with
mocks.

Complete the remaining product for organizations with 25–250 employees:

- workspaces, teams, reporting lines, directory, invitations, and employee lifecycle;
- fine-grained roles, permission simulator, view-as-role, and access diagnostics;
- self, manager, peer, and upward reviews with peer nomination;
- manual and scheduled cycles, reminders, deadlines, escalation, and autosaved drafts;
- previewable, adjacent, reversible cycle transitions with incomplete-work blockers;
- goals and OKRs, feedback, evidence, one-to-one agendas and notes;
- unified employee evidence timeline with granular visibility;
- calibration, review packets, release, acknowledgement, and reopening;
- analytics and composable reporting with saved views and reliable filters;
- a complete workspace export using an open, versioned schema;
- API keys, API, signed webhooks, retries, delivery logs, field mappings, and integration health history;
- optional AI summaries only when every claim links to exact source evidence and unsupported claims are testable.

Intentionally exclude payroll, benefits, recruiting, time and attendance, full
HRIS functionality, engagement surveys, compensation benchmarking, succession
planning, native mobile apps, and a large integration marketplace.

Work vertically in this order:

1. Finish assignment generation, peer nominations, scheduling, reminders, and deadlines.
2. Ship calibration, review packets, release, acknowledgement, and safe reopen.
3. Add goals, feedback, evidence, one-to-ones, and the employee timeline.
4. Add reporting, complete export, API/webhooks, mappings, and integration health.
5. Add evidence-linked AI only after deterministic evaluation and opt-in controls exist.

For every slice, implement usable shadcn/ui screens, Firebase persistence, server
authorization, Firestore rules, immutable audit events, empty/error/recovery states,
and tests. Extend cross-tenant and role-access rule tests. Test every state transition
and versioned export contract. Never rely on proxy routing for authorization.

Use the installed Next.js 16 documentation before framework changes. Use proper
shadcn/ui components—no crude native selects or placeholder links. Keep sensitive
employee content out of analytics and logs.

Before finishing, run lint, typecheck, unit tests, Firestore rule tests, and a
production build. Verify the complete golden path in a real browser at desktop and
mobile sizes. Deploy the verified result to the existing Vercel project and
`performance.saasassin.net`, then smoke-test sign-up, sign-in, tenant isolation,
the full review cycle, audit, export, and browser/server errors.

Update the roadmap, product status, docs, and dated `todo` changelog as behavior
changes. Do not create GitHub Actions. Do not commit or push without asking first.
Continue until the full boundary above is working, verified, and deployed, or until
a concrete external blocker is proven.
