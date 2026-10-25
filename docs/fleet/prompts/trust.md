# Prompt for Claude — fully build SaaSassin Trust

Build SaaSassin Trust in `/Users/alibadereddin/Code/GitHub/saasassin`.

Read `AGENTS.md`, `CLAUDE.md`, git state/history, `docs/fleet/architecture.md`, the
Trust registry entry, Vanta target research, and current infrastructure. Complete
the current Openlane (and credible alternative) architecture, license, governance,
security, framework, connector, and maintainer review first. Record the decision and
back the selected challenger; do not start a greenfield compliance platform without
an explicit owner decision.

The product is SaaSassin Trust at `trust.saasassin.net`; Vanta is only the migration
target. Use the accepted SaaSassin mark and Trust wordmark. Never imply certification,
guaranteed compliance, legal advice, or security properties that have not been
independently verified.

The golden workflow must let an owner sign up, create a tenant, select and version a
SOC 2 program, scope requirements, map/assign controls, upload manual evidence,
connect one test integration, run a check, inspect and recover from a mapping or
credential failure, approve evidence with provenance/validity, invite a least-
privilege auditor, answer a request/finding, inspect immutable activity, and export
the complete program.

Complete boundary:

- versioned frameworks, requirements, controls, mappings, applicability, and ownership;
- manual/automated evidence, requests, sources, provenance, validity windows, review, and approval;
- connectors, credentials, checks, runs, failures, retries, field mappings, and health history;
- risks, vendors, policies, versions, exceptions, tasks, acceptance, and review dates;
- audit periods, auditor workspaces, samples, requests, findings, responses, and access expiry;
- fine-grained roles, permission simulator, immutable audit, retention, and deletion;
- dashboards/reports with explicit definitions and drill-down to controls/evidence;
- previewable Vanta import where exports permit it, reconciliation, and open versioned workspace export;
- API, signed webhooks, connector SDK/contract, and integration diagnostics;
- optional evidence summaries only with item-level sources, limitations, and human approval.

Exclude audit-firm services, certification or legal advice, a secret-scanning suite,
unsupported security guarantees, and a large integration marketplace in the first release.

Build vertically: challenger adapter/security baseline → framework/control graph →
manual evidence → first connector/check/health → auditor workflow → risk/policy →
migration/export/API. Framework/control versions and evidence provenance must never
be rewritten in place. Secrets must use appropriate managed encryption and never
appear in Firestore documents, logs, client bundles, or exports.

Use Firebase Auth Google/email, host-only product sessions, product/tenant scoped
authorization, least-privilege auditor roles, and deny-by-default rules. Add cross-
product/tenant/role tests, immutable version/audit tests, connector secret and webhook
tests, retry/mapping failure fixtures, evidence validity/provenance tests, auditor
expiry tests, and export schema verification.

Use proper shadcn/ui and explicit failure/recovery states. Run lint, typecheck, all
security/unit/integration/rules tests, and production build. Browser-test owner,
control owner, and auditor paths. Complete an independent security review before
real customer evidence. Deploy to the existing Vercel project and
`trust.saasassin.net`, then smoke-test production.

Update decision research, roadmap, registry, and dated `todo` notes. Do not create
GitHub Actions. Do not commit, push, open upstream PRs, or contact maintainers without
explicit permission. Continue until one real compliance program is migration-ready,
exportable, and independently reviewed.
