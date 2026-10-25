import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Never touch production: this spec only runs inside `firebase emulators:exec`.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("research.emulator.spec.ts must run against the Firestore emulator (FIRESTORE_EMULATOR_HOST is not set).");
}
process.env.FIREBASE_PROJECT_ID = "demo-saasassin";

const app = initializeApp({ projectId: "demo-saasassin" }, "research-golden-path");
const db: Firestore = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => db,
  getAdminAuth: () => null,
  isFirebaseConfigured: () => true,
}));

const tenants = await import("@/lib/fleet/platform/tenants");
const { FleetError } = await import("@/lib/fleet/platform/session");
const research = await import("@/lib/research/data");
const { actionSchema } = await import("@/lib/research/model");
const { ZodError } = await import("zod");

const owner = { uid: "owner-1", email: "owner@example.com", name: "Olivia Owner" };
const researcher = { uid: "researcher-1", email: "res@example.com", name: "Rae Researcher" };
const viewer = { uid: "viewer-1", email: "viewer@example.com", name: "Vic Viewer" };
const outsider = { uid: "outsider-1", email: "outsider@example.com", name: "Otto Outsider" };

const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
<v Interviewer>How do you store research today?</v>

00:00:05.000 --> 00:00:09.000
<v Maya Chen>In a spreadsheet nobody trusts. Call me at 555-0100 about it.

