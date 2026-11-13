# SaaSassin

SaaSassin is a catalog and public roadmap for coordinated open-source SaaS displacement, plus a fleet of ten open-source replacement products — one per researched target — each live on its own capability subdomain.

## What ships in the MVP

- Ranked catalog of ten researched SaaS targets.
- Build, assemble, and back attack strategies.
- Searchable catalog and individual mission briefs.
- Public 30/60/90+ day delivery roadmap.
- SaaSassin Performance (Lattice replacement): review cycles with nominations, peer/upward assignments, calibration, packets and acknowledgement, plus goals, feedback, one-to-ones, the employee timeline, reports, a versioned export, API keys and signed webhooks.
- Nine more working products on a shared fleet platform — Research, Planner, Creator, Feedback, Studies, Revenue, Community, Mail and Trust — each with sign-in, tenant workspaces, roles, its golden workflow, an audit log and a versioned export. Capabilities and gaps per product: `docs/fleet/status/<product>.md`.
- A traceable Lattice research and product-decision record inside the SaaSassin app.
- Feedback keeps Fider-compatible data and a Fider-shaped export so the upstream contribution path stays open.
- Firebase-backed catalog, roadmap, mission, and qualified-interest submissions.
- A restricted mission-control view for reviewing design partners and builders.
- Privacy-conscious PostHog instrumentation that stays disabled without configuration.
- Seed-data fallback so the site builds before Firebase is linked.
- Sitemap, robots policy, app manifest, structured data, and social preview.

## Open source

All ten products are free and open source under the
[GNU Affero General Public License v3.0](LICENSE): use them, self-host them and modify
them; if you run a modified version as a hosted service, publish your changes under the
same license. See [CONTRIBUTING.md](CONTRIBUTING.md) to get involved and
[SECURITY.md](SECURITY.md) to report a vulnerability.

## Per-product repositories

This monorepo is the single source of truth. Each product is also published as its own
standalone, self-hostable repository, `github.com/alibad/saasassin-<product>`, generated from
it and never edited by hand:

```bash
node scripts/export-product.mjs research ../export/research   # one standalone Next.js project
node scripts/publish-products.mjs                              # dry run: what would change, per product
node scripts/publish-products.mjs --push research              # commit "sync: saasassin@<sha>" and push
```

- The exporter traces the import graph from the product's routes, the root layout, the proxy
  and client instrumentation, so a new file ships as soon as product code imports it. Catalog,
  roadmap, ops, Logo Lab and the other products never reach a product repository; the
  exporter fails if they would.
- It adds the tests that exercise only exported code, the configs, the product's Firestore
  rules (deny-all for fleet products, the organizations rules for Performance), an
  `.env.example` with only the variables that product reads, `docs/STATUS.md` from
  `docs/fleet/status/<product>.md`, and a README rendered from
  `scripts/product-readme.template.md`.
- `next.config.ts` in each generated repository defaults `STANDALONE_PRODUCT` to the product,
  so `src/proxy.ts` serves it at `/` on any host. Product code links to research briefs on
  `https://saasassin.net` absolutely so those links keep working there. Lines marked
  `standalone:omit` (the parent site's header and footer) are dropped.
- `publish-products.mjs` keeps clones in `../saasassin-products/<product>`, cloning them when
  missing. Without flags it only prints the diff; `--commit` commits locally and `--push` also
  pushes. It never force-pushes, and it refuses a dirty monorepo or clone.

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

Pushing to `main` deploys production for saasassin.net and every product subdomain,
so run the quality checks below and `pnpm build` before every push.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:rules
pnpm build
```

The Firestore rule runner selects Java 21 or newer on macOS before starting the local emulator.

Each product also proves its golden workflow against a Firestore emulator. The
installed firebase-tools needs Java 21+ and uses the `java` on `PATH`, so put a 21+ JDK first:

```bash
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-23.jdk/Contents/Home \
  PATH="$JAVA_HOME/bin:$PATH" \
  pnpm exec firebase emulators:exec --only firestore --project demo-saasassin \
  "pnpm exec vitest run --config vitest.emulator.config.mjs"
```

Performance's suite runs with `vitest.lattice.config.mjs` instead.

### Fictional demo workspaces (emulators only)

`scripts/seed-demo-performance.mjs`, `scripts/seed-demo-feedback.mjs` (Lumio, a whiteboard
company with a product team, customers, boards, votes and a changelog) and
`scripts/seed-demo-trust.mjs` (Corvid Analytics, working toward SOC 2 and ISO 27001) fill local
emulators with made-up people, generated portraits from `scripts/demo-photos/` and a believable
history. They refuse to run unless both emulator hosts are set and the project id starts with
`demo-`, and they wipe that project's emulator data first. Start the emulators with
`--project` set to the same demo id: the browser's Auth SDK always signs in against the
emulator's default project.

```bash
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-23.jdk/Contents/Home PATH="$JAVA_HOME/bin:$PATH" \
  pnpm exec firebase emulators:start --only auth,firestore --project demo-saasassin-trust
FIREBASE_PROJECT_ID=demo-saasassin-trust FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/seed-demo-trust.mjs
FIREBASE_PROJECT_ID=demo-saasassin-trust NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-saasassin-trust \
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 pnpm dev
```

Each script prints the account to sign in with. Switching projects needs a fresh `.next`
(the client bundle inlines `NEXT_PUBLIC_FIREBASE_PROJECT_ID`).

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
