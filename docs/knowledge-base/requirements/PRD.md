# SaaSassin MVP product requirements

## Objective

Launch a credible catalog and public roadmap that turns researched SaaS targets into joinable open-source missions.

## MVP workflow

1. A visitor understands the promise and current launch sequence.
2. They browse and filter the ranked catalog.
3. They open a target to review the score, evidence, wedge, open-source landscape, risks, and mission milestones.
4. They review the public roadmap and definition of success.
5. A builder or design partner submits interest for a specific mission.
6. The submission is validated by a server route and stored in Firestore.
7. A mission operator reviews qualified applications through the restricted operations route.

## MVP requirements

- Ten evidence-backed target records with build, assemble, or back strategies.
- Search and strategy filters.
- Individual target routes with dynamic metadata.
- A 30/60/90-day roadmap with deliverables and measurable success criteria.
- Firestore-backed target, roadmap, and interest collections.
- A Firestore-backed Canny → Fider mission page with public gates, evidence, and recruitment.
- Privacy-conscious analytics for mission views, calls to action, and completed applications.
- A server-authenticated operations queue that is hidden from public navigation and search.
- Checked-in seed data and graceful read fallback before Firebase is configured.
- Clear failure messaging when a write is attempted without backend configuration.
- Responsive, accessible navigation and content.
- SEO metadata, sitemap, robots policy, app manifest, and social preview image.

## V1

- Account-based authentication for maintainers and mission leads.
- Mission proposals and evidence attachments.
- Public milestone updates and delivery verification.
- Maintainer profiles, repository links, and contribution instructions.
- Moderated voting from verified potential adopters.

## V2+

- Milestone funding and transparent bounty contracts.
- Migration playbooks and compatibility test suites.
- Hosted reference deployments.
- Governance dashboards and project-health monitoring.
- Verified displacement metrics.

## Non-functional requirements

- No secrets in the repository or browser bundle.
- Direct browser writes to Firestore are denied initially.
- The site builds without Firebase credentials and identifies seed-backed reads.
- Forms validate input on both client and server.
- Every visible navigation item resolves to useful content.