00:00:10.000 --> 00:00:14.000
<v Maya Chen>We lose the quotes when people leave.`;

const asOwner = { uid: owner.uid, role: "owner" };
let tenantId = "";
let projectId = "";
let sourceId = "";
let otherTenantId = "";

/** Mirrors fleetApiError: FleetError keeps its status, a ZodError becomes a 400. */
async function expectFleetError(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (error instanceof ZodError) {
    expect(status).toBe(400);
    return;
  }
  expect(error).toBeInstanceOf(FleetError);
  expect((error as InstanceType<typeof FleetError>).status).toBe(status);
}

async function grant(user: typeof owner, role: string) {
  await db.doc(`products/research/tenants/${tenantId}/memberships/${user.uid}`).set({ uid: user.uid, email: user.email, name: user.name, role, status: "active" });
}

/** Same sequence as POST /api/research/tenants/:t/projects/:p — membership, role, zod, then the action. */
async function act(user: typeof owner, input: unknown) {
  const { role } = await research.requireResearchMember(tenantId, user, "edit");
  return research.applyResearchAction(tenantId, projectId, user, role, actionSchema.parse(input));
}

beforeAll(async () => {
  const tenant = await tenants.createTenant("research", owner, "Acme Research");
  tenantId = tenant.id;
  await grant(researcher, "member");
  await grant(viewer, "viewer");
  otherTenantId = (await tenants.createTenant("research", outsider, "Rival Research")).id;
});

afterAll(async () => {
  await Promise.all(getApps().map((existing) => deleteApp(existing)));
});

describe("research golden path against Firestore", () => {
  it("creates a project and an interview with consent metadata that read back", async () => {
    projectId = (await research.createProject(tenantId, owner, { name: "Onboarding study", description: "Why teams stall" })).id;
    const created = await act(owner, {
      type: "source.create",
      title: "Interview — Maya",
      fileName: "maya.vtt",
      format: "auto",
      content: VTT,
      participant: { name: "Maya Chen", email: "", company: "Acme" },
      consent: { status: "granted", capturedOn: "2026-10-01", retentionUntil: "2020-01-01", notes: "" },
    });
    sourceId = String(created.sourceId);
    expect(created.segments).toBe(3);
    const snapshot = await research.loadProjectSnapshot(tenantId, projectId, asOwner);
    expect(snapshot.project.name).toBe("Onboarding study");
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.sources[0]).toMatchObject({ title: "Interview — Maya", format: "vtt", consent: { status: "granted", retentionUntil: "2020-01-01" } });
    expect(snapshot.sources[0].segments[1]).toMatchObject({ speaker: "Maya Chen", startMs: 5000 });
    expect(typeof snapshot.sources[0].createdAt).toBe("string");
    expect("originalText" in snapshot.sources[0]).toBe(false);
  });

  it("enforces transcript size limits", async () => {
    const base = { type: "source.create" as const, title: "Huge", fileName: "", format: "plain" as const, participant: { name: "P", email: "", company: "" }, consent: { status: "granted" as const, capturedOn: "", retentionUntil: "", notes: "" } };
    await expectFleetError(act(owner, { ...base, content: "A: " + "x".repeat(400_001) }), 400);
    // 3-byte characters stay under the character cap but exceed the Firestore document byte budget.
    await expectFleetError(act(owner, { ...base, content: "A: " + "日".repeat(320_000) }), 400);
    await expectFleetError(act(owner, { ...base, content: "\n\n  \n" }), 400);
  });

  it("re-validates highlight spans server-side and re-anchors them after correction", async () => {
    const snapshot = await research.loadProjectSnapshot(tenantId, projectId, asOwner);
    const segment = snapshot.sources[0].segments[2];
    const start = segment.text.indexOf("lose the quotes");
    await expectFleetError(act(owner, { type: "highlight.create", sourceId, segmentId: segment.id, start: 0, end: segment.text.length + 5, tags: [] }), 400);
    await expectFleetError(act(owner, { type: "highlight.create", sourceId, segmentId: segment.id, start: 2, end: 3, tags: [] }), 400);
    await expectFleetError(act(owner, { type: "highlight.create", sourceId, segmentId: "seg-missing", start: 0, end: 2, tags: [] }), 404);
    await expectFleetError(act(owner, { type: "highlight.create", sourceId: "nope", segmentId: segment.id, start: 0, end: 2, tags: [] }), 404);
    const created = await act(researcher, { type: "highlight.create", sourceId, segmentId: segment.id, start, end: start + 15, tags: ["knowledge-loss"], note: "core" });
    await act(owner, { type: "segment.update", sourceId, segmentId: segment.id, speaker: "Maya C.", text: `Honestly, ${segment.text}` });
    const after = await research.loadProjectSnapshot(tenantId, projectId, asOwner);
    const highlight = after.highlights.find((entry) => entry.id === created.highlightId)!;
    const corrected = after.sources[0].segments[2];
    expect(corrected.speaker).toBe("Maya C.");
    expect(corrected.text.slice(highlight.start, highlight.end)).toBe("lose the quotes");
    expect(highlight).toMatchObject({ quote: "lose the quotes", stale: false, tags: ["knowledge-loss"] });
  });

  it("requires evidence for insights and links them to highlights", async () => {
    const snapshot = await research.loadProjectSnapshot(tenantId, projectId, asOwner);
    await expectFleetError(act(owner, { type: "insight.create", title: "Bogus", highlightIds: ["missing"] }), 400);
    const theme = await act(owner, { type: "theme.create", name: "Trust" });
    const insight = await act(owner, { type: "insight.create", title: "Teams lose quotes", body: "Evidence leaves with people.", highlightIds: [snapshot.highlights[0].id], themeId: String(theme.themeId) });
    const after = await research.loadProjectSnapshot(tenantId, projectId, asOwner);
    expect(after.insights.find((entry) => entry.id === insight.insightId)).toMatchObject({ highlightIds: [snapshot.highlights[0].id], themeId: theme.themeId });
  });

  it("redacts a span, rewrites overlapping highlights and drops the stored original", async () => {
    const before = await research.loadProjectSnapshot(tenantId, projectId, asOwner);
    const segment = before.sources[0].segments[1];
    const start = segment.text.indexOf("555-0100");
    const overlap = await act(owner, { type: "highlight.create", sourceId, segmentId: segment.id, start: 0, end: start + 8, tags: ["contact"] });
    const [withOriginal] = await research.loadSourcesWithOriginals(tenantId, projectId);
    expect(withOriginal.originalText).toContain("555-0100");
    await act(owner, { type: "segment.redact", sourceId, segmentId: segment.id, start, end: start + 8, reason: "Phone number" });
    const after = await research.loadProjectSnapshot(tenantId, projectId, asOwner);
    expect(after.sources[0].segments[1].text).toContain("[redacted]");
    expect(after.sources[0].segments[1].text).not.toContain("555-0100");
    expect(after.sources[0].redactionCount).toBe(1);
    const rewritten = after.highlights.find((entry) => entry.id === overlap.highlightId)!;
    expect(rewritten.redacted).toBe(true);
    expect(rewritten.quote).not.toContain("555-0100");
    const [stored] = await research.loadSourcesWithOriginals(tenantId, projectId);
    expect(stored.originalText ?? null).toBeNull();
    const audit = await tenants.listAuditEvents("research", tenantId, 100);
    const event = audit.find((entry) => entry.action === "segment.redacted")!;
    expect(event.details).toMatchObject({ reason: "Phone number", removedCharacters: 8 });
    expect(JSON.stringify(event)).not.toContain("555-0100");
  });

  it("lets viewers read and search but denies every write with 403", async () => {
    const { role } = await research.requireResearchMember(tenantId, viewer);
    expect(role).toBe("viewer");
    expect((await research.loadProjectSnapshot(tenantId, projectId, asOwner)).sources).toHaveLength(1);
    await expectFleetError(research.requireResearchMember(tenantId, viewer, "edit"), 403);
    await expectFleetError(act(viewer, { type: "theme.create", name: "Nope" }), 403);
    await expectFleetError(research.applyResearchAction(tenantId, projectId, viewer, "viewer", actionSchema.parse({ type: "theme.create", name: "Nope" })), 403);
    await expectFleetError(research.requireResearchMember(tenantId, researcher, "manage"), 403);
    await expectFleetError(act(researcher, { type: "source.delete", sourceId, reason: "test" }), 403);
  });

  it("isolates tenants: non-members get 404 and another tenant cannot reach this project's data", async () => {
    await expectFleetError(research.requireResearchMember(tenantId, outsider), 404);
    await research.requireResearchMember(otherTenantId, outsider);
    // Even with a valid membership elsewhere, the project id does not resolve inside another tenant.
    await expectFleetError(research.searchProject(otherTenantId, projectId, "quotes", { uid: outsider.uid, role: "owner" }), 404);
    await expectFleetError(research.loadProjectSnapshot(otherTenantId, projectId, { uid: outsider.uid, role: "owner" }), 404);
    expect(await research.listProjects(otherTenantId)).toEqual([]);
    const otherProject = (await research.createProject(otherTenantId, outsider, { name: "Rival", description: "" })).id;
    const results = await research.searchProject(otherTenantId, otherProject, "quotes spreadsheet", { uid: outsider.uid, role: "owner" });
    expect(results).toEqual([]);
    const ownResults = await research.searchProject(tenantId, projectId, "lose quotes", asOwner);
    expect(ownResults.map((result) => result.type)).toEqual(expect.arrayContaining(["insight", "highlight", "segment"]));
  });

  it("surfaces expired retention, deletes a source with audit, and exports every record", async () => {
    const queue = await research.listRetentionQueue(tenantId);
    expect(queue.map((item) => [item.sourceId, item.reason])).toEqual([[sourceId, "expired"]]);

    const exported = await research.exportWorkspace(tenantId, { id: tenantId, name: "Acme Research" }, asOwner);
    const project = exported.projects[0];
    const snapshot = await research.loadProjectSnapshot(tenantId, projectId, asOwner);
    expect(exported.manifest).toMatchObject({ product: "research", tenantId });
    expect(project.counts).toEqual({ sources: 1, segments: 3, highlights: snapshot.highlights.length, insights: 1, themes: 1 });
    expect(project.relationships.evidence).toHaveLength(1);
    expect(project.relationships.evidence[0]).toMatchObject({ sourceId, quote: "lose the quotes" });
    expect(project.highlights.map((h) => h.id).sort()).toEqual(snapshot.highlights.map((h) => h.id).sort());
    expect(exported.members).toHaveLength(3);
    expect(exported.auditEvents.length).toBeGreaterThan(5);
    expect(JSON.parse(JSON.stringify(exported))).toEqual(exported);

    const result = await act(owner, { type: "source.delete", sourceId, reason: "Retention period ended" });
    expect(result).toMatchObject({ highlightsRemoved: snapshot.highlights.length, insightsAffected: 1 });
    const after = await research.loadProjectSnapshot(tenantId, projectId, asOwner);
    expect(after.sources).toEqual([]);
    expect(after.highlights).toEqual([]);
    expect(after.insights[0].highlightIds).toEqual([]);
    const actions = (await tenants.listAuditEvents("research", tenantId, 100)).map((event) => event.action);
    expect(actions).toEqual(expect.arrayContaining([
      "tenant.created", "project.created", "source.created", "highlight.created", "segment.corrected",
      "insight.created", "theme.created", "segment.redacted", "source.deleted",
    ]));
  });

  it("legal holds block deletion, redaction and retention runs, and every step is audited", async () => {
    const make = async (title: string) =>
      String((await act(owner, {
        type: "source.create",
        title,
        content: "Interviewer: Hello there\nPat: My number is 555-0199.",
        participant: { name: "Pat" },
        consent: { status: "granted", retentionUntil: "2021-06-01" },
      })).sourceId);
    const expired = await make("Expired interview");
    const held = await make("Held interview");

    await expectFleetError(act(researcher, { type: "source.hold", sourceId: held, reason: "Litigation" }), 403);
    await act(owner, { type: "source.hold", sourceId: held, reason: "Litigation" });
    await expectFleetError(act(owner, { type: "source.hold", sourceId: held, reason: "Again" }), 409);
    await expectFleetError(act(owner, { type: "source.delete", sourceId: held, reason: "Cleanup" }), 409);
    await expectFleetError(act(owner, { type: "segment.redact", sourceId: held, segmentId: "seg-2", start: 13, end: 21, reason: "Phone" }), 409);

    const preview = await research.applyRetention(tenantId, owner, { dryRun: true });
    expect(preview.toDelete.map((entry) => entry.sourceId)).toEqual([expired]);
    expect(preview.held.map((entry) => entry.sourceId)).toEqual([held]);
    expect((await research.loadProjectSnapshot(tenantId, projectId, asOwner)).sources).toHaveLength(2);

    const run = await research.applyRetention(tenantId, owner, { dryRun: false });
    expect(run.deleted).toBe(1);
    const remaining = (await research.loadProjectSnapshot(tenantId, projectId, asOwner)).sources;
    expect(remaining.map((source) => source.id)).toEqual([held]);
    expect(remaining[0].legalHold).toMatchObject({ reason: "Litigation" });

    await act(owner, { type: "source.release", sourceId: held, reason: "Case closed" });
    await act(owner, { type: "segment.redact", sourceId: held, segmentId: "seg-2", start: 13, end: 21, reason: "Phone" });

    const audit = await tenants.listAuditEvents("research", tenantId, 200);
    const actions = audit.map((event) => event.action);
    expect(actions).toEqual(expect.arrayContaining(["legal_hold.placed", "legal_hold.blocked", "retention.applied", "legal_hold.released"]));
    expect(audit.filter((event) => event.action === "legal_hold.blocked").map((event) => event.details.attempted).sort()).toEqual(["delete", "redact"]);
    expect(audit.find((event) => event.action === "retention.applied")?.details).toMatchObject({ deleted: 1, skippedForLegalHold: 1 });
  });

  it("restricted folders hide sources from unlisted members in reads, search, export, insights and writes", async () => {
    const asResearcher = { uid: researcher.uid, role: "member" };
    const asViewer = { uid: viewer.uid, role: "viewer" };
    const secret = String((await act(owner, {
      type: "source.create",
      title: "Confidential exec interview",
      content: "Exec: The acquisition closes in March.",
      participant: { name: "Exec" },
      consent: { status: "granted" },
    })).sourceId);
    const folderId = String((await act(owner, { type: "folder.create", name: "Exec", restricted: true, memberUids: [viewer.uid] })).folderId);
    await expectFleetError(act(researcher, { type: "folder.create", name: "Mine" }), 403);
    await act(owner, { type: "source.move", sourceId: secret, folderId });
    const segment = (await research.loadProjectSnapshot(tenantId, projectId, asOwner)).sources.find((source) => source.id === secret)!.segments[0];
    const evidence = String((await act(owner, { type: "highlight.create", sourceId: secret, segmentId: segment.id, start: 0, end: 15, tags: ["m-and-a"] })).highlightId);
    const insightId = String((await act(owner, { type: "insight.create", title: "Deal timing matters", highlightIds: [evidence] })).insightId);

    const researcherView = await research.loadProjectSnapshot(tenantId, projectId, asResearcher);
    expect(researcherView.sources.map((source) => source.id)).not.toContain(secret);
    expect(researcherView.highlights.map((highlight) => highlight.id)).not.toContain(evidence);
    expect(researcherView.insights.find((insight) => insight.id === insightId)).toMatchObject({ highlightIds: [], restrictedEvidence: 1 });
    expect(researcherView.folders).toEqual([]);
    expect(await research.searchProject(tenantId, projectId, "acquisition", asResearcher)).toEqual([]);
    const researcherExport = await research.exportProject(tenantId, projectId, asResearcher);
    expect(JSON.stringify(researcherExport)).not.toContain("acquisition");
    expect(researcherExport.restrictedSourcesOmitted).toBe(1);
    await expectFleetError(research.exportWorkspace(tenantId, { id: tenantId, name: "Acme" }, asResearcher), 403);
    await expectFleetError(act(researcher, { type: "highlight.create", sourceId: secret, segmentId: segment.id, start: 0, end: 4, tags: [] }), 404);
    await expectFleetError(act(researcher, { type: "insight.create", title: "Leaky insight", highlightIds: [evidence] }), 400);

    // Editing an insight without access to some evidence keeps those hidden links intact.
    const open = researcherView.sources[0];
    const visibleHighlight = { id: String((await act(researcher, { type: "highlight.create", sourceId: open.id, segmentId: open.segments[0].id, start: 0, end: 5, tags: [] })).highlightId) };
    await act(researcher, { type: "insight.update", insightId, title: "Deal timing matters a lot", highlightIds: [visibleHighlight.id] });
    const ownerInsight = (await research.loadProjectSnapshot(tenantId, projectId, asOwner)).insights.find((insight) => insight.id === insightId)!;
    expect(ownerInsight.highlightIds.sort()).toEqual([evidence, visibleHighlight.id].sort());

    const versions = await research.listInsightVersions(tenantId, projectId, insightId, asOwner);
    expect(versions.map((version) => [version.version, version.title])).toEqual([[1, "Deal timing matters"], [2, "Deal timing matters a lot"]]);
    expect(versions[1].highlightIds.sort()).toEqual([evidence, visibleHighlight.id].sort());
    const researcherVersions = await research.listInsightVersions(tenantId, projectId, insightId, asResearcher);
    expect(researcherVersions[1].highlightIds).toEqual([visibleHighlight.id]);
    await expectFleetError(research.listInsightVersions(otherTenantId, projectId, insightId, asOwner), 404);

    const reportId = String((await act(researcher, { type: "report.create", title: "Exec findings", intro: "Summary", insightIds: [insightId] })).reportId);
    await expectFleetError(act(researcher, { type: "report.create", title: "Bad report", insightIds: ["missing"] }), 400);
    const ownerReport = await research.loadReport(tenantId, projectId, reportId, asOwner);
    expect(ownerReport.sections[0].evidence.map((entry) => entry.highlight.id).sort()).toEqual([evidence, visibleHighlight.id].sort());
    const researcherReport = await research.loadReport(tenantId, projectId, reportId, asResearcher);
    expect(researcherReport.sections[0].evidence.map((entry) => entry.highlight.id)).toEqual([visibleHighlight.id]);
    expect(JSON.stringify(researcherReport)).not.toContain("acquisition");
    await expectFleetError(research.loadReport(otherTenantId, projectId, reportId, asOwner), 404);
    await expectFleetError(act(viewer, { type: "report.delete", reportId }), 403);

    const hidden = await research.hiddenSourceIds(tenantId, asResearcher);
    expect([...hidden]).toEqual([secret]);
    const researcherAudit = research.filterAuditForViewer(await tenants.listAuditEvents("research", tenantId, 200), hidden);
    expect(JSON.stringify(researcherAudit)).not.toContain("Confidential exec interview");
    expect((await research.hiddenSourceIds(tenantId, asViewer)).size).toBe(0);

    const listed = await research.searchProject(tenantId, projectId, "acquisition", asViewer);
    expect(listed.map((result) => result.type)).toContain("segment");
    expect(JSON.stringify(await research.exportProject(tenantId, projectId, asOwner))).toContain("acquisition");
  });
});
