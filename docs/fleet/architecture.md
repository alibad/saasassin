# SaaSassin product fleet architecture

Status: accepted implementation baseline, August 11, 2026

This document turns the researched target catalog into ten independently branded
products without pretending ten complete applications already exist. Performance
is the active, Firebase-backed build. The other product foundations establish a
route, identity, domain model, golden workflow, invariants, exclusions, and
vertical delivery contract. Feedback remains blocked on Fider maintainer direction.

## 1. Decision

Each replacement owns a capability-named subdomain. Incumbent trademarks remain
only in target, migration, and decision material.

| Product | Target | Canonical domain | Strategy | Current state |
| --- | --- | --- | --- | --- |
| SaaSassin Performance | Lattice | `performance.saasassin.net` | Build | Working vertical slice |
| SaaSassin Research | Dovetail | `research.saasassin.net` | Build | Foundation ready |
| SaaSassin Planner | Motion | `planner.saasassin.net` | Build | Foundation ready |
| SaaSassin Creator | Kajabi | `creator.saasassin.net` | Assemble | Foundation ready |
| SaaSassin Feedback | Canny / Fider | `feedback.saasassin.net` | Back | Waiting for upstream |
| SaaSassin Studies | Maze | `studies.saasassin.net` | Assemble | Foundation ready |
| SaaSassin Revenue | Gong | `revenue.saasassin.net` | Back | Foundation ready |
| SaaSassin Community | Circle | `community.saasassin.net` | Assemble | Foundation ready |
| SaaSassin Mail | Superhuman Mail | `mail.saasassin.net` | Back | Foundation ready |
| SaaSassin Trust | Vanta | `trust.saasassin.net` | Back | Foundation ready |

The public catalog and research remain at `saasassin.net`. Product pages use the
accepted SaaSassin mark plus a capability wordmark. They do not imitate incumbent
logos or product trade dress.

## 2. Why one project now

All ten foundations currently live in the existing `saasassin` Next.js and Vercel
project. This is an intentional incubation topology:

- one deploy makes routing and product boundaries visible immediately;
- shared design, Firebase initialization, auth primitives, accessibility, and
  observability do not diverge before product-market evidence exists;
- no empty repositories, Vercel projects, or secret copies are created merely to
  express portfolio intent;
- host routing keeps product URLs stable, so a product can move behind the same
  domain later without breaking customers.

This is not a commitment to a permanent monolith. Split an app into its own
repository and Vercel project when any two of these are true:

1. It has an active team or upstream maintainer cadence independent of SaaSassin.
2. It needs a materially different runtime, data store, compliance boundary, or
   deployment window.
3. Its dependency graph or production build meaningfully slows unrelated apps.
4. It needs separate release permissions, incident ownership, or billing.
5. A standalone open-source community is ready to own it.

Performance is allowed to split earlier if the design-partner review cycle makes
independent deployments safer. Feedback should normally live with upstream Fider,
not become a SaaSassin repository, if maintainers accept the contribution path.

## 3. Request routing

`src/proxy.ts` performs hostname routing before App Router rendering.

- `performance.saasassin.net/` rewrites to the existing `/lattice` workspace.
- `performance.saasassin.net/sign-in` rewrites to `/lattice/sign-in`.
- every other product root rewrites to `/apps/{product}`.
- legacy production routes such as `saasassin.net/lattice` and
  `saasassin.net/apps/research` redirect permanently to the capability domain.
- API, Next assets, metadata, and public files are excluded from host rewrites.
- localhost and Vercel previews keep the internal paths available for testing.

The routing resolver is pure and covered by unit tests. Authorization never lives
in the proxy; every server endpoint and Firestore rule must continue to enforce it.

## 4. Identity and sessions

Use Firebase Authentication from project `saasassin-net` for the incubation fleet.
Email/password and Google are the minimum sign-in methods for every product.

Rules:

- a Firebase user identity may be shared across products;
- an application session is host-only, HTTP-only, secure in production, and
  product-specific;
- signing into one subdomain must not silently authorize another product;
- each session resolves a product membership and a tenant membership before data
  is loaded;
- privileged role changes require recent authentication and an immutable audit
  event;
- all ten production subdomains must be registered as Firebase authorized domains;
- a custom auth domain can be added later, but it must not weaken the host boundary.

Performance already implements a host-only Firebase session. New products should
extract that pattern into a shared, product-aware auth package only after the
second real app needs it; avoid speculative abstraction before then.

## 5. Tenant and product isolation

Firebase Authentication is shared infrastructure, not an authorization model.
Every stored record belongs to both a product and a tenant.

Performance currently owns the root `organizations/{organizationId}` namespace.
That namespace is reserved for Performance while its active vertical slice is in
use. New products use a product namespace:

```text
products/{productSlug}
  tenants/{tenantId}
    memberships/{userId}
    roles/{roleId}
    auditEvents/{eventId}
    ...product collections
```

Required controls for every product:

- deny by default outside an explicitly matched product path;
- verify active membership before evaluating a role;
- never trust a tenant or role sent only by the browser;
- repeat authorization in Next.js server code even when Firestore rules exist;
- test user A cannot read or write tenant B;
- test user A cannot access the same tenant path under another product;
- test every privileged action against a role without that permission;
- make audit events append-only in both rules and server code;
- make import, sync, export, and AI jobs idempotent and tenant-scoped.

Do not migrate the working Performance namespace merely for aesthetic consistency.
Plan that migration only when it has rollback, dual-read verification, and a
measurable customer benefit.

## 6. Shared platform contracts

Share contracts and small primitives, not product state.

