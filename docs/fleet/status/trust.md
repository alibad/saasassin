# SaaSassin Trust — status

_Updated 2026-10-26_

Open, exportable compliance **readiness and evidence tracking** (Vanta migration target). Trust never
claims to make anyone compliant or certified; every surface says it tracks readiness, and the public page
labels figures as self-reported.

## What teams can do now

| Area | Works end-to-end against Firestore |
|------|-------------------------------------|
| Workspaces | Create a workspace, switch between workspaces, invite members by email as admin, member, or viewer (read-only, suited to auditors), sign out |
| Frameworks | Pick SOC 2 common criteria (CC1–CC9, 33 controls) and/or an ISO 27001:2022 Annex A subset (15 controls) from a built-in library, versioned `2026.10.0`, with SaaSassin's own paraphrased wording |
| Controls | Assign owners; set status (not started, in progress, implemented, needs evidence, not applicable). Not applicable requires a written justification |
| Evidence | Attach a link or pasted text to one or more controls (also straight from a control), with collection date, review cadence, or explicit expiry. When evidence expires, its controls show **needs evidence** automatically; implemented controls with no current evidence do too. Owners and admins accept or reject evidence, and rejection needs a reason. Reviewer, time, and self-review are recorded, and rejected evidence never supports a control |
| Policies | Create from 8 templates (information security, access control, incident response, vendor management, change management, continuity/backup, acceptable use, data retention). Edits create new versions; approved text is never rewritten. Admins approve the latest version; people acknowledge it |
| Acknowledgements | Coverage is measured against members plus a list of employees in scope. Admins can record a signed acknowledgement on someone's behalf, and the record keeps who entered it |
| Risks | Likelihood × impact scoring (1–25, banded low/medium/high/critical), treatment (accepting a risk requires a written rationale), owner, linked controls, open/closed, plus a 5×5 heat map |
| Vendors | Inventory with risk tier, data access, owner, last review, and cadence. Overdue reviews are flagged |
| Readiness | Control coverage %, evidence freshness %, open and high risks, policies approved, and acknowledgement % — all computed live from tenant data, each with its definition shown |
| Gap tasks | Generated from real gaps (missing owner, missing or expiring evidence, unapproved or overdue policies, pending acknowledgements, untreated high risks, overdue vendors), ordered by priority, and linked to the right tab |
| Trust center | Public page at `/apps/trust/t/{tenantId}`, off by default. Admins choose: frameworks, readiness %, per-category counts, and which approved policies to list. Evidence, owners, risks, vendors, and policy text are never published |
| Export | Full workspace as versioned JSON (`net.saasassin.trust.*@1.0.0` plus the shared manifest), and an audit-ready **evidence package** per framework (requirement → controls → status/owner/justification → evidence with dates and freshness) |
| Activity | Every change goes to the append-only audit log, which is visible in Team & activity |

## Engineering notes

- Routes: `GET/POST /api/trust/tenants/[tenantId]` (snapshot plus one zod-validated discriminated-union action endpoint) and `GET /api/trust/tenants/[tenantId]/export[?package=soc2|iso27001]`. Every handler runs `requireFleetUser` → `requireTenantMember` → a server-side role check (`roleCanPerform`) → zod validation → write → `appendAuditEvent`.
- Roles: owner/admin can do everything. Members can work controls, evidence, policies (drafting only), risks, and vendors. Viewers are read-only apart from acknowledging policies. Approvals, publishing, frameworks, invites, people in scope, and deletes need owner or admin.
- Data: `products/trust/tenants/{id}/{settings,controls,evidence,policies,risks,vendors}`. There are no composite queries; collections are read whole per tenant and sorted in memory.
- The public trust center is a server component. It validates the tenant id format and projects data through `buildPublicTrustCenter`, which returns only the published fields (unit-tested to exclude policy bodies).
- Evidence links must use http(s) and are checked server-side, so `javascript:` URLs are rejected.
- Pure logic lives in `src/lib/trust/{frameworks,model,export,schemas,policy-templates}.ts`. `tests/trust-model.test.ts` covers library integrity (unique ids, every control mapped, every requirement covered, CC1–CC9 present), evidence expiry, control status derivation, risk scoring, readiness math, gap tasks, acknowledgement coverage, trust-center projection, the export schema, and role/validation rules.

## Key decisions

- **Derived "needs evidence"**: stored status is what the owner sets; effective status is derived at read time from evidence freshness. Expiry therefore needs no cron job and is never stale.
- **Coverage = implemented ÷ applicable**: not-applicable controls are excluded, and an implemented control counts only with current evidence.
- **Expiring soon (≤14 days) still counts as fresh** in the freshness percentage, but it generates a refresh task.
- **Gap tasks are computed, not stored**, so they can never drift from the data that produced them.
- **One action endpoint** per tenant keeps every mutation behind the same auth, role, and audit path.

## Remaining / known gaps

- File upload evidence (needs Firebase Storage, which is out of scope tonight). The UI says so and asks for a link or pasted text.
- Connectors and automated checks, auditor access expiry, audit periods, samples, findings, Vanta import, API and webhooks are not built.
- Removing a member, and editing or deleting a risk's history (risks are overwritten on save; the audit log keeps the trail).
- Control library updates: a new library version would need a migration preview UI. Today there is one version, and it is recorded on the program and in exports.
- I could not test the signed-in flows in a browser, because the ground rules do not allow creating Firebase accounts. Instead I checked the workspace UI against a temporary mock-data page (since removed) at 1280px and 390px. Logic is unit-tested and the signed-out pages return 200/404/401 as expected.
