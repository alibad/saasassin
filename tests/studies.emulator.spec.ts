import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Golden path for SaaSassin Studies against the Firestore emulator. Never runs against production.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("studies.emulator.spec.ts only runs under the Firestore emulator (FIRESTORE_EMULATOR_HOST is not set).");
}
process.env.FIREBASE_PROJECT_ID = "demo-saasassin";

const app = initializeApp({ projectId: "demo-saasassin" }, "studies-golden-path");
const db: Firestore = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => db,
  getAdminAuth: () => null,
  isFirebaseConfigured: () => true,
}));

const platform = await import("@/lib/fleet/platform/tenants");
const { FleetError } = await import("@/lib/fleet/platform/session");
const studies = await import("@/lib/studies/data");
const { defaultBlock, studyDraftSchema } = await import("@/lib/studies/model");
const { ZodError } = await import("zod");

type Draft = import("@/lib/studies/model").StudyDraft;
type Block = import("@/lib/studies/model").Block;

const owner = { uid: "st-owner", email: "owner@example.com", name: "Olivia Owner" };
const researcher = { uid: "st-researcher", email: "res@example.com", name: "Rae Researcher" };
const viewer = { uid: "st-viewer", email: "viewer@example.com", name: "Vic Viewer" };
const outsider = { uid: "st-outsider", email: "outsider@example.com", name: "Otto Outsider" };
const rival = { uid: "st-rival", email: "rival@example.com", name: "Rita Rival" };

const settings = { participantCap: null, closeAt: null, endMessage: "Thanks!", minDurationSeconds: null };

const BLOCKS: Block[] = [
  { type: "welcome", id: "w", title: "Welcome", body: "Five minutes.", consentRequired: true, consentText: "I agree" },
  { type: "yes_no", id: "adult", prompt: "Are you over 18?", required: true, logic: [], screenOut: ["no"] },
  {
    type: "multiple_choice",
    id: "role",
    prompt: "What is your role?",
    required: true,
    logic: [{ equals: "pm", goTo: "sort" }],
    screenOut: [],
    allowMultiple: false,
    options: [
      { id: "pm", label: "Product manager" },
      { id: "eng", label: "Engineer" },
    ],
  },
  { type: "opinion_scale", id: "ease", prompt: "How easy is setup?", required: true, logic: [], screenOut: [], scale: 5, minLabel: "Hard", maxLabel: "Easy" },
  { type: "open_text", id: "why", prompt: "Why?", required: false, logic: [], screenOut: [], maxLength: 500 },
  {
    type: "website_task",
    id: "task",
    prompt: "Find pricing",
    required: true,
    logic: [],
    screenOut: [],
    url: "https://example.com/pricing",
    successQuestion: "Did you find it?",
  },
  {
    type: "card_sort",
    id: "sort",
    prompt: "Sort these",
    required: true,
    logic: [],
    screenOut: [],
    cards: [
      { id: "invoices", label: "Invoices" },
      { id: "keys", label: "API keys" },
    ],
    categories: [
      { id: "billing", label: "Billing" },
      { id: "settings", label: "Settings" },
    ],
  },
];

const draft = (overrides: Partial<Draft> = {}): Draft => studyDraftSchema.parse({ title: "Onboarding study", description: "Why teams stall", blocks: BLOCKS, settings, ...overrides });

const ENGINEER = {
  w: { consented: true },
  adult: { value: "yes" },
  role: { selected: ["eng"] },
  ease: { value: 4 },
  why: { text: "Docs were clear" },
  task: { success: true, durationMs: 42000, opened: true },
  sort: { placements: { invoices: "billing", keys: "settings" } },
};
const PM = {
  w: { consented: true },
  adult: { value: "yes" },
  role: { selected: ["pm"] },
  // Off-path answers the browser should never have sent; the server drops them.
  ease: { value: 1 },
  sort: { placements: { invoices: "billing", keys: "billing" } },
};

