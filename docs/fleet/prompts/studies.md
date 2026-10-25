# Prompt for Claude — fully build SaaSassin Studies

Build SaaSassin Studies in `/Users/alibadereddin/Code/GitHub/saasassin`.

Inspect `AGENTS.md`, `CLAUDE.md`, git state/history, `docs/fleet/architecture.md`,
the Studies registry entry, Maze target research, and current Firebase/Vercel code.
Do not reopen the assemble decision. Evaluate the current maintained releases and
licenses of Quant-UX and Formbricks, record the adapter decision, and reuse credible
primitives rather than reimplementing them blindly.

The product is SaaSassin Studies at `studies.saasassin.net`; Maze is the migration
target. Use the accepted SaaSassin mark and Studies wordmark.

The golden workflow must let a researcher sign up, create a tenant, create and
version a study containing a prototype mission and survey, preview branching,
screen/invite owned participants, capture consent, collect sessions and responses,
exclude low-quality sessions with visible reasons, analyze paths/answers, create an
evidence-linked finding, and export the full study.

Complete boundary:

- studies, blocks, tasks, surveys, question types, branching, versions, preview, templates;
- prototype links, expected paths, click/interaction events, success, misclicks, and timing;
- card sorting/tree testing if supported cleanly by the chosen open component;
- participant sources, invites, screeners, consent, cohorts, incentives, and privacy requests;
- sessions, responses, recordings where consented, notes, completion, and quality flags;
- metrics, paths, funnels, segments, themes, findings, reports, and raw evidence links;
- granular roles, public study links, rate/abuse controls, immutable audit, and retention;
- Maze import where source exports permit it, plus an open versioned study export;
- API, signed webhooks, integration health, and participant-provider adapters;
- optional AI synthesis only with response-level evidence links and explicit human review.

Exclude a proprietary participant marketplace, general survey-suite parity,
biometric/emotion claims, deceptive research, and autonomous unsupported findings.

Work vertically: shared portable schema → builder/version/preview → participant and
consent flow → session collection → analysis/evidence → import/export. Freeze a
study version at launch. Preserve raw responses behind every aggregate and record
why excluded sessions are excluded.

Use Firebase Auth with Google/email, host-only sessions, product/tenant scoped data,
granular roles, and deny-by-default rules. Add cross-product/tenant tests, public
study token tests, version immutability tests, branching/path fixtures, consent/
retention tests, and export contract tests. Use real shadcn/ui and accessible study
controls—no native-select shortcuts or fake response data.

Run lint, typecheck, all tests/rules tests, and production build. Browser-test study
authoring and participant flows on desktop/mobile, including resume, duplicate
submission, expired links, accessibility, and export. Deploy to the existing Vercel
project and `studies.saasassin.net`, then smoke-test. Update docs, roadmap, registry,
and dated `todo` notes.

Do not create GitHub Actions. Do not commit or push without asking first. Continue
until the complete golden study is real, verified, exportable, and deployed.