### Safe to share

- accepted SaaSassin mark, typography, base design tokens, and shadcn/ui components;
- Firebase client/admin initialization;
- product-aware session verification;
- tenant membership and permission vocabulary primitives;
- immutable audit-event envelope;
- job health-event envelope;
- open export manifest envelope;
- webhook signing and retry primitives;
- accessibility, error-state, analytics, and verification helpers.

### Must stay product-owned

- domain entities and state machines;
- role definitions and permission semantics;
- Firestore collection layout below the tenant;
- integration field mappings;
- analytics definitions;
- import/export payload schemas after the shared manifest;
- AI prompts, evaluation sets, and evidence rules;
- customer-facing navigation and terminology.

The shared export manifest begins with:

```json
{
  "schema": "net.saasassin.workspace-export",
  "version": "1.0.0",
  "product": "performance",
  "tenantId": "tenant_123",
  "exportedAt": "2026-08-11T00:00:00.000Z",
  "files": []
}
```

Each product publishes its own versioned file schemas and migration notes.

## 7. UI and brand contract

- use the accepted parent mark and a plain capability wordmark;
- use one accent per product but retain the SaaSassin paper, ink, grid, hard-border,
  and offset-shadow visual language;
- use real shadcn/ui controls for selects, dialogs, tabs, menus, tables, and forms;
- never ship disabled-looking placeholder dashboards with invented customer data;
- show a useful empty state, the real domain model, and the next executable action;
- expose whether data is live, local, unavailable, or waiting on an upstream gate;
- keep Logo Lab unlinked and hidden from the public application;
- keep target research inside SaaSassin routes, not an external generated site.

Product foundations are `noindex` until their first real workflow and privacy
surface are ready. The catalog and decision records remain indexable.

## 8. Delivery method

Every app is built vertically. A vertical slice includes the UI, persistence,
authorization, rules, audit, error states, tests, and deployment needed to complete
one user journey. Do not complete every database model before completing one flow.

For each stage:

1. Re-read `AGENTS.md`, current git status/history, this plan, the app registry
   entry, target research, and the app prompt.
2. Inspect the installed Next.js 16 documentation before changing framework code.
3. State the smallest end-to-end proof and exact non-goals.
4. Implement real Firebase persistence and authorization; do not substitute mocks.
5. Add Firestore rule tests for cross-tenant, cross-product, and role access.
6. Add state-machine and import/export contract tests where relevant.
7. Verify primary interactions in a real browser at desktop and mobile widths.
8. Run lint, typecheck, unit tests, rules tests, and production build.
9. Deploy locally verified work to the existing Vercel project and canonical domain.
10. Smoke-test the canonical product URL and inspect browser/server errors.
11. Update the roadmap, product status, prompt, and dated `todo` changelog.

No GitHub Actions are created. Do not commit or push without the repository owner's
explicit permission.

## 9. Portfolio sequence

The existence of ten foundations does not make ten missions active.

### Now

Complete Performance in this order:

1. finish peer/upward review assignments, nominations, scheduling, reminders, and
   deadlines;
2. ship calibration, packets, and acknowledgement;
3. add goals, feedback, evidence, one-to-ones, and employee timeline;
4. add composable reporting, complete export, API, webhooks, and integration health;
5. add optional AI summaries only after claim-to-evidence evaluation exists.

### Next evidence gates

- Planner may activate after Performance's live-cycle gate, using a four-week
  retention cohort as its proof.
- Research may activate as the sensitive-data flagship once two design partners
  and a security review are available.
- Creator, Studies, Community, Revenue, Mail, and Trust remain portfolio candidates
  until their named upstream/component review is complete.
- Feedback remains waiting until Fider maintainer direction is recorded. No feature
  build should work around that gate.

## 10. Quality and launch gates

An app is not “built” because its route renders. Before changing a foundation to a
working product, require:

- Google and email/password sign-up and sign-in;
- create/select tenant flow with no cross-tenant leakage;
- product-specific roles and an authorization test matrix;
- immutable audit history for all privileged writes;
- one complete golden workflow against production persistence;
- useful empty, loading, validation, permission, integration, and recovery states;
- an open, versioned export for every record created by the golden workflow;
- privacy, retention, deletion, and integration scope copy appropriate to the app;
- no placeholder links or crude native controls;
- lint, typecheck, unit tests, Firestore rule tests, and build all green;
- canonical domain, TLS, Firebase authorized domain, and production smoke tests;
- observability that does not record sensitive content by default.

High-risk apps add extra gates:

- Research: consent, retention, redaction, and security review.
- Revenue: jurisdiction-aware recording consent and transcript redaction.
- Mail: OAuth review, token encryption, provider abuse testing, and sync recovery.
- Trust: independent security review and carefully limited claims.
- Creator and Community: payment, refund, entitlement, and migration reconciliation.

## 11. Operational matrix

During incubation:

- Vercel project: `saasassin`;
- Firebase project: `saasassin-net`;
- domain: explicit capability subdomains, not a wildcard;
- production deploy: local `vercel --prod` after all checks;
- Firebase changes: deploy rules/indexes/auth explicitly and verify the active
  project before mutation;
- analytics: one PostHog project/token per product when activated;
- secrets: server-only, never copied into documentation or `NEXT_PUBLIC_*`;
- changelog: `todo/YYYY-MM-DD.md` records user capability, risk removal, decisions,
  and breaking changes.

Explicit domains reduce accidental exposure and make the enabled fleet auditable.
Only add a wildcard if a future user-created tenant-domain product genuinely needs
it and the security model has been reviewed.
