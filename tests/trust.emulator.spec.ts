import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Golden workflow for SaaSassin Trust against the Firestore EMULATOR only. Never production.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Refusing to run: FIRESTORE_EMULATOR_HOST is not set. Run this spec through firebase emulators:exec.");
}
process.env.FIREBASE_PROJECT_ID = "demo-saasassin";
process.env.GCLOUD_PROJECT = "demo-saasassin";

const app = initializeApp({ projectId: "demo-saasassin" }, "trust-golden-path");
const db: Firestore = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true }); // mirrors src/lib/firebase/admin.ts

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => db,
  getAdminAuth: () => null,
  isFirebaseConfigured: () => true,
}));

const { FleetError } = await import("@/lib/fleet/platform/session");
const tenants = await import("@/lib/fleet/platform/tenants");
const trust = await import("@/lib/trust/data");
const { getPublicTrustCenter } = await import("@/lib/trust/public");
const { getFramework } = await import("@/lib/trust/frameworks");

const owner = { uid: "trust-owner", email: "owner@acme.test", name: "Olivia Owner" };
const auditor = { uid: "trust-auditor", email: "auditor@audit.test", name: "Avery Auditor" };
const outsider = { uid: "trust-outsider", email: "outsider@other.test", name: "Oscar Outsider" };

const soc2 = getFramework("soc2")!;
const mfa = soc2.controls.find((control) => control.title === "Single sign-on and MFA")!;
const conduct = soc2.controls.find((control) => control.title === "Code of conduct")!;

let tenantA = "";
let tenantB = "";

async function expectFleetError(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (cause: unknown) => cause);
  expect(error).toBeInstanceOf(FleetError);
  expect((error as InstanceType<typeof FleetError>).status).toBe(status);
}

const act = (user: typeof owner, payload: Record<string, unknown>, tenantId = tenantA) =>
  trust.runTrustAction(tenantId, user, payload) as Promise<{ ok: boolean; id?: string }>;

beforeAll(async () => {
  tenantA = (await tenants.createTenant(trust.TRUST, owner, "Acme Readiness")).id;
  tenantB = (await tenants.createTenant(trust.TRUST, outsider, "Other Co")).id;
  // addTenantMember needs Firebase Auth; write the viewer membership the same way it does.
  const base = tenants.tenantRef(trust.TRUST, tenantA);
  await base.collection("memberships").doc(auditor.uid).set({ ...auditor, role: "viewer", status: "active" });
  await db.doc(`products/trust/users/${auditor.uid}/tenants/${tenantA}`).set({ name: "Acme Readiness", role: "viewer" });
});

afterAll(async () => {
  await Promise.all(getApps().map((existing) => deleteApp(existing)));
});

