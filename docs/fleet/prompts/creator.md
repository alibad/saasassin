# Prompt for Claude — fully build SaaSassin Creator

Build SaaSassin Creator in `/Users/alibadereddin/Code/GitHub/saasassin`.

Do not reopen the build-versus-assemble decision. Read `AGENTS.md`, `CLAUDE.md`,
git status/history, `docs/fleet/architecture.md`, the Creator registry entry, Kajabi
target research, and the current code. First complete and record the component
selection for courses, community, identity, email, checkout, and storage. Prefer
maintained open components and replaceable adapters over greenfield rewrites.

The product is SaaSassin Creator at `creator.saasassin.net`; Kajabi is only the
migration target. Use the accepted SaaSassin mark and Creator wordmark.

The golden workflow must let a creator sign up with Google or email, create a
business, create and publish a course/product, create a paid offer, complete a real
test checkout, grant the correct entitlement, deliver onboarding, consume the
content as a customer, issue a refund/revoke access safely, and export the customer,
content, offer, payment reference, and access history.

Complete boundary:

- products, courses, modules, lessons, downloads, drip schedules, cohorts, progress;
- contacts, profiles, forms, consent, tags, segments, broadcasts, and bounded automations;
- offers, checkout, subscriptions, coupons, invoices, refunds, tax-provider adapters;
- shared identity, memberships, versioned entitlements, grants, revocations, and access history;
- landing/product/checkout pages with accessible templates and custom-domain readiness;
- email-provider adapter, delivery health, suppression, consent, and failure history;
- community adapter and links where it avoids duplicating SaaSassin Community;
- dashboards for revenue, enrollment, conversion, churn, and content completion with explicit definitions;
- previewable Kajabi migration with content/customer/offer/subscription reconciliation;
- open versioned business export, API, signed webhooks, and integration health.

Exclude a custom payment processor, tax or legal advice, unrestricted website
builder, proprietary email delivery network, livestream infrastructure, payroll,
and a large plugin marketplace.

Work vertically: component adapters → identity/entitlements → course delivery →
offer/checkout/webhooks → email onboarding → refunds/reconciliation → migration/
export. Payment webhooks must be signed, idempotent, replayable, and auditable.
Entitlement state must be derivable from an append-only access/payment history.

Use Firebase Auth with Google/email and product/tenant scoped authorization. Store
only payment-provider references, never raw card data. Add Firestore rule tests,
webhook replay/order tests, entitlement invariants, refund/access tests, migration
reconciliation, and export schema tests. Use proper shadcn/ui and real empty/error/
recovery states.

Run lint, typecheck, all tests/rules tests, and production build. Browser-test creator
and customer paths, webhook retries, failed payments, refund/revoke, consent, and
export. Deploy to the existing Vercel project and `creator.saasassin.net`, then
smoke-test production. Update docs, roadmap, registry status, and dated `todo` notes.

Do not create GitHub Actions. Do not commit or push without asking first. Continue
until one real test-mode creator business workflow is working and exportable.
