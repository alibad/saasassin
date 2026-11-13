#!/usr/bin/env node
/**
 * Seeds a FICTIONAL company, "Corvid Analytics" (a product analytics SaaS working toward
 * SOC 2 and ISO 27001), into LOCAL Firebase emulators for demos and screenshots of Trust:
 * a five-person security team plus an external auditor, owned controls, evidence on real
 * review cadences (some about to expire), approved policies with acknowledgements, risks,
 * vendors, access reviews, an upcoming audit with time-boxed auditor access, and a
 * published trust center.
 *
 * It refuses to run unless FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are set
 * and FIREBASE_PROJECT_ID starts with "demo-" (see scripts/demo-seed-kit.mjs). Real credentials
 * are dropped first, and the demo project's emulator data is wiped on every run.
 *
 * Every change goes through runTrustAction (membership, validation, role check, audit), so the
 * activity log reads exactly as the product writes it; the history is then spread over
 * Sep–Nov 2026. People, companies and emails (on the reserved `.example` domain) are made
 * up; the portraits in scripts/demo-photos/trust are generated, not of real people.
 *
 * Usage (emulators started with `--project demo-saasassin-trust`, the id below, because
 * the browser Auth SDK signs in against the default project; e.g. Auth 9285, Firestore 8285):
 *   FIREBASE_PROJECT_ID=demo-saasassin-trust \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8285 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9285 \
 *   node scripts/seed-demo-trust.mjs
 *
 * Then run `next dev` with the same variables plus NEXT_PUBLIC_FIREBASE_PROJECT_ID and
 * NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST (src/lib/firebase/emulators.ts) and sign in as
 * ingrid@corvid.example with DEMO_PASSWORD below (emulator-only).
 */
import { createTimeline, demoPhoto, prepareDemoSeed, wipeEmulators } from "./demo-seed-kit.mjs";

const gate = prepareDemoSeed("seed-demo-trust");

/** Emulator-only password for every seeded account. Never valid anywhere else. */
export const DEMO_PASSWORD = "corvid-emulator-only";
const PRODUCT = "trust";

const { getAdminAuth } = await import("@/lib/firebase/admin");
const trust = await import("@/lib/trust/data");
const tenants = await import("@/lib/fleet/platform/tenants");
const profiles = await import("@/lib/fleet/platform/profiles");
const team = await import("@/lib/fleet/platform/team");
const { Timestamp } = await import("firebase-admin/firestore");

const auth = getAdminAuth();
if (!auth) gate.refuse("The Admin SDK did not initialize in emulator mode.");

/** [key, name, email, job title, role] */
const PEOPLE = [
  ["ingrid", "Ingrid Solberg", "ingrid@corvid.example", "Head of Security", "owner"],
  ["rafael", "Rafael Duarte", "rafael@corvid.example", "CTO", "admin"],
  ["amira", "Amira Khalil", "amira@corvid.example", "Security Engineer", "member"],
  ["ben", "Ben Park", "ben@corvid.example", "Platform Engineer", "member"],
  ["grace", "Grace Okonkwo", "grace@corvid.example", "People Operations Lead", "member"],
  ["lucas", "Lucas Moreau", "lucas.moreau@brambleassurance.example", "Senior Auditor, Bramble & Co. Assurance", "viewer"],
];
const people = new Map(PEOPLE.map(([key, name, email, title, role]) => [key, { uid: `corvid-${key}`, name, email, title, role }]));
const who = (key) => {
  const person = people.get(key);
  if (!person) throw new Error(`Unknown person ${key}`);
  return { uid: person.uid, email: person.email, name: person.name, emailVerified: true };
};
const mail = (key) => people.get(key).email;

/** Employees and contractors who acknowledge policies but don't use Trust. */
const EMPLOYEES = [
  "theo.nguyen", "priya.raman", "jonas.weber", "sara.lindgren", "mateo.ruiz", "aisha.bello", "kenji.ito", "lena.fischer", "omar.haddad",
].map((name) => `${name}@corvid.example`);

