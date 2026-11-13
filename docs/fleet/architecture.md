# SaaSassin product fleet architecture

Status: accepted implementation baseline, August 11, 2026 — updated October 26, 2026

This document turns the researched target catalog into ten independently branded
products. As of October 26, 2026 every product runs its golden workflow against
Firebase on the shared fleet platform (§6a). The owner lifted the evidence and
upstream gates for that build; Feedback ships Fider-compatible data so the upstream
path stays open.

## 1. Decision

Each replacement owns a capability-named subdomain. Incumbent trademarks remain
only in target, migration, and decision material.

| Product | Target | Canonical domain | Strategy | Current state |
| --- | --- | --- | --- | --- |
| SaaSassin Performance | Lattice | `performance.saasassin.net` | Build | Working product |
| SaaSassin Research | Dovetail | `research.saasassin.net` | Build | Working product |
| SaaSassin Planner | Motion | `planner.saasassin.net` | Build | Working product |
| SaaSassin Creator | Kajabi | `creator.saasassin.net` | Assemble | Working product |
| SaaSassin Feedback | Canny / Fider | `feedback.saasassin.net` | Back | Working product (Fider-compatible) |
| SaaSassin Studies | Maze | `studies.saasassin.net` | Assemble | Working product |
| SaaSassin Revenue | Gong | `revenue.saasassin.net` | Back | Working product |
| SaaSassin Community | Circle | `community.saasassin.net` | Assemble | Working product |
| SaaSassin Mail | Superhuman Mail | `mail.saasassin.net` | Back | Working product (import-based) |
| SaaSassin Trust | Vanta | `trust.saasassin.net` | Back | Working product |

Per-product capability, verification and gaps live in `docs/fleet/status/<product>.md`.

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

### Per-product repositories (generated, November 13, 2026)

Development stays here, but every product is also published as a standalone,
self-hostable open-source repository, `github.com/alibad/saasassin-<product>`. Those
repositories are generated from this monorepo and never edited by hand, so changes accepted
from issues and pull requests there land here first and are then synced.

- `scripts/export-product.mjs <slug> <outDir>` assembles one product as a complete Next.js
  project. It traces the import graph (`@/` and relative imports, static and dynamic, and CSS
  `@import`s) from the product's routes (`src/app/apps/<slug>`, `src/app/api/<slug>` and the
  shared `src/app/api/fleet`, or `src/app/lattice` and `src/app/api/lattice` for
  Performance), the root layout, `src/proxy.ts` and `src/instrumentation-client.ts`. There is
  no hand-maintained file list; the exporter fails if the graph reaches the catalog, roadmap,
  ops, Logo Lab or another product.
- It adds product-named tests plus any test that imports only exported code, the configs,
  generated `firestore.rules` (deny-all on `products/**` for fleet products; the
  `organizations` rules for Performance), an `.env.example` limited to the variables the
  exported code reads, `docs/STATUS.md`, and a README rendered from
  `scripts/product-readme.template.md` with data from `src/lib/fleet/apps.ts` and the
  product's status file. `package.json` keeps the monorepo's dependency versions so the
  copied `pnpm-lock.yaml` stays valid.
- Generated repositories set `STANDALONE_PRODUCT=<slug>` through `next.config.ts`, and the
  proxy then serves that product at `/` on every host (§3). Lines marked `standalone:omit`
  are dropped; the root layout uses this for the parent site's header and footer.
- `scripts/publish-products.mjs [--commit | --push] [slug...]` syncs clones in
  `../saasassin-products/<slug>`. The default is a dry run that prints what would change;
  `--commit` commits `sync: saasassin@<short-sha>` only when something changed, and `--push`
  also pushes. It never force-pushes and refuses a dirty monorepo or clone.

## 3. Request routing

`src/proxy.ts` performs hostname routing before App Router rendering.

