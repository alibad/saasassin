# SaaSassin

SaaSassin is a catalog and public roadmap for coordinated open-source SaaS displacement. Its active build is an open-source Lattice Performance replacement for organizations with 25–250 employees.

## What ships in the MVP

- Ranked catalog of ten researched SaaS targets.
- Build, assemble, and back attack strategies.
- Searchable catalog and individual mission briefs.
- Public 30/60/90+ day delivery roadmap.
- A Firebase-backed Lattice Performance vertical slice with authentication, tenant isolation, employee imports, review templates, cycle transitions, review submission, and immutable audit history.
- A traceable Lattice research and product-decision record inside the SaaSassin app.
- Capability-named product foundations for the full ten-target fleet, each with a
  canonical subdomain, domain model, golden workflow, trust boundary, and vertical
  delivery contract.
- The Canny → Fider mission retained in waiting status while upstream maintainer input is pending.
- Firebase-backed catalog, roadmap, mission, and qualified-interest submissions.
- A restricted mission-control view for reviewing design partners and builders.
- Privacy-conscious PostHog instrumentation that stays disabled without configuration.
- Seed-data fallback so the site builds before Firebase is linked.
- Sitemap, robots policy, app manifest, structured data, and social preview.

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Connect Firebase

The project is linked to Firebase project `saasassin-net`. Its default Firestore
database runs in the `eur3` multi-region with deletion protection enabled.

Local development uses the dedicated `saasassin-web` service account. Its key is
stored outside the repository and referenced from the ignored `.env.local` file.

Deploy the locked-down rules when they change:

```bash
pnpm exec firebase deploy --only firestore:rules,firestore:indexes
```

Seed or refresh the catalog, roadmap, and mission:

```bash
pnpm seed:firestore
```

Verify live reads and a temporary write/read/delete cycle:

```bash
pnpm verify:firestore
```

Firebase Authentication supports Google and email/password accounts. The Lattice workspace routes authorize every request through an organization membership and role. Firestore rules add tenant and role enforcement for browser SDK access, while the Next.js server repeats those checks before using Firebase Admin.

The Firebase OAuth brand is `SaaSassin Performance`. `localhost`, the canonical
SaaSassin domains, and all ten fleet subdomains are registered as authorized
authentication domains. Deploy provider configuration with:

```bash
pnpm exec firebase deploy --only auth --project saasassin-net
```

The product workspace is available at `performance.saasassin.net`; the public
decision record lives at `/targets/lattice/research`. Local and preview environments
can still use `/lattice`.

The complete product fleet is visible at `/apps`:

- `performance.saasassin.net`
- `research.saasassin.net`
- `planner.saasassin.net`
- `creator.saasassin.net`
- `feedback.saasassin.net`
- `studies.saasassin.net`
- `revenue.saasassin.net`
- `community.saasassin.net`
- `mail.saasassin.net`
- `trust.saasassin.net`

Host routing is always available. Set `FLEET_SUBDOMAINS_ENABLED=true` in Vercel
only after all ten DNS records resolve; until then, public links use the equivalent
internal routes so the fleet never launches with broken navigation.

The restricted `/ops` route uses the server-only `OPS_ACCESS_KEY`. Never expose this
value through a `NEXT_PUBLIC_` variable.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:rules
pnpm build
```

The Firestore rule runner selects Java 21 or newer on macOS before starting the local emulator.

Regenerate the deterministic SVG exploration set and its manifest with:

```bash
pnpm generate:logos
```

## Product documentation

- Product thesis: `docs/knowledge-base/hypothesis/impact-thesis.md`
- MVP requirements: `docs/knowledge-base/requirements/PRD.md`
- Architecture: `docs/knowledge-base/requirements/design-docs/architecture.md`
- Delivery roadmap: `docs/roadmap.md`
- Fleet architecture and delivery plan: `docs/fleet/architecture.md`
- Copy-ready Claude prompts for every product: `docs/fleet/prompts/README.md`
- Lattice research record: `/targets/lattice/research`
- Waiting Fider mission charter: `docs/missions/canny-fider/charter.md`
- Waiting Fider interview guide: `docs/missions/canny-fider/interview-guide.md`

The product follows a clean-room approach: incumbent names identify migration targets and do not imply affiliation.