const ctl = (framework, ref) => `${framework}.ctl.${ref.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
const soc = (ref) => ctl("soc2", ref);
const iso = (ref) => ctl("iso27001", ref);

/** [control, owner, status, notes] */
const CONTROLS = [
  [soc("CC1.1"), "grace", "implemented", "Code of conduct accepted in the HR system at onboarding and every January."],
  [soc("CC1.2"), "ingrid", "implemented", "Security update at every quarterly board meeting; minutes in the board folder."],
  [soc("CC1.3"), "ingrid", "implemented", "Org chart in the HR system; security roles listed in the information security policy."],
  [soc("CC1.4"), "grace", "implemented", "Background checks through the screening provider before production access."],
  [soc("CC1.5"), "grace", "in_progress", "Adding security expectations to the engineering career ladder this quarter."],
  [soc("CC2.1"), "ben", "implemented", "System inventory generated weekly from AWS tags and Terraform state."],
  [soc("CC2.2"), "grace", "implemented", "Annual awareness training plus phishing simulations every quarter."],
  [soc("CC2.3"), "ingrid", "implemented", "security@ inbox and the public trust center; customer notification steps in the incident plan."],
  [soc("CC3.1"), "ingrid", "implemented", ""],
  [soc("CC3.2"), "ingrid", "implemented", "Risk assessment run in September with the leadership team."],
  [soc("CC3.3"), "ingrid", "in_progress", "Insider misuse scenarios to be added to the register."],
  [soc("CC3.4"), "", "not_started", ""],
  [soc("CC4.1"), "amira", "implemented", "Monthly control review in Trust; evidence freshness checked the first Monday of each month."],
  [soc("CC4.2"), "amira", "implemented", ""],
  [soc("CC5.1"), "amira", "implemented", "Every high risk links to its treating controls in the register."],
  [soc("CC5.2"), "ben", "in_progress", "CIS benchmarks for AWS adopted; endpoint baseline still in draft."],
  [soc("CC5.3"), "ingrid", "implemented", ""],
  [soc("CC6.1"), "amira", "implemented", "Okta SSO with phishing-resistant MFA for every production and SaaS system."],
  [soc("CC6.2"), "amira", "implemented", "Access requests through the IT service desk with manager approval."],
  [soc("CC6.3"), "amira", "implemented", "Quarterly access reviews in Trust; offboarding checklist removes access same day."],
  [soc("CC6.4"), "rafael", "not_applicable", ""],
  [soc("CC6.5"), "rafael", "implemented", "Laptops wiped by the device management service before reissue or recycling."],
  [soc("CC6.6"), "ben", "implemented", "Only the load balancer is public; everything else sits in private subnets."],
  [soc("CC6.7"), "ben", "implemented", "TLS 1.2+ everywhere, HSTS on all customer-facing domains."],
  [soc("CC6.8"), "ben", "in_progress", "EDR rolled out to 41 of 48 laptops."],
  [soc("CC7.1"), "ben", "implemented", "Dependency and container scanning on every merge; critical findings fixed within 7 days."],
  [soc("CC7.2"), "ben", "implemented", ""],
  [soc("CC7.3"), "amira", "in_progress", "Triage criteria drafted; on-call rotation starts in December."],
  [soc("CC7.4"), "amira", "implemented", "Incident response plan tested in a tabletop exercise in October."],
  [soc("CC7.5"), "ben", "implemented", "Nightly snapshots; full restore tested in September."],
  [soc("CC8.1"), "rafael", "implemented", "Branch protection requires review and passing CI before deploy."],
  [soc("CC9.1"), "rafael", "not_started", ""],
  [soc("CC9.2"), "ingrid", "implemented", "Vendor inventory and tiering in Trust; critical vendors reviewed yearly."],
  [iso("A.5.1"), "ingrid", "implemented", ""],
  [iso("A.5.9"), "ben", "implemented", ""],
  [iso("A.5.15"), "amira", "implemented", ""],
  [iso("A.5.19"), "ingrid", "implemented", ""],
  [iso("A.5.23"), "ben", "in_progress", ""],
  [iso("A.5.24"), "amira", "implemented", ""],
  [iso("A.5.30"), "", "not_started", ""],
  [iso("A.6.3"), "grace", "implemented", ""],
  [iso("A.8.2"), "amira", "implemented", ""],
  [iso("A.8.5"), "amira", "implemented", ""],
  [iso("A.8.8"), "ben", "implemented", ""],
  [iso("A.8.13"), "ben", "implemented", ""],
  [iso("A.8.15"), "ben", "in_progress", ""],
  [iso("A.8.24"), "ben", "implemented", ""],
  [iso("A.8.32"), "rafael", "implemented", ""],
];

/** [key, title, description, link or text, controls, collected, cadence, added by, review] */
const EVIDENCE = [
  ["mfa", "Okta MFA enforcement policy", "Screenshot and policy export: phishing-resistant MFA required for all users.", "https://okta.corvid.example/admin/policies/mfa", [soc("CC6.1"), iso("A.8.5")], "2026-09-08", "quarterly", "amira", "accepted"],
  ["accessq3", "Q3 production access review", "Signed-off review of AWS, GitHub and Okta admins.", "https://drive.corvid.example/security/access-reviews/2026-q3", [soc("CC6.2"), soc("CC6.3"), iso("A.8.2")], "2026-08-20", "quarterly", "amira", "accepted"],
  ["inventory", "System inventory export", "Weekly export of tagged AWS resources and data stores.", "https://drive.corvid.example/security/inventory/latest.csv", [soc("CC2.1"), iso("A.5.9")], "2026-11-02", "monthly", "ben", "accepted"],
  ["training", "Security awareness completion report", "48 of 48 people completed the 2026 training.", "https://lms.corvid.example/reports/security-2026", [soc("CC2.2"), iso("A.6.3")], "2026-09-30", "annual", "grace", "accepted"],
  ["phish", "Phishing simulation results, September", "Click rate 4%, report rate 61%.", "https://drive.corvid.example/security/phishing/2026-09", [soc("CC2.2")], "2026-09-29", "monthly", "grace", "accepted"],
  ["bgcheck", "Background check log", "Completed checks for every hire since January, before production access.", "https://hr.corvid.example/reports/screening", [soc("CC1.4")], "2026-10-01", "semiannual", "grace", "accepted"],
  ["coc", "Code of conduct acknowledgements", "Export from the HR system: 48 of 48 accepted for 2026.", "https://hr.corvid.example/reports/code-of-conduct-2026", [soc("CC1.1")], "2026-09-15", "annual", "grace", "accepted"],
  ["board", "Board minutes: Q3 security update", "", "https://drive.corvid.example/board/2026-q3-minutes.pdf", [soc("CC1.2")], "2026-10-14", "quarterly", "ingrid", "accepted"],
  ["risk", "2026 risk assessment", "Scored register reviewed with the leadership team.", "https://drive.corvid.example/security/risk-assessment-2026.pdf", [soc("CC3.1"), soc("CC3.2"), soc("CC5.1")], "2026-09-18", "annual", "ingrid", "accepted"],
  ["scans", "Vulnerability scan summary", "No open criticals; two highs within SLA.", "https://security.corvid.example/scans/summary", [soc("CC7.1"), iso("A.8.8")], "2026-10-16", "monthly", "ben", "accepted"],
  ["alerts", "Alerting rules for security events", "Rules for root logins, IAM changes, disabled MFA and impossible travel.", "https://monitoring.corvid.example/alerts/security", [soc("CC7.2"), iso("A.8.15")], "2026-10-05", "quarterly", "ben", "pending"],
  ["tabletop", "Incident response tabletop report", "Ransomware scenario, 9 participants, 6 follow-ups.", "https://drive.corvid.example/security/tabletop-2026-10.pdf", [soc("CC7.4"), iso("A.5.24")], "2026-10-21", "annual", "amira", "accepted"],
  ["restore", "Database restore test", "Full restore of the analytics warehouse to staging in 2h 14m.", "https://drive.corvid.example/security/restore-test-2026-09.pdf", [soc("CC7.5"), iso("A.8.13")], "2026-09-09", "annual", "ben", "accepted"],
  ["branch", "Branch protection settings", "Required reviews: 1. Required checks: build, test, scan. Admins included.", null, [soc("CC8.1"), iso("A.8.32")], "2026-10-28", "semiannual", "rafael", "accepted"],
  ["tls", "TLS configuration report", "A+ on every customer-facing domain.", "https://security.corvid.example/tls/report", [soc("CC6.7"), iso("A.8.24")], "2026-08-24", "quarterly", "ben", "accepted"],
  ["network", "Security group review", "Only ports 443 and 80 (redirect) open to the internet.", "https://security.corvid.example/network/review-2026-10", [soc("CC6.6")], "2026-10-12", "semiannual", "ben", "pending"],
  ["vendors", "Critical vendor reviews 2026", "SOC 2 reports reviewed for AWS, Okta, Snowflake and Stripe.", "https://drive.corvid.example/security/vendors-2026", [soc("CC9.2"), iso("A.5.19")], "2026-10-08", "annual", "ingrid", "accepted"],
  ["disposal", "Device disposal log", "", "https://it.corvid.example/devices/disposal-log", [soc("CC6.5")], "2026-07-01", "quarterly", "rafael", "accepted"],
  ["policyacks", "Policy acknowledgement report", "Exported from Trust.", "https://drive.corvid.example/security/policy-acks", [soc("CC5.3"), iso("A.5.1")], "2026-10-20", "annual", "ingrid", "rejected"],
  ["monitor", "Monthly control review notes", "October review: 3 controls moved to implemented, 2 evidence refreshes scheduled.", "https://drive.corvid.example/security/control-review-2026-10", [soc("CC4.1"), soc("CC4.2")], "2026-10-30", "monthly", "amira", "accepted"],
];

const POLICIES = [
  ["information-security", "Information Security Policy", "ingrid"],
  ["access-control", "Access Control Policy", "amira"],
  ["incident-response", "Incident Response Policy", "amira"],
  ["vendor-management", "Vendor Management Policy", "ingrid"],
  ["acceptable-use", "Acceptable Use Policy", "grace"],
  ["business-continuity", "Business Continuity and Backup Policy", "rafael"],
  ["data-retention", "Data Retention Policy", "ingrid"],
];

// ---------------------------------------------------------------------------- seed

console.log(`Seeding Corvid Analytics (fictional) into emulators for ${gate.projectId}…`);
await wipeEmulators(gate);
const { at, remapTree } = createTimeline(Timestamp);

for (const person of people.values()) {
  await auth.createUser({ uid: person.uid, email: person.email, password: DEMO_PASSWORD, displayName: person.name, emailVerified: true });
}
for (const [key, person] of people) {
  const user = who(key);
  await profiles.syncProfileFromSession(PRODUCT, user);
  await profiles.updateAccountProfile(PRODUCT, user, { title: person.title });
  const photo = demoPhoto("trust", key);
  if (photo) await profiles.setUploadedPhoto(PRODUCT, user, photo);
}
console.log(`  ✓ ${people.size} accounts with profiles and photos`);

const ingrid = who("ingrid");
let tenantId = "";
const act = (key, payload) => trust.runTrustAction(tenantId, who(key), payload);
const ids = {};

await at("2026-09-01T08:40:00Z", "2026-09-01T10:00:00Z", "workspace and team", async () => {
  ({ id: tenantId } = await tenants.createTenant(PRODUCT, ingrid, "Corvid Analytics"));
  for (const key of ["rafael", "amira", "ben", "grace"]) {
    await tenants.addTenantMember(PRODUCT, tenantId, ingrid, { email: mail(key), role: people.get(key).role });
  }
});

await at("2026-09-01T13:00:00Z", null, "frameworks and people in scope", async () => {
  await act("ingrid", { action: "setFrameworks", frameworkIds: ["soc2", "iso27001"] });
  await act("ingrid", { action: "setEmployees", emails: EMPLOYEES });
});

await at("2026-09-02T09:00:00Z", "2026-09-11T16:00:00Z", "owners and status for every control", async () => {
  for (const [controlId, owner, status, notes] of CONTROLS) {
    const naJustification = status === "not_applicable"
      ? "Corvid is fully remote with no offices or data centres. Physical security is inherited from AWS and reviewed through their SOC 2 report."
      : "";
    await act(owner || "ingrid", { action: "updateControl", controlId, ownerEmail: owner ? mail(owner) : "", status, naJustification, notes });
  }
});

await at("2026-09-08T09:00:00Z", "2026-10-30T16:00:00Z", "evidence collected and reviewed", async () => {
  for (const [key, title, description, link, controlIds, collectedAt, cadence, by] of EVIDENCE) {
    const body = link
      ? { kind: "link", url: link, text: "" }
      : { kind: "text", url: "", text: "main: require pull request reviews (1), require status checks (build, test, scan), include administrators, restrict force pushes." };
    ids[key] = (await act(by, { action: "addEvidence", title, description, ...body, controlIds, collectedAt, cadence, expiresAt: "" })).id;
  }
  for (const [key, , , , , , , by, review] of EVIDENCE) {
    if (review === "pending") continue;
    const reviewer = by === "ingrid" ? "rafael" : "ingrid";
    await act(reviewer, {
      action: "reviewEvidence",
      evidenceId: ids[key],
      decision: review,
      note: review === "rejected" ? "This is last year's export. Please attach the October 2026 report from Trust." : "",
    });
  }
});

await at("2026-09-14T09:00:00Z", "2026-10-09T16:00:00Z", "policies drafted, approved and acknowledged", async () => {
  for (const [templateId, title, owner] of POLICIES) {
    ids[templateId] = (await act(owner, { action: "createPolicy", templateId, title, ownerEmail: mail(owner), reviewCadence: "annual" })).id;
  }
  const program = await trust.loadProgram(tenantId);
  const body = (id) => program.policies.find((policy) => policy.id === ids[id]).versions[0].body;
  await act("ingrid", {
    action: "revisePolicy",
    policyId: ids["information-security"],
    body: `${body("information-security")}\n\nScope: all Corvid Analytics employees, contractors and systems that store or process customer data, including the analytics warehouse and the ingestion pipeline.`,
  });
  for (const [templateId] of POLICIES) {
    if (templateId === "data-retention") continue; // still a draft
    const version = templateId === "information-security" ? 2 : 1;
    await act(templateId === "information-security" ? "rafael" : "ingrid", { action: "approvePolicy", policyId: ids[templateId], version });
  }
  for (const key of ["ingrid", "rafael", "amira", "ben", "grace"]) {
    for (const [templateId] of POLICIES) {
      if (templateId === "data-retention") continue;
      if (key === "ben" && templateId === "business-continuity") continue;
      await act(key, { action: "acknowledgePolicy", policyId: ids[templateId] });
    }
  }
  for (const email of EMPLOYEES.slice(0, 6)) {
    for (const [templateId] of POLICIES.slice(0, 5)) {
      await act("ingrid", { action: "recordAcknowledgement", policyId: ids[templateId], email });
    }
  }
});

await at("2026-09-21T09:00:00Z", "2026-10-02T16:00:00Z", "risk register and vendors", async () => {
  for (const [title, description, likelihood, impact, treatment, treatmentPlan, owner, controls] of [
    ["Compromised engineer credentials", "Stolen session or phished credentials give access to production.", 3, 5, "mitigate", "Phishing-resistant MFA, short session lifetimes and alerting on unusual logins.", "amira", [soc("CC6.1"), soc("CC7.2")]],
    ["Customer data in analytics exports", "Customers export raw event data that may contain personal data they did not intend to send.", 3, 4, "mitigate", "PII detection on ingestion and per-project export controls.", "rafael", [soc("CC6.7")]],
    ["Warehouse provider outage", "A multi-hour Snowflake outage stops dashboards for every customer.", 2, 4, "transfer", "Contractual SLA with credits; cached dashboards keep working read-only.", "ben", [soc("CC9.1")]],
    ["Lost or stolen laptop", "A laptop with source code or support exports is lost.", 3, 3, "mitigate", "Full-disk encryption, remote wipe and EDR on every device.", "rafael", [soc("CC6.8")]],
    ["Unreviewed infrastructure changes", "Console changes bypass review and drift from Terraform.", 2, 3, "mitigate", "Read-only console for engineers; drift detection runs nightly.", "ben", [soc("CC8.1")]],
    ["Key person dependency in on-call", "Two engineers handle most incidents.", 3, 2, "accept", "Accepted until the on-call rotation expands in December. Approved by Rafael Duarte, CTO.", "rafael", []],
    ["Insider misuse of support access", "Support staff can view customer dashboards.", 2, 4, "mitigate", "", "", []],
  ]) {
    await act(owner || "ingrid", { action: "saveRisk", title, description, likelihood, impact, treatment, treatmentPlan, ownerEmail: owner ? mail(owner) : "", status: "open", controlIds: controls });
  }
  for (const [name, service, tier, dataAccess, owner, lastReviewedAt, reviewCadence] of [
    ["Amazon Web Services", "Cloud hosting", "critical", "All production data", "ben", "2026-10-08", "annual"],
    ["Snowflake", "Data warehouse", "critical", "Customer event data", "ben", "2026-10-08", "annual"],
    ["Okta", "Identity provider", "critical", "Employee identities", "amira", "2026-10-08", "annual"],
    ["Stripe", "Payments", "high", "Billing contacts, card tokens", "rafael", "2026-10-08", "annual"],
    ["GitHub", "Source control and CI", "high", "Source code", "ben", "2025-09-30", "annual"],
    ["Google Workspace", "Email and documents", "high", "Internal documents", "grace", "2026-03-12", "annual"],
    ["Intercom", "Customer support", "medium", "Customer contact details", "grace", "2026-06-02", "annual"],
    ["Datadog", "Monitoring", "medium", "Logs with IP addresses", "ben", "", "annual"],
  ]) {
    await act("ingrid", { action: "saveVendor", name, service, tier, dataAccess, ownerEmail: mail(owner), lastReviewedAt, reviewCadence });
  }
});

await at("2026-10-01T09:00:00Z", "2026-10-24T16:00:00Z", "internal readiness review and findings", async () => {
  ids.internal = (await act("ingrid", { action: "saveAuditPeriod", name: "Internal readiness review", frameworkId: "soc2", startDate: "2026-10-01", endDate: "2026-10-24", auditorFirm: "", status: "closed" })).id;
  await act("amira", {
    action: "saveFinding",
    title: "EDR missing on seven laptops",
    description: "Seven contractor laptops enrolled before September have no endpoint protection agent.",
    severity: "high",
    status: "in_remediation",
    controlIds: [soc("CC6.8")],
    auditPeriodId: ids.internal,
    ownerEmail: mail("ben"),
    dueDate: "2026-11-28",
    remediation: "Agents pushed through device management; four of seven confirmed.",
  });
  await act("ingrid", {
    action: "saveFinding",
    title: "No written business continuity test",
    description: "The continuity plan exists but hasn't been exercised this year.",
    severity: "medium",
    status: "open",
    controlIds: [soc("CC9.1"), iso("A.5.30")],
    auditPeriodId: ids.internal,
    ownerEmail: mail("rafael"),
    dueDate: "2026-11-10",
    remediation: "",
  });
});

await at("2026-10-26T09:00:00Z", "2026-11-06T16:00:00Z", "quarterly access reviews", async () => {
  const systems = [
    ["AWS production", "Production accounts and the data warehouse VPC.", "ben", [["rafael", "admin"], ["ben", "admin"], ["amira", "security-audit"], ["theo.nguyen", "read-only"], ["jonas.weber", "developer"]]],
    ["Okta", "Identity provider for every system.", "amira", [["amira", "super admin"], ["ingrid", "org admin"], ["grace", "help desk"]]],
    ["GitHub", "Source code and CI.", "ben", [["rafael", "owner"], ["ben", "admin"], ["amira", "member"], ["theo.nguyen", "member"], ["jonas.weber", "member"], ["kenji.ito", "member"]]],
    ["Snowflake", "Customer event warehouse.", "ben", [["ben", "accountadmin"], ["priya.raman", "analyst"], ["mateo.ruiz", "analyst"]]],
  ];
  for (const [name, description, owner, users] of systems) {
    ids[name] = (await act("amira", {
      action: "saveSystem",
      name,
      description,
      ownerEmail: mail(owner),
      users: users.map(([user, role]) => ({ email: people.has(user) ? mail(user) : `${user}@corvid.example`, role })),
    })).id;
  }
  await act("amira", { action: "signOffAccessReview", systemId: ids.Okta, removeEmails: [], notes: "All three still need admin access." });
  await act("ben", { action: "signOffAccessReview", systemId: ids.GitHub, removeEmails: ["kenji.ito@corvid.example"], notes: "Kenji moved to the data team; ticket IT-482 removed his access." });
});

await at("2026-11-09T09:00:00Z", "2026-11-12T16:00:00Z", "SOC 2 audit planned, auditor invited, trust center published", async () => {
  ids.audit = (await act("ingrid", { action: "saveAuditPeriod", name: "SOC 2 Type I", frameworkId: "soc2", startDate: "2026-12-01", endDate: "2027-01-29", auditorFirm: "Bramble & Co. Assurance", status: "planned" })).id;
  await tenants.addTenantMember(PRODUCT, tenantId, ingrid, { email: mail("lucas"), role: "viewer" });
  await act("ingrid", { action: "grantAuditorAccess", auditPeriodId: ids.audit, email: mail("lucas"), expiresAt: "2027-02-15" });
  await team.createInvitation(PRODUCT, tenantId, ingrid, { email: "nina.patel@brambleassurance.example", role: "viewer" }, (token) => `http://localhost/apps/trust/invite/${token}`);
  await act("ingrid", { action: "grantAuditorAccess", auditPeriodId: ids.audit, email: "nina.patel@brambleassurance.example", expiresAt: "2027-02-15" });
  await act("ingrid", {
    action: "saveTrustCenter",
    published: true,
    displayName: "Corvid Analytics",
    headline: "Corvid stores product analytics for 400+ companies. We run a security program mapped to SOC 2 and ISO 27001, with our SOC 2 Type I audit starting in December 2026.",
    contactEmail: "security@corvid.example",
    showFrameworks: true,
    showReadiness: true,
    showControlCategories: true,
    publishedPolicyIds: [ids["information-security"], ids["access-control"], ids["incident-response"], ids["vendor-management"], ids["business-continuity"]],
  });
  await act("amira", { action: "addEvidence", title: "Okta admin access review, Q4", description: "Three admins confirmed.", kind: "link", url: "https://drive.corvid.example/security/access-reviews/2026-q4-okta", text: "", controlIds: [soc("CC6.3"), iso("A.8.2")], collectedAt: "2026-11-11", cadence: "quarterly", expiresAt: "" });
});

const counter = await remapTree(tenants.tenantRef(PRODUCT, tenantId));
console.log(`  ✓ history spread over Sep–Nov 2026 (${counter.count} documents)`);

console.log(`
Corvid Analytics is ready (fictional demo data, emulators only).
  workspace:     ${tenantId}
  trust center:  /apps/trust/t/${tenantId}
  sign in as:    ingrid@corvid.example (owner) · password: DEMO_PASSWORD in this script
  auditor:       lucas.moreau@brambleassurance.example (viewer, access until 2027-02-15)
`);
process.exit(0);