let tenantId = "";
let rivalTenantId = "";
let studyId = "";

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
  await db.doc(`products/studies/tenants/${tenantId}/memberships/${user.uid}`).set({ uid: user.uid, email: user.email, name: user.name, role, status: "active" });
}

/** A full anonymous participant run: start, one partial save, then the final submit. */
async function participate(answers: Record<string, unknown>, target = { tenantId: "", studyId: "" }) {
  const t = target.tenantId || tenantId;
  const s = target.studyId || studyId;
  const session = await studies.startParticipantSession(t, s);
  await studies.recordParticipantProgress(t, s, { sessionId: session.sessionId, token: session.token, answers: { w: answers.w }, blockTimings: { w: 1200 }, final: false });
  const result = await studies.recordParticipantProgress(t, s, {
    sessionId: session.sessionId,
    token: session.token,
    answers,
    blockTimings: Object.fromEntries(Object.keys(answers).map((key) => [key, 2500])),
    final: true,
  });
  return { ...session, ...result };
}

async function responseDoc(id: string) {
  return (await db.doc(`products/studies/tenants/${tenantId}/responses/${id}`).get()).data() ?? {};
}

beforeAll(async () => {
  tenantId = (await platform.createTenant("studies", owner, "Acme Research")).id;
  rivalTenantId = (await platform.createTenant("studies", rival, "Rival Research")).id;
  await grant(researcher, "member");
  await grant(viewer, "viewer");
});

afterAll(async () => {
  await Promise.all(getApps().map((existing) => deleteApp(existing)));
});

