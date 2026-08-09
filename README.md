# SaaSassin

SaaSassin is a catalog and public roadmap for coordinated open-source SaaS displacement. It helps AI-native builders, maintainers, and potential adopters choose high-value targets and organize around verified migrations.

## What ships in the MVP

- Ranked catalog of ten researched SaaS targets.
- Build, assemble, and back attack strategies.
- Searchable catalog and individual mission briefs.
- Public 30/60/90+ day delivery roadmap.
- A public, upstream-first Canny → Fider proving mission with measurable gates.
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

Direct browser access to Firestore is denied in the MVP. The Next.js server reads the catalog and validates interest submissions through Firebase Admin.

The restricted `/ops` route uses the server-only `OPS_ACCESS_KEY`. Never expose this
value through a `NEXT_PUBLIC_` variable.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Regenerate the deterministic SVG exploration set and its manifest with:

```bash
pnpm generate:logos
```

## Product documentation

- Product thesis: `docs/knowledge-base/hypothesis/impact-thesis.md`
- MVP requirements: `docs/knowledge-base/requirements/PRD.md`
- Architecture: `docs/knowledge-base/requirements/design-docs/architecture.md`
- Delivery roadmap: `docs/roadmap.md`
- Mission 01 charter: `docs/missions/canny-fider/charter.md`
- Canny interview guide: `docs/missions/canny-fider/interview-guide.md`

The product follows a clean-room approach: incumbent names identify migration targets and do not imply affiliation.
