# Prompt for Claude — fully build SaaSassin Feedback with Fider

Continue the Feedback mission in `/Users/alibadereddin/Code/GitHub/saasassin`.

Read `AGENTS.md`, `CLAUDE.md`, git status/history, `docs/fleet/architecture.md`, the
Feedback registry entry, Canny target page, `docs/missions/canny-fider/*`, roadmap,
and all recorded maintainer outreach before doing anything else.

Hard gate: Fider maintainer input is currently pending. If no maintainer direction
has been recorded, do not build features, do not create a disconnected fork, and
do not quietly turn the SaaSassin foundation into a competing product. Keep the
app at `feedback.saasassin.net` in waiting state and return a concise blocker with
the exact upstream decision needed. Resume only through the accepted contribution
path or after the owner explicitly changes this decision.

When the gate is open, the product identity is SaaSassin Feedback for the fleet,
but implementation should normally land upstream in Fider. Canny remains only the
migration target. Preserve Fider licensing, contribution rules, architecture, and
maintainer review.

The golden workflow must import a representative Canny archive, preserve boards,
posts, authors, voters, vote counts, comments, status, tags, timestamps, and links;
preview mapping/problems; commit idempotently; merge duplicates; move an item across
a public/private roadmap; publish a changelog entry; notify affected voters; and
export the complete data again.

Complete accepted boundary:

- production-grade Canny import with preview, reconciliation, retries, and provenance;
- boards, posts, votes, comments, moderation, duplicate detection/merge, and internal notes;
- tags, ownership, customer segments, statuses, public/private visibility, and audit;
- public roadmap views, initiatives/releases, and accessible navigation/filtering;
- changelog entries, subscriptions, delivery health, and feedback-to-release links;
- SSO and fine-grained roles appropriate to Fider's architecture;
- signed webhooks, integrations, deployment health, and one-command self-hosting docs;
- open versioned export plus migration verification tooling;
- complete accessibility and usable empty/error/recovery states.

Exclude a greenfield platform, support desk, CRM, product analytics suite, and
in-app messaging platform.

Add migration fixtures, idempotency/reconciliation tests, authorization tests,
accessibility tests, and upgrade-safe database migrations. Use Fider's established
UI primitives; use shadcn/ui only in the SaaSassin shell where appropriate. Do not
force a Next/Firebase architecture onto upstream Fider.

Run the upstream repository's full local verification plus SaaSassin lint,
typecheck, tests, and build where touched. Browser-test the migration and public
feedback loop, deploy through the accepted path, and smoke-test production. Update
the mission record, roadmap, registry status, and dated changelog.

Do not create GitHub Actions. Do not commit, push, open a PR, or contact maintainers
without explicit owner authorization. Continue only while the upstream gate and
authorized contribution scope are satisfied.
