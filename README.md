# SaaSassin

SaaSassin is a catalog and public roadmap for coordinated open-source SaaS displacement. It helps AI-native builders, maintainers, and potential adopters choose high-value targets and organize around verified migrations.

## What ships in the MVP

- Ranked catalog of ten researched SaaS targets.
- Build, assemble, and back attack strategies.
- Searchable catalog and individual mission briefs.
- Public 30/60/90+ day delivery roadmap.
- A public logo lab with 50 downloadable SVG identity directions.
- Firebase-backed catalog, roadmap, and builder-interest submissions.
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

Seed or refresh the catalog and roadmap:

```bash
pnpm seed:firestore
```

Verify live reads and a temporary write/read/delete cycle:

```bash
pnpm verify:firestore
```

Direct browser access to Firestore is denied in the MVP. The Next.js server reads the catalog and validates interest submissions through Firebase Admin.

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

The product follows a clean-room approach: incumbent names identify migration targets and do not imply affiliation.