- `performance.saasassin.net/` rewrites to the existing `/lattice` workspace.
- `performance.saasassin.net/sign-in` rewrites to `/lattice/sign-in`.
- every other product rewrites `/{path}` to `/apps/{product}/{path}`; in-app links use
  the internal `/apps/{product}/...` form, which is served as-is on every host.
- parent-site routes (`/targets`, `/catalog`, `/roadmap`, `/missions`, `/apps`, `/ops`)
  stay reachable from product hosts so research briefs keep working.
- legacy production routes such as `saasassin.net/lattice` and
  `saasassin.net/apps/research` redirect permanently to the capability domain.
- API, Next assets, metadata, and public files are excluded from host rewrites.
- localhost and Vercel previews keep the internal paths available for testing.
- with `STANDALONE_PRODUCT=<slug>` (set by generated per-product repositories, §2) every
  host serves only that product: `/` and other paths rewrite into its in-app root,
  `/apps/<slug>/...` (or `/lattice/...`) is served as-is, nothing redirects to
  `saasassin.net`, and the shared `/api/fleet/{product}` routes refuse other products.

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

Performance keeps its original host-only session. Every other product uses the shared,
product-aware session in `src/lib/fleet/platform/session.ts`: cookie
`saasassin_{product}_session`, created by `POST /api/fleet/{product}/session` and
signed in at `/apps/{product}/sign-in`.

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

### 6a. Shared fleet platform (implemented October 26, 2026)

`src/lib/fleet/platform/` is the trusted spine every non-Performance product builds on:

- `session.ts` — product session lookup (`requireFleetUser`) and `FleetError`;
- `tenants.ts` — tenant creation, membership index, `requireTenantMember` role checks,
  invitations, append-only audit events, and tenant-scoped collections;
- `http.ts` — consistent API error responses;
- `export.ts` — the shared export manifest and Firestore-to-JSON conversion.

Product data lives at `products/{product}/tenants/{tenantId}/...` and is server-only:
Firestore rules deny all browser access to `products/**`
(`tests/fleet-products.rules.test.ts`), and every route verifies session, membership
and role with the Admin SDK. Each product proves its golden workflow against the
Firestore emulator in `tests/{product}.emulator.spec.ts`.

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

No GitHub Actions are created. A push to `main` deploys production (see §11), so the
full check suite and `pnpm build` must pass before every push.

## 9. Portfolio sequence

On October 26, 2026 the owner lifted the evidence and upstream gates and every product
was built in parallel to a working golden workflow. The gates below are no longer
preconditions for building; they remain the proof each product still owes before it
is presented as production-ready to customers.

### Done

- Performance stages 1–4: review operations, calibration and packets, goals,
  feedback, one-to-ones, timeline, reports, export, API keys and signed webhooks.
- Every other product: tenant, roles, golden workflow, audit, export, and a first
  round of migration and secondary modules (see each status file).

### Still owed

- Performance: integration health, field mappings, webhook retries, stage 5 AI only
  after claim-to-evidence evaluation exists.
- Research: two design partners and a security review before sensitive data.
- Planner: a four-week retention cohort; Google and Microsoft calendar sync.
- Mail: provider OAuth review, token encryption, and sync recovery before live mail.
- Revenue: Vexa capture and CRM sync with jurisdiction-aware consent review.
- Creator and Community: payments, refunds and entitlement reconciliation.
- Trust: independent security review and carefully limited claims.
- Feedback: record Fider maintainer direction before upstreaming the contribution.

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
- production deploy: the Vercel project is git-connected, so every push to `main`
  deploys saasassin.net and all ten product subdomains — build before pushing;
- Firebase changes: deploy rules/indexes/auth explicitly and verify the active
  project before mutation;
- analytics: one PostHog project/token per product when activated;
- secrets: server-only, never copied into documentation or `NEXT_PUBLIC_*`;
- changelog: `todo/YYYY-MM-DD.md` records user capability, risk removal, decisions,
  and breaking changes.

Explicit domains reduce accidental exposure and make the enabled fleet auditable.
Only add a wildcard if a future user-created tenant-domain product genuinely needs
it and the security model has been reviewed.
