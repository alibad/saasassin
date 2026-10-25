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
| Audit periods | Admins create an audit window per framework and give an auditor (viewer) read-only access until a date. After that date, or on revoke, the server refuses that auditor's snapshot, actions, and exports with a 403 |
| Findings | Issues linked to controls and audit periods, with severity, owner, due date, and remediation status (open / in remediation / resolved / risk accepted, which needs a rationale). Overdue findings become high-priority tasks and appear in the evidence package |
| Library migration | Each program is pinned to the control ids it adopted. When the built-in library changes, admins see a diff (added / retired / unchanged), apply it explicitly, and the migration is audited. Stored control records are kept |
| Access reviews | List critical systems and their users, then sign off a review each quarter: mark who to remove, and Trust records the reviewer plus who was kept and removed. A quarter cannot be signed off twice, due reviews become tasks, and reviews are exported |
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
- Connectors and automated checks (including identity-provider user sync for access reviews), audit samples, auditor-raised findings (auditors are read-only), Vanta import, API and webhooks are not built.
- Removing a member, and editing or deleting a risk's history (risks are overwritten on save; the audit log keeps the trail).
- Only one library version (`2026.10.0`) has shipped so far. The migration preview and apply path is proven in the emulator by simulating an older baseline.
- I could not test the signed-in flows in a browser, because the ground rules do not allow creating Firebase accounts. The round-1 workspace UI was checked against a temporary mock-data page (since removed) at 1280px and 390px. The round-2 tabs (Access reviews, Audits & findings) passed typecheck, lint, and build but were not viewed in a browser.

## Proven against a real Firestore (emulator)

`tests/trust.emulator.spec.ts` drives the same services the route handlers call (`getTrustSnapshot`, `runTrustAction`, `buildTrustExport`, `getPublicTrustCenter`) through the full workflow. It uses an owner, a viewer/auditor, and a member of a second tenant. Its first statement throws unless `FIRESTORE_EMULATOR_HOST` is set.

```
# needs Java 21+, e.g. JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-23.jdk/Contents/Home
# .emulator-trust.json (uncommitted): firestore 8182, hub 8282, logging 8382, ui off, singleProjectMode
pnpm exec firebase emulators:exec --config .emulator-trust.json --only firestore --project demo-saasassin \
  "pnpm exec vitest run --config vitest.emulator.config.mjs tests/trust.emulator.spec.ts"
```

Result on 2026-10-26: **11/11 passed**. The spec covers:
- records persist and read back
- viewer writes are refused (403) and non-members get 404
- tenant B never sees tenant A's data
- every mutation appends an audit event
- the export contains every record with `@1.0.0` schemas
- the public page leaks nothing unpublished
- auditor access expiry and revocation are enforced
- findings, library migration, and access reviews work as described above

The spec found no app bugs. One test needed a valid payload because validation runs before the role check.