describe("trust golden workflow (Firestore emulator)", () => {
  it("selects a framework and persists owners and status", async () => {
    await act(owner, { action: "setFrameworks", frameworkIds: ["soc2"] });
    await act(owner, { action: "updateControl", controlId: mfa.id, ownerEmail: owner.email, status: "implemented" });
    await act(owner, { action: "updateControl", controlId: conduct.id, ownerEmail: owner.email, status: "implemented" });
    await expectFleetError(
      act(owner, { action: "updateControl", controlId: soc2.controls[20].id, status: "not_applicable", naJustification: "no" }),
      400,
    );
    const snapshot = await trust.getTrustSnapshot(tenantA, owner);
    expect(snapshot.settings.frameworkIds).toEqual(["soc2"]);
    expect(snapshot.controls).toHaveLength(soc2.controls.length);
    // Implemented without evidence is not counted as implemented.
    expect(snapshot.controls.find((control) => control.id === mfa.id)?.status).toBe("needs_evidence");
    expect(snapshot.readiness.controls.implemented).toBe(0);
  });

  it("attaches evidence, derives status from freshness, and records review provenance", async () => {
    const fresh = await act(owner, {
      action: "addEvidence",
      title: "IdP MFA enforcement",
      kind: "link",
      url: "https://idp.example.test/policies/mfa",
      controlIds: [mfa.id],
      collectedAt: new Date().toISOString().slice(0, 10),
      cadence: "quarterly",
    });
    await act(owner, {
      action: "addEvidence",
      title: "2024 conduct acknowledgements",
      kind: "text",
      text: "All staff signed in January 2024.",
      controlIds: [conduct.id],
      collectedAt: "2024-01-15",
      cadence: "annual",
    });
    await expectFleetError(act(owner, { action: "addEvidence", title: "Bad link", kind: "link", url: "javascript:alert(1)", controlIds: [mfa.id], collectedAt: "2026-01-01", cadence: "annual" }), 400);
    await act(owner, { action: "reviewEvidence", evidenceId: fresh.id, decision: "accepted" });

    const snapshot = await trust.getTrustSnapshot(tenantA, owner);
    expect(snapshot.evidence).toHaveLength(2);
    expect(snapshot.controls.find((control) => control.id === mfa.id)?.status).toBe("implemented");
    expect(snapshot.controls.find((control) => control.id === conduct.id)?.status).toBe("needs_evidence");
    const reviewed = snapshot.evidence.find((item) => item.id === fresh.id)!;
    expect(reviewed).toMatchObject({ reviewStatus: "accepted", reviewedBy: owner.email, createdBy: owner.email });
    expect(snapshot.readiness.controls.implemented).toBe(1);
    expect(snapshot.readiness.evidence).toMatchObject({ total: 2, expired: 1 });
    expect(snapshot.tasks.some((task) => task.id === `control-evidence:${conduct.id}`)).toBe(true);
  });

  it("versions, approves and collects acknowledgements for a policy", async () => {
    const created = await act(owner, { action: "createPolicy", templateId: "access-control", title: "Access control policy", ownerEmail: owner.email });
    const before = (await trust.getTrustSnapshot(tenantA, owner)).policies.find((policy) => policy.id === created.id)!;
    expect(before.status).toBe("draft");
    await act(owner, { action: "revisePolicy", policyId: created.id, body: `${before.versions[0].body}\n\nAdded: quarterly reviews for production.` });
    await expectFleetError(act(auditor, { action: "approvePolicy", policyId: created.id, version: 2 }), 403);
    await expectFleetError(act(owner, { action: "approvePolicy", policyId: created.id, version: 1 }), 409);
    await act(owner, { action: "approvePolicy", policyId: created.id, version: 2 });
    await act(auditor, { action: "acknowledgePolicy", policyId: created.id });
    await act(owner, { action: "setEmployees", emails: ["Sam@Acme.test"] });
    await act(owner, { action: "recordAcknowledgement", policyId: created.id, email: "sam@acme.test" });

    const after = (await trust.getTrustSnapshot(tenantA, owner)).policies.find((policy) => policy.id === created.id)!;
    expect(after.status).toBe("approved");
    expect(after.versions.map((version) => version.version)).toEqual([1, 2]);
    expect(after.versions[0].approvedAt).toBeNull();
    expect(after.acknowledgements.map((entry) => entry.email).sort()).toEqual([auditor.email, "sam@acme.test"]);
    expect(after.acknowledgements.find((entry) => entry.email === "sam@acme.test")?.recordedBy).toBe(owner.email);
  });

  it("scores risks and tracks vendors", async () => {
    await expectFleetError(act(owner, { action: "saveRisk", title: "Accepted without reason", likelihood: 2, impact: 2, treatment: "accept" }), 400);
    const risk = await act(owner, { action: "saveRisk", title: "Stolen laptop", likelihood: 4, impact: 4, treatment: "mitigate", controlIds: [mfa.id] });
    await act(owner, { action: "saveVendor", name: "Cloud host", tier: "critical", lastReviewedAt: "2024-01-01", reviewCadence: "annual" });
    const snapshot = await trust.getTrustSnapshot(tenantA, owner);
    expect(snapshot.risks.find((entry) => entry.id === risk.id)).toMatchObject({ score: 16, level: "critical" });
    expect(snapshot.vendors[0]).toMatchObject({ name: "Cloud host", overdue: true });
    expect(snapshot.readiness.risks.highOrCritical).toBe(1);
  });

  it("publishes only what admins selected to the public trust center", async () => {
    expect(await getPublicTrustCenter(tenantA)).toBeNull();
    const policy = (await trust.getTrustSnapshot(tenantA, owner)).policies[0];
    await expectFleetError(
      act(auditor, { action: "saveTrustCenter", published: true, showFrameworks: true, showReadiness: true, showControlCategories: false }),
      403,
    );
    await act(owner, {
      action: "saveTrustCenter",
      published: true,
      displayName: "Acme",
      contactEmail: "security@acme.test",
      showFrameworks: true,
      showReadiness: true,
      showControlCategories: false,
      publishedPolicyIds: [policy.id],
    });
    const center = await getPublicTrustCenter(tenantA);
    expect(center).not.toBeNull();
    expect(center!.policies).toEqual([expect.objectContaining({ title: "Access control policy", version: 2 })]);
    expect(center!.categories).toBeNull();
    const serialized = JSON.stringify(center);
    for (const secret of ["Stolen laptop", "Cloud host", "idp.example.test", owner.email, "quarterly reviews for production"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(await getPublicTrustCenter(tenantB)).toBeNull();
    expect(await getPublicTrustCenter("../../etc")).toBeNull();
  });

  it("denies writes to viewers and all access to non-members, and isolates tenants", async () => {
    await expectFleetError(act(auditor, { action: "addEvidence", title: "Auditor note", kind: "text", text: "Looks fine", controlIds: [mfa.id], collectedAt: "2026-01-01", cadence: "annual" }), 403);
    await expectFleetError(act(auditor, { action: "updateControl", controlId: mfa.id, status: "not_started" }), 403);
    await expectFleetError(trust.getTrustSnapshot(tenantA, outsider), 404);
    await expectFleetError(act(outsider, { action: "setFrameworks", frameworkIds: ["iso27001"] }), 404);
    await expectFleetError(trust.buildTrustExport(tenantA, outsider, null), 404);

    // The auditor can read tenant A but not tenant B.
    expect((await trust.getTrustSnapshot(tenantA, auditor)).role).toBe("viewer");
    await expectFleetError(trust.getTrustSnapshot(tenantB, auditor), 404);

    const other = await trust.getTrustSnapshot(tenantB, outsider);
    expect(other.evidence).toHaveLength(0);
    expect(other.policies).toHaveLength(0);
    expect(other.risks).toHaveLength(0);
    expect(other.vendors).toHaveLength(0);
    expect(other.settings.frameworkIds).toEqual([]);
  });

  it("appends an audit event for every mutation", async () => {
    const events = await tenants.listAuditEvents(trust.TRUST, tenantA, 200);
    const actions = events.map((event) => event.action);
    for (const expected of [
      "tenant.created",
      "program.frameworks_selected",
      "control.updated",
      "evidence.added",
      "evidence.accepted",
      "policy.created",
      "policy.revised",
      "policy.approved",
      "policy.acknowledged",
      "policy.acknowledgement_recorded",
      "program.people_in_scope_updated",
      "risk.created",
      "vendor.created",
      "trust_center.updated",
    ]) {
      expect(actions).toContain(expected);
    }
    // Rejected attempts leave no trace of a write.
    expect(actions.filter((action) => action === "policy.approved")).toHaveLength(1);
    const otherActions = (await tenants.listAuditEvents(trust.TRUST, tenantB, 200)).map((event) => event.action);
    expect(otherActions).toEqual(["tenant.created"]);
  });

  it("exports every record as versioned JSON and builds the evidence package", async () => {
    const exported = await trust.buildTrustExport(tenantA, auditor, null);
    expect(exported.kind).toBe("workspace");
    const body = exported.body as {
      manifest: { schema: string; files: Array<{ path: string; records: number }> };
      files: Record<string, { schema: string; records: Array<Record<string, unknown>> }>;
    };
    expect(body.manifest.schema).toBe("net.saasassin.workspace-export");
    const counts = Object.fromEntries(body.manifest.files.map((file) => [file.path, file.records]));
    expect(counts).toMatchObject({
      "program.json": 1,
      "controls.json": soc2.controls.length,
      "evidence.json": 2,
      "policies.json": 1,
      "risks.json": 1,
      "vendors.json": 1,
      "members.json": 2,
    });
    expect(counts["audit-events.json"]).toBeGreaterThanOrEqual(14);
    for (const [path, file] of Object.entries(body.files)) {
      expect(file.records.length).toBe(counts[path]);
      expect(file.schema).toMatch(/@1\.0\.0$/);
    }
    // Timestamps are portable ISO strings, not Firestore objects.
    expect(typeof body.files["audit-events.json"].records[0].occurredAt).toBe("string");

    const pack = await trust.buildTrustExport(tenantA, owner, "soc2");
    const packBody = pack.body as { requirements: Array<{ ref: string; controls: Array<{ id: string; status: string; evidence: unknown[] }> }> };
    expect(packBody.requirements).toHaveLength(soc2.requirements.length);
    const cc61 = packBody.requirements.find((requirement) => requirement.ref === "CC6.1")!;
    expect(cc61.controls[0]).toMatchObject({ id: mfa.id, status: "implemented" });
    expect(cc61.controls[0].evidence).toHaveLength(1);
    await expectFleetError(trust.buildTrustExport(tenantA, owner, "iso27001"), 400);
  });

  it("tracks findings and enforces auditor access expiry server-side", async () => {
    const period = await act(owner, { action: "saveAuditPeriod", name: "SOC 2 Type II 2027", frameworkId: "soc2", startDate: "2027-01-01", endDate: "2027-06-30" });
    await expectFleetError(act(owner, { action: "saveAuditPeriod", name: "Backwards", frameworkId: "soc2", startDate: "2027-06-30", endDate: "2027-01-01" }), 400);
    await expectFleetError(act(owner, { action: "saveAuditPeriod", name: "Not in program", frameworkId: "iso27001", startDate: "2027-01-01", endDate: "2027-06-30" }), 400);
    await expectFleetError(act(owner, { action: "grantAuditorAccess", auditPeriodId: period.id, email: auditor.email, expiresAt: "2020-01-01" }), 400);
    await expectFleetError(act(auditor, { action: "grantAuditorAccess", auditPeriodId: period.id, email: auditor.email, expiresAt: "2099-01-01" }), 403);
    await act(owner, { action: "grantAuditorAccess", auditPeriodId: period.id, email: auditor.email, expiresAt: "2099-01-01" });
    expect((await trust.getTrustSnapshot(tenantA, auditor)).auditPeriods[0].auditors).toEqual([
      expect.objectContaining({ email: auditor.email, expiresAt: "2099-01-01", grantedBy: owner.email }),
    ]);

    const finding = await act(owner, {
      action: "saveFinding",
      title: "Two leavers kept SSO access",
      severity: "high",
      controlIds: [mfa.id],
      auditPeriodId: period.id,
      dueDate: "2025-01-31",
    });
    await expectFleetError(act(auditor, { action: "saveFinding", title: "Auditor cannot write", severity: "low" }), 403);
    await expectFleetError(act(owner, { action: "saveFinding", findingId: finding.id, title: "Two leavers kept SSO access", severity: "high", status: "risk_accepted" }), 400);
    let snapshot = await trust.getTrustSnapshot(tenantA, owner);
    expect(snapshot.findings[0]).toMatchObject({ id: finding.id, status: "open", overdue: true, createdBy: owner.email });
    expect(snapshot.tasks.some((task) => task.id === `finding-overdue:${finding.id}`)).toBe(true);
    await act(owner, { action: "saveFinding", findingId: finding.id, title: "Two leavers kept SSO access", severity: "high", status: "resolved", controlIds: [mfa.id], remediation: "Removed access; added offboarding check." });
    snapshot = await trust.getTrustSnapshot(tenantA, owner);
    expect(snapshot.findings[0]).toMatchObject({ status: "resolved", overdue: false });
    const pack = (await trust.buildTrustExport(tenantA, owner, "soc2")).body as { requirements: Array<{ ref: string; controls: Array<{ findings: unknown[] }> }> };
    expect(pack.requirements.find((requirement) => requirement.ref === "CC6.1")!.controls[0].findings).toHaveLength(1);

    // Revoking ends access immediately for every read and write path.
    await act(owner, { action: "revokeAuditorAccess", auditPeriodId: period.id, email: auditor.email });
    await expectFleetError(trust.getTrustSnapshot(tenantA, auditor), 403);
    await expectFleetError(trust.buildTrustExport(tenantA, auditor, null), 403);
    await expectFleetError(act(auditor, { action: "acknowledgePolicy", policyId: snapshot.policies[0].id }), 403);
    // Owners are unaffected, and the trail is in the audit log.
    expect((await trust.getTrustSnapshot(tenantA, owner)).role).toBe("owner");
    const actions = (await tenants.listAuditEvents(trust.TRUST, tenantA, 300)).map((event) => event.action);
    for (const expected of ["audit_period.created", "auditor_access.granted", "auditor_access.revoked", "finding.created", "finding.updated"]) {
      expect(actions).toContain(expected);
    }
  });

  it("previews and applies a control library migration with an audit trail", async () => {
    const fresh = await trust.getTrustSnapshot(tenantA, owner);
    expect(fresh.libraryMigration.upToDate).toBe(true);
    // Simulate a program adopted on an older library that lacked one control and had one since retired.
    const all = soc2.controls.map((control) => control.id);
    await db.doc(`products/trust/tenants/${tenantA}/settings/program`).set(
      { libraryVersion: "2026.09.0", adoptedControlIds: [...all.filter((controlId) => controlId !== conduct.id), "soc2.ctl.retired"] },
      { merge: true },
    );
    const pinned = await trust.getTrustSnapshot(tenantA, owner);
    expect(pinned.controls).toHaveLength(all.length - 1);
    expect(pinned.libraryMigration).toMatchObject({ fromVersion: "2026.09.0", upToDate: false });
    expect(pinned.libraryMigration.added.map((control) => control.id)).toEqual([conduct.id]);
    expect(pinned.libraryMigration.removed.map((control) => control.id)).toEqual(["soc2.ctl.retired"]);

    await expectFleetError(act(owner, { action: "applyLibraryMigration", toVersion: "1999.01.0" }), 409);
    await act(owner, { action: "applyLibraryMigration", toVersion: pinned.libraryMigration.toVersion });
    const migrated = await trust.getTrustSnapshot(tenantA, owner);
    expect(migrated.controls).toHaveLength(all.length);
    expect(migrated.libraryMigration.upToDate).toBe(true);
    // Stored control state survives the migration.
    expect(migrated.controls.find((control) => control.id === conduct.id)?.ownerEmail).toBe(owner.email);
    const event = (await tenants.listAuditEvents(trust.TRUST, tenantA, 300)).find((entry) => entry.action === "program.library_migrated");
    expect(event?.details).toMatchObject({ fromVersion: "2026.09.0", added: [conduct.id], removed: ["soc2.ctl.retired"] });
  });
});
