# Prompt for Claude — fully build SaaSassin Community

Build SaaSassin Community in `/Users/alibadereddin/Code/GitHub/saasassin`.

Read `AGENTS.md`, `CLAUDE.md`, git status/history, `docs/fleet/architecture.md`, the
Community registry entry, Circle target research, and current app infrastructure.
Do not reopen the assemble decision. Evaluate current Discourse/OpenCourse and other
selected component releases, licenses, APIs, and maintainer health; record the
adapter topology before implementation.

The product is SaaSassin Community at `community.saasassin.net`; Circle is only the
migration target. Use the accepted SaaSassin mark and Community wordmark.

The golden workflow must let an owner sign up, create a community, configure a
space, course, event, and paid membership, invite or migrate a member, complete a
test payment, grant access across all components, publish/discuss content, RSVP and
attend an event, report and moderate content with an appeal trail, refund/revoke
access, and export the member/content/access history.

Complete boundary:

- spaces, posts, comments, reactions, mentions, feeds, search, bookmarks, and profiles;
- courses, lessons, cohorts, progress, discussions, completion, and certificates;
- events, sessions, RSVPs, reminders, attendance, calendar links, and replays;
- members, groups, plans, payments, subscriptions, coupons, entitlements, and access history;
- moderation queues, reports, actions, appeals, blocked users, rate limits, and safety audit;
- email/in-app notifications, preferences, digests, delivery health, and accessibility;
- creator/admin analytics with explicit definitions and source drill-down;
- previewable Circle/community migration with identities, content, memberships, and reconciliation;
- open versioned export, API, signed webhooks, component and payment integration health.

Exclude custom video streaming, a proprietary payment processor, a general social
network, engagement-at-all-costs ranking, and native mobile apps in the first release.

Build vertically: shared identity/profile → centralized entitlements → spaces/posts
→ course progress → events → payments/refunds → moderation/notifications → migration/
export. Component adapters must be replaceable. Payment events and entitlement
changes must be signed, idempotent, replayable, and immutable.

Use Firebase Auth with Google/email for the SaaSassin operating layer, host-only
sessions, product/tenant scoped roles, and deny-by-default rules. Add cross-product/
tenant tests, component SSO tests, entitlement/refund invariants, moderation appeal
tests, notification preference tests, migration reconciliation, and export schemas.
Never store raw card data or send private community content to analytics.

Use proper shadcn/ui in the operating layer and preserve upstream component UI
conventions where embedded. Run lint, typecheck, all tests/rules tests, and production
build. Browser-test owner/member/moderator paths on desktop/mobile. Deploy to the
existing Vercel project and `community.saasassin.net`, then smoke-test production.

Update docs, roadmap, registry status, and dated `todo` notes. Do not create GitHub
Actions. Do not commit, push, or contact upstream without asking first. Continue
until one revenue-generating-community workflow is migration-ready and exportable.