describe("studies golden path (Firestore emulator)", () => {
  it("enforces membership and roles server-side", async () => {
    await expect(studies.listStudies(owner, tenantId)).resolves.toMatchObject({ role: "owner", studies: [] });
    await expect(studies.listStudies(viewer, tenantId)).resolves.toMatchObject({ role: "viewer" });
    await expectFleetError(studies.createStudy(viewer, tenantId, draft()), 403);
    await expectFleetError(studies.createStudy(outsider, tenantId, draft()), 404);
    await expectFleetError(studies.listStudies(outsider, tenantId), 404);
    await expectFleetError(studies.listStudies(rival, tenantId), 404);
  });

  it("builds a draft that persists and reads back", async () => {
    const empty = await studies.createStudy(researcher, tenantId, draft({ title: "Empty", blocks: [] }));
    await expectFleetError(studies.transitionStudy(researcher, tenantId, empty.id, "publish"), 409);

    const created = await studies.createStudy(researcher, tenantId, draft({ blocks: BLOCKS.slice(0, 3) }));
    studyId = created.id;
    expect(created).toMatchObject({ status: "draft", currentVersion: 0, completedCount: 0 });
    const updated = await studies.updateStudyDraft(researcher, tenantId, studyId, draft());
    expect(updated.draftBlocks.map((block) => block.id)).toEqual(BLOCKS.map((block) => block.id));
    expect((await studies.getStudy(viewer, tenantId, studyId)).title).toBe("Onboarding study");
    await expectFleetError(studies.updateStudyDraft(viewer, tenantId, studyId, draft()), 403);
    await expectFleetError(studies.getStudy(owner, tenantId, "missing"), 404);
    // Zod rejects structurally invalid drafts before anything is written.
    await expectFleetError(studies.createStudy(owner, tenantId, { ...draft(), title: "" }), 400);
    // Logic that points backwards is a publish-time error, not a write error.
    const backwards = await studies.createStudy(owner, tenantId, draft({
      title: "Backwards",
      blocks: [BLOCKS[0], BLOCKS[1], { ...BLOCKS[2], logic: [{ equals: "pm", goTo: "adult" }] } as Block],
    }));
    await expectFleetError(studies.transitionStudy(owner, tenantId, backwards.id, "publish"), 409);
  });

  it("hides draft studies from participants", async () => {
    await expectFleetError(studies.getPublicStudy(tenantId, studyId), 404);
    await expectFleetError(studies.startParticipantSession(tenantId, studyId), 404);
  });

  it("publishes an immutable version and freezes the blocks", async () => {
    await expectFleetError(studies.transitionStudy(viewer, tenantId, studyId, "publish"), 403);
    const live = await studies.transitionStudy(researcher, tenantId, studyId, "publish");
    expect(live).toMatchObject({ status: "live", currentVersion: 1 });
    await expectFleetError(studies.transitionStudy(researcher, tenantId, studyId, "publish"), 409);

    // Editing after launch changes the title but never the published (or draft) blocks.
    const edited = await studies.updateStudyDraft(researcher, tenantId, studyId, draft({ title: "Onboarding study (EU)", blocks: [BLOCKS[0], BLOCKS[1]] }));
    expect(edited.title).toBe("Onboarding study (EU)");
    expect(edited.draftBlocks).toHaveLength(BLOCKS.length);
    const version = (await db.doc(`products/studies/tenants/${tenantId}/studyVersions/${studyId}-v1`).get()).data();
    expect(version?.blocks.map((block: Block) => block.id)).toEqual(BLOCKS.map((block) => block.id));
    expect(version?.title).toBe("Onboarding study");

    const publicStudy = await studies.getPublicStudy(tenantId, studyId);
    expect(publicStudy).toMatchObject({ version: 1, open: true, closedReason: null, endMessage: "Thanks!" });
    expect(publicStudy.blocks).toHaveLength(BLOCKS.length);
  });

  it("records anonymous submissions validated against the published version", async () => {
    const run = await participate(ENGINEER);
    expect(run.status).toBe("completed");
    const stored = await responseDoc(run.sessionId);
    expect(stored).toMatchObject({ status: "completed", version: 1, path: BLOCKS.map((block) => block.id) });
    expect(stored.answers.task).toEqual({ success: true, durationMs: 42000, opened: true });
    expect(stored.tokenHash).not.toBe(run.token);
    expect(JSON.stringify(stored)).not.toContain("example.com\"");
    expect(typeof stored.durationMs).toBe("number");

    // Duplicate final submission and a wrong token.
    await expectFleetError(studies.recordParticipantProgress(tenantId, studyId, { sessionId: run.sessionId, token: run.token, answers: ENGINEER, blockTimings: {}, final: true }), 409);
    const session = await studies.startParticipantSession(tenantId, studyId);
    await expectFleetError(studies.recordParticipantProgress(tenantId, studyId, { sessionId: session.sessionId, token: "x".repeat(32), answers: ENGINEER, blockTimings: {}, final: true }), 403);
    await expectFleetError(studies.recordParticipantProgress(tenantId, studyId, { sessionId: "not-a-session", token: session.token, answers: ENGINEER, blockTimings: {}, final: true }), 403);
    // Answers are validated against the frozen schema: out-of-range scale, unknown option, missing consent.
    await expectFleetError(studies.recordParticipantProgress(tenantId, studyId, { sessionId: session.sessionId, token: session.token, answers: { ...ENGINEER, ease: { value: 9 } }, blockTimings: {}, final: true }), 422);
    await expectFleetError(studies.recordParticipantProgress(tenantId, studyId, { sessionId: session.sessionId, token: session.token, answers: { ...ENGINEER, role: { selected: ["ceo"] } }, blockTimings: {}, final: true }), 422);
    await expectFleetError(studies.recordParticipantProgress(tenantId, studyId, { sessionId: session.sessionId, token: session.token, answers: { ...ENGINEER, w: { consented: false } }, blockTimings: {}, final: true }), 422);
    // A failed submission leaves the session open: the participant can fix the answer.
    expect((await responseDoc(session.sessionId)).status).toBe("in_progress");
    // This session stays in progress as a drop-off after consent.
    await studies.recordParticipantProgress(tenantId, studyId, { sessionId: session.sessionId, token: session.token, answers: { w: { consented: true } }, blockTimings: { w: 900 }, final: false });
  });

  it("applies skip logic and screen-outs on the server", async () => {
    const pm = await participate(PM);
    expect(pm.status).toBe("completed");
    const stored = await responseDoc(pm.sessionId);
    expect(stored.path).toEqual(["w", "adult", "role", "sort"]);
    expect(Object.keys(stored.answers).sort()).toEqual(["adult", "role", "sort", "w"]);
    expect(stored.blockTimings.ease).toBeUndefined();

    const screened = await participate({ w: { consented: true }, adult: { value: "no" }, role: { selected: ["eng"] } });
    expect(screened.status).toBe("screened_out");
    expect((await responseDoc(screened.sessionId)).path).toEqual(["w", "adult"]);
  });

  it("aggregates results from the stored responses", async () => {
    const payload = studies.buildResultsPayload(await studies.getStudyResults(viewer, tenantId, studyId));
    const { results } = payload;
    expect(payload.effectiveStatus).toBe("live");
    expect(results).toMatchObject({ started: 4, completed: 2, screenedOut: 1, inProgress: 1 });
    expect(results?.completionRate).toBe(0.5);
    const funnel = Object.fromEntries(results!.funnel.map((step) => [step.blockId, step]));
    // The drop-off consented, was shown the next block and left there.
    expect(funnel.w).toMatchObject({ reached: 4, dropOff: 0 });
    expect(funnel.adult).toMatchObject({ reached: 4, dropOff: 1, screenedOut: 1 });
    expect(funnel.ease.reached).toBe(1);
    expect(funnel.sort.reached).toBe(2);
    const byId = Object.fromEntries(results!.blocks.map((block) => [block.blockId, block]));
    expect(byId.role).toMatchObject({ type: "multiple_choice", answered: 2 });
    expect(byId.ease).toMatchObject({ type: "opinion_scale", average: 4 });
    expect(byId.task).toMatchObject({ type: "website_task", successRate: 1, medianMs: 42000 });
    const sort = byId.sort as Extract<typeof byId.sort, { type: "card_sort" }>;
    expect(sort.matrix.sorters).toBe(2);
    expect(sort.matrix.cardAgreement.invoices).toBe(1);
    expect(sort.matrix.cardAgreement.keys).toBe(0.5);
    await expectFleetError(studies.getStudyResults(outsider, tenantId, studyId), 404);
    await expectFleetError(studies.getStudyResults(rival, tenantId, studyId), 404);
  });

  it("flags low-quality sessions and respects audited exclusions in results and exports", async () => {
    // Emulator sessions finish in milliseconds; a one-hour minimum makes every completed session a speeder.
    await studies.updateStudyDraft(owner, tenantId, studyId, draft({ title: "Onboarding study (EU)", settings: { ...settings, minDurationSeconds: 3600 } }));
    let payload = studies.buildResultsPayload(await studies.getStudyResults(owner, tenantId, studyId));
    expect(payload.quality).toMatchObject({ flagged: 2, excluded: 0, threshold: { ms: 3_600_000, source: "setting" } });
    const pmSession = payload.sessions.find((session) => session.path.join() === "w,adult,role,sort")!;
    expect(pmSession.flags.map((flag) => flag.code)).toEqual(["speeder"]);
    expect(payload.sessions.find((session) => session.status === "in_progress")?.flags).toEqual([]);

    await expectFleetError(studies.setResponseExclusion(viewer, tenantId, studyId, pmSession.id, { excluded: true, reason: "Too fast" }), 403);
    await expectFleetError(studies.setResponseExclusion(outsider, tenantId, studyId, pmSession.id, { excluded: true, reason: "Too fast" }), 404);
    await expectFleetError(studies.setResponseExclusion(researcher, tenantId, studyId, pmSession.id, { excluded: true, reason: "" }), 400);
    await expectFleetError(studies.setResponseExclusion(researcher, tenantId, "other-study", pmSession.id, { excluded: true, reason: "Too fast" }), 404);
    await expectFleetError(studies.setResponseExclusion(rival, rivalTenantId, studyId, pmSession.id, { excluded: true, reason: "Too fast" }), 404);
    const excluded = await studies.setResponseExclusion(researcher, tenantId, studyId, pmSession.id, { excluded: true, reason: "Finished in under a second" });
    expect(excluded.quality).toMatchObject({ decision: "excluded", reason: "Finished in under a second", decidedBy: { email: researcher.email } });

    payload = studies.buildResultsPayload(await studies.getStudyResults(owner, tenantId, studyId));
    expect(payload.results).toMatchObject({ started: 3, completed: 1 });
    expect(payload.quality.excluded).toBe(1);
    expect(payload.sessions.find((session) => session.id === pmSession.id)).toMatchObject({ excluded: true, decidedBy: researcher.email });
    const all = studies.buildResultsPayload(await studies.getStudyResults(owner, tenantId, studyId), { includeExcluded: true });
    expect(all.results).toMatchObject({ started: 4, completed: 2 });
    // The read-only share link cannot opt back in and never carries raw sessions.
    const shared = studies.buildResultsPayload(await studies.getStudyResults(owner, tenantId, studyId), { includeExcluded: true, audience: "shared" });
    expect(shared.results?.completed).toBe(1);
    expect(shared.sessions).toEqual([]);

    const csv = await studies.exportStudy(owner, tenantId, studyId, { format: "csv", blockId: "sort" });
    expect(csv.body).not.toContain(pmSession.id);
    const csvAll = await studies.exportStudy(owner, tenantId, studyId, { format: "csv", blockId: "sort", includeExcluded: true });
    expect(csvAll.body).toContain(`${pmSession.id},1,completed,true,`);
    const json = JSON.parse((await studies.exportStudy(owner, tenantId, studyId, { format: "json" })).body);
    const exportedPm = json.responses.find((response: { id: string }) => response.id === pmSession.id);
    expect(exportedPm).toMatchObject({ includedInResults: false, quality: { decision: "excluded", reason: "Finished in under a second" } });
    expect(exportedPm.qualityFlags[0].code).toBe("speeder");

    const kept = await studies.setResponseExclusion(owner, tenantId, studyId, pmSession.id, { excluded: false, reason: "" });
    expect(kept.quality).toMatchObject({ decision: "kept", reason: "Reviewed and kept." });
    expect(studies.buildResultsPayload(await studies.getStudyResults(owner, tenantId, studyId)).results?.completed).toBe(2);
    const audit = await platform.listAuditEvents("studies", tenantId, 50);
    expect(audit.find((event) => event.action === "response.excluded")?.details).toMatchObject({ reason: "Finished in under a second", studyId });
    expect(audit.find((event) => event.action === "response.included")?.details).toMatchObject({ previous: "excluded" });
  });

  it("rejects new sessions and final submissions once capped, closed or past the close date", async () => {
    // Cap at the current completed count: the study closes itself.
    await studies.updateStudyDraft(owner, tenantId, studyId, draft({ title: "Onboarding study (EU)", settings: { ...settings, participantCap: 2 } }));
    expect((await studies.getPublicStudy(tenantId, studyId)).open).toBe(false);
    await expectFleetError(studies.startParticipantSession(tenantId, studyId), 410);

    await studies.updateStudyDraft(owner, tenantId, studyId, draft({ title: "Onboarding study (EU)", settings: { ...settings, participantCap: 3 } }));
    const late = await studies.startParticipantSession(tenantId, studyId);
    const third = await participate(ENGINEER);
    expect(third.status).toBe("completed");
    // The cap was reached while `late` was still answering: its final submit is refused honestly.
    await expectFleetError(studies.recordParticipantProgress(tenantId, studyId, { sessionId: late.sessionId, token: late.token, answers: ENGINEER, blockTimings: {}, final: true }), 410);

    await studies.updateStudyDraft(owner, tenantId, studyId, draft({ title: "Onboarding study (EU)", settings: { ...settings, closeAt: "2020-01-01T00:00:00.000Z" } }));
    expect((await studies.getPublicStudy(tenantId, studyId)).closedReason).toMatch(/scheduled date/);
    await expectFleetError(studies.startParticipantSession(tenantId, studyId), 410);
    await studies.updateStudyDraft(owner, tenantId, studyId, draft({ title: "Onboarding study (EU)", settings }));

    await expectFleetError(studies.transitionStudy(viewer, tenantId, studyId, "close"), 403);
    expect((await studies.transitionStudy(owner, tenantId, studyId, "close")).status).toBe("closed");
    await expectFleetError(studies.startParticipantSession(tenantId, studyId), 410);
    expect((await studies.transitionStudy(owner, tenantId, studyId, "reopen")).status).toBe("live");
    expect((await studies.getPublicStudy(tenantId, studyId)).open).toBe(true);
  });

  it("keeps tenants isolated on the public routes", async () => {
    await expectFleetError(studies.getPublicStudy(rivalTenantId, studyId), 404);
    await expectFleetError(studies.startParticipantSession(rivalTenantId, studyId), 404);
    await expectFleetError(studies.getPublicStudy("not-a-tenant", studyId), 404);
    await expectFleetError(studies.getPublicStudy(tenantId, "../escape"), 404);
    const rivalStudy = await studies.createStudy(rival, rivalTenantId, draft({ title: "Rival study" }));
    await studies.transitionStudy(rival, rivalTenantId, rivalStudy.id, "publish");
    // A session token from Acme cannot write into the rival tenant's study.
    const acme = await studies.startParticipantSession(tenantId, studyId);
    await expectFleetError(studies.recordParticipantProgress(rivalTenantId, rivalStudy.id, { sessionId: acme.sessionId, token: acme.token, answers: ENGINEER, blockTimings: {}, final: true }), 403);
    expect((await studies.listStudies(owner, tenantId)).studies.some((study) => study.id === rivalStudy.id)).toBe(false);
  });

  it("duplicates from the published version and shares results behind a revocable token", async () => {
    const copy = await studies.duplicateStudy(researcher, tenantId, studyId);
    expect(copy).toMatchObject({ status: "draft", currentVersion: 0 });
    expect(copy.draftBlocks.map((block) => block.id)).toEqual(BLOCKS.map((block) => block.id));
    await expectFleetError(studies.duplicateStudy(viewer, tenantId, studyId), 403);

    await expectFleetError(studies.setResultsSharing(researcher, tenantId, studyId, true), 403);
    const shared = await studies.setResultsSharing(owner, tenantId, studyId, true);
    expect(shared.shareToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    const view = studies.buildResultsPayload(await studies.getSharedResults(tenantId, studyId, shared.shareToken!));
    expect(view.results?.completed).toBe(3);
    await expectFleetError(studies.getSharedResults(tenantId, studyId, "wrong-token"), 404);
    await expectFleetError(studies.getSharedResults(rivalTenantId, studyId, shared.shareToken!), 404);
    await studies.setResultsSharing(owner, tenantId, studyId, false);
    await expectFleetError(studies.getSharedResults(tenantId, studyId, shared.shareToken!), 404);
  });

  it("creates evidence-linked findings that reach the shared link and every export", async () => {
    const { responses: stored } = await studies.getStudyResults(owner, tenantId, studyId);
    const engineer = stored.find((response) => response.status === "completed" && response.answers.why)!;
    const pm = stored.find((response) => response.path.join() === "w,adult,role,sort")!;
    const input = {
      title: "Engineers find setup easy",
      summary: "Docs carry the setup.",
      severity: "high" as const,
      status: "open" as const,
      evidence: [
        { kind: "response" as const, responseId: engineer.id, blockId: "why", note: "Direct quote" },
        { kind: "block" as const, blockId: "ease", note: "" },
      ],
    };
    await expectFleetError(studies.createFinding(viewer, tenantId, studyId, input), 403);
    await expectFleetError(studies.createFinding(outsider, tenantId, studyId, input), 404);
    await expectFleetError(studies.createFinding(owner, tenantId, studyId, { ...input, evidence: [] }), 400);
    // A PM skipped "why": citing it is refused, as is a session from another study.
    await expectFleetError(studies.createFinding(owner, tenantId, studyId, { ...input, evidence: [{ kind: "response", responseId: pm.id, blockId: "why", note: "" }] }), 422);
    await expectFleetError(studies.createFinding(owner, tenantId, studyId, { ...input, evidence: [{ kind: "response", responseId: "missing", blockId: "why", note: "" }] }), 404);

    const finding = await studies.createFinding(researcher, tenantId, studyId, input);
    expect(finding.evidence[0]).toMatchObject({ excerpt: "Docs were clear", blockTitle: "Why?", version: 1 });
    expect(finding.createdBy.email).toBe(researcher.email);
    const updated = await studies.updateFinding(owner, tenantId, studyId, finding.id, { ...input, status: "resolved" });
    expect(updated.status).toBe("resolved");
    await expectFleetError(studies.updateFinding(owner, tenantId, "other", finding.id, input), 404);
    const throwaway = await studies.createFinding(owner, tenantId, studyId, { ...input, title: "Duplicate", severity: "low" });
    await expectFleetError(studies.deleteFinding(viewer, tenantId, studyId, throwaway.id), 403);
    await studies.deleteFinding(owner, tenantId, studyId, throwaway.id);

    const payload = studies.buildResultsPayload(await studies.getStudyResults(viewer, tenantId, studyId), { audience: "shared" });
    expect(payload.findings.map((item) => item.title)).toEqual(["Engineers find setup easy"]);
    expect(payload.findings[0].excludedEvidence).toBe(0);
    const json = JSON.parse((await studies.exportStudy(owner, tenantId, studyId, { format: "json" })).body);
    expect(json.findings).toHaveLength(1);
    expect(json.findings[0]).toMatchObject({ title: "Engineers find setup easy", status: "resolved" });
    const actions = (await platform.listAuditEvents("studies", tenantId, 50)).map((event) => event.action);
    expect(actions).toEqual(expect.arrayContaining(["finding.created", "finding.updated", "finding.deleted"]));
  });

  it("exports every record without session tokens", async () => {
    const json = await studies.exportStudy(viewer, tenantId, studyId, { format: "json" });
    const parsed = JSON.parse(json.body);
    expect(parsed.schema).toBe("net.saasassin.studies.responses");
    const responseCount = (await db.collection(`products/studies/tenants/${tenantId}/responses`).where("studyId", "==", studyId).get()).size;
    expect(parsed.responses).toHaveLength(responseCount);
    expect(json.body).not.toContain("tokenHash");

    const csv = await studies.exportStudy(owner, tenantId, studyId, { format: "csv", blockId: "sort" });
    expect(csv.body.split("\n")[0]).toBe("response_id,study_version,status,excluded,submitted_at,Invoices,API keys");
    expect(csv.body.trim().split("\n")).toHaveLength(1 + 3);
    await expectFleetError(studies.exportStudy(owner, tenantId, studyId, { format: "csv", blockId: "nope" }), 404);
    await expectFleetError(studies.exportStudy(outsider, tenantId, studyId, { format: "json" }), 404);

    const bundle = await studies.buildWorkspaceExport(owner, tenantId);
    const counts = Object.fromEntries(bundle.manifest.files.map((file) => [file.path, file.records]));
    const all = async (name: string) => (await db.collection(`products/studies/tenants/${tenantId}/${name}`).get()).size;
    expect(counts["studies.json"]).toBe(await all("studies"));
    expect(counts["study-versions.json"]).toBe(await all("studyVersions"));
    expect(counts["responses.json"]).toBe(await all("responses"));
    expect(counts["members.json"]).toBe(3);
    expect(counts["findings.json"]).toBe(await all("findings"));
    expect(counts["findings.json"]).toBeGreaterThan(0);
    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain("tokenHash");
    expect(serialized).not.toContain("Rival study");
    await expectFleetError(studies.buildWorkspaceExport(rival, tenantId), 404);
  });

  it("runs a tree test end to end: navigation validated on the server, success/directness/first clicks in results", async () => {
    const tree = defaultBlock("tree_test") as Extract<Block, { type: "tree_test" }>;
    const byLabel = (label: string) => tree.tree.find((node) => node.label === label)!.id;
    const study = await studies.createStudy(researcher, tenantId, draft({ title: "Navigation", blocks: [BLOCKS[0], tree] }));
    await studies.transitionStudy(researcher, tenantId, study.id, "publish");
    const target = { tenantId, studyId: study.id };
    const taskId = tree.tasks[0].id;
    const direct = { path: [byLabel("Billing"), byLabel("Invoices")], selectedNodeId: byLabel("Invoices"), durationMs: 6000 };
    const lost = { path: [byLabel("Settings"), "root", byLabel("Help"), byLabel("Contact support")], selectedNodeId: byLabel("Contact support"), durationMs: 25000 };
    expect((await participate({ w: { consented: true }, [tree.id]: { tasks: { [taskId]: direct } } }, target)).status).toBe("completed");
    expect((await participate({ w: { consented: true }, [tree.id]: { tasks: { [taskId]: lost } } }, target)).status).toBe("completed");

    const session = await studies.startParticipantSession(tenantId, study.id);
    const forged = { [tree.id]: { tasks: { [taskId]: { ...direct, path: ["n_forged"], selectedNodeId: "n_forged" } } }, w: { consented: true } };
    await expectFleetError(studies.recordParticipantProgress(tenantId, study.id, { sessionId: session.sessionId, token: session.token, answers: forged, blockTimings: {}, final: true }), 422);
    const unfinished = { w: { consented: true }, [tree.id]: { tasks: {} } };
    await expectFleetError(studies.recordParticipantProgress(tenantId, study.id, { sessionId: session.sessionId, token: session.token, answers: unfinished, blockTimings: {}, final: true }), 422);

    const payload = studies.buildResultsPayload(await studies.getStudyResults(viewer, tenantId, study.id));
    const result = payload.results!.blocks.find((block) => block.blockId === tree.id)!;
    expect(result.type).toBe("tree_test");
    const [task] = (result as Extract<typeof result, { type: "tree_test" }>).tasks;
    expect(task).toMatchObject({ attempts: 2, successes: 1, successRate: 0.5, directness: 0.5 });
    expect(task.outcomes).toMatchObject({ direct_success: 1, indirect_failure: 1 });
    expect(task.firstClicks.map((entry) => [entry.label, entry.correct])).toEqual([["Billing", true], ["Settings", false]]);
    const csv = await studies.exportStudy(owner, tenantId, study.id, { format: "csv", blockId: tree.id });
    expect(csv.body).toContain("indirect_failure,Help › Contact support,4,Settings > (top) > Help > Contact support,25000");
  });

  it("audits every researcher mutation", async () => {
    const actions = (await platform.listAuditEvents("studies", tenantId, 200)).map((event) => event.action);
    for (const action of [
      "tenant.created",
      "study.created",
      "study.updated",
      "study.publish",
      "study.close",
      "study.reopen",
      "study.duplicated",
      "study.results_shared",
      "study.results_unshared",
      "study.exported_json",
      "study.exported_csv",
      "workspace.exported",
      "response.excluded",
      "response.included",
    ]) {
      expect(actions, action).toContain(action);
    }
    const rivalActions = (await platform.listAuditEvents("studies", rivalTenantId, 50)).map((event) => event.action);
    expect(rivalActions).not.toContain("study.duplicated");
  });
});
