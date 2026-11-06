import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Golden path for SaaSassin Revenue against the Firestore emulator. Never runs against production.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("revenue.emulator.spec.ts only runs under the Firestore emulator (FIRESTORE_EMULATOR_HOST is not set).");
}
process.env.FIREBASE_PROJECT_ID = "demo-saasassin";

const app = initializeApp({ projectId: "demo-saasassin" }, "revenue-golden-path");
const db: Firestore = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => db,
  getAdminAuth: () => null,
  isFirebaseConfigured: () => true,
}));

const platform = await import("@/lib/fleet/platform/tenants");
const { FleetError } = await import("@/lib/fleet/platform/session");
const data = await import("@/lib/revenue/data");
const { analyzeCall } = await import("@/lib/revenue/analysis");
const { REDACTION_MARK, segmentFingerprint } = await import("@/lib/revenue/coaching");

type User = { uid: string; email: string; name: string };
const owner: User = { uid: "rev-owner", email: "owner@acme.test", name: "Olivia Owner" };
const admin: User = { uid: "rev-admin", email: "admin@acme.test", name: "Adam Admin" };
const manager: User = { uid: "rev-manager", email: "manager@acme.test", name: "Mia Manager" };
const rep: User = { uid: "rev-rep", email: "rep@acme.test", name: "Ana Rep" };
const rep2: User = { uid: "rev-rep2", email: "rep2@acme.test", name: "Raj Rep" };
const viewer: User = { uid: "rev-viewer", email: "viewer@acme.test", name: "Vic Viewer" };
const outsider: User = { uid: "rev-outsider", email: "outsider@else.test", name: "Otto Outsider" };
const rival: User = { uid: "rev-rival", email: "rival@rival.test", name: "Rita Rival" };

const CONSENT = { jurisdiction: "California, US", basis: "all-party-verbal" as const, allPartyConfirmed: true as const, notes: "" };

const TRANSCRIPT = `WEBVTT

00:00:00.000 --> 00:00:10.000
<v Ana Rep>Thanks for joining. What does your pricing process look like today?

00:00:10.000 --> 00:00:40.000
<v Ben Buyer>We looked at Gong last quarter. Call me on 415-555-0100 if the budget moves.

00:00:40.000 --> 00:00:50.000
<v Ana Rep>Understood. I'll send a proposal by Friday as the next step.

00:00:50.000 --> 00:01:00.000
<v Ben Buyer>Great, that works for us.
`;

let tenantId = "";
let rivalTenantId = "";
let accountId = "";
let dealId = "";
let quietDealId = "";
let callId = "";

async function expectFleetError(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (cause: unknown) => cause);
  expect(error, `expected FleetError ${status}`).toBeInstanceOf(FleetError);
  expect((error as InstanceType<typeof FleetError>).status).toBe(status);
}

const ctx = (user: User, tenant = tenantId) => data.revenueContext(user, tenant);
const tenantDocs = async (name: string, tenant = tenantId) => (await db.collection(`products/revenue/tenants/${tenant}/${name}`).get()).docs;
async function auditActions(tenant = tenantId) {
  return (await tenantDocs("auditEvents", tenant)).map((doc) => String(doc.get("action")));
}

async function grant(user: User, role: string) {
  await db.doc(`products/revenue/tenants/${tenantId}/memberships/${user.uid}`).set({
    uid: user.uid, email: user.email, name: user.name, role, status: "active",
  });
}

function callInput(overrides: Record<string, unknown> = {}) {
  return {
    dealId,
    title: "Discovery with Ben",
    occurredAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    repEmail: rep.email,
    repSpeaker: "Ana Rep",
    format: "auto" as const,
    transcript: TRANSCRIPT,
    consent: CONSENT,
    ...overrides,
  };
}

beforeAll(async () => {
  tenantId = (await platform.createTenant("revenue", owner, "Acme Sales")).id;
  rivalTenantId = (await platform.createTenant("revenue", rival, "Rival Sales")).id;
  // addTenantMember needs Firebase Auth, so seed the memberships directly.
  await grant(admin, "admin");
  await grant(manager, "manager");
  await grant(rep, "rep");
  await grant(rep2, "rep");
  await grant(viewer, "viewer");
});

afterAll(async () => {
  await Promise.all(getApps().map((existing) => deleteApp(existing)));
});

describe("revenue golden path (Firestore emulator)", () => {
  it("resolves members server-side and rejects outsiders and other tenants", async () => {
    await expect(ctx(owner)).resolves.toMatchObject({ role: "owner", tenantName: "Acme Sales" });
    await expect(ctx(viewer)).resolves.toMatchObject({ role: "viewer" });
    await expectFleetError(ctx(outsider), 404);
    await expectFleetError(ctx(rival), 404);
    await expectFleetError(data.revenueContext(viewer, tenantId, ["owner", "admin"]), 403);
  });

  it("seeds workspace settings and trackers once, with an audit event", async () => {
    const first = await data.loadWorkspace(await ctx(owner));
    expect(first.trackers.map((tracker) => tracker.name).sort()).toEqual(["Competitors", "Pricing", "Security review", "Timeline"]);
    expect(first.settings.staleAfterDays).toBe(14);
    await data.loadWorkspace(await ctx(viewer));
    expect((await tenantDocs("trackers")).length).toBe(4);
    expect((await auditActions()).filter((action) => action === "workspace.seeded")).toHaveLength(1);
  });

  it("creates accounts and deals for writers only", async () => {
    await expectFleetError(data.createAccount(await ctx(viewer), { name: "Nope Inc", domain: "" }), 403);
    accountId = (await data.createAccount(await ctx(rep), { name: "Globex", domain: "globex.test" })).id;
    await expectFleetError(
      data.createDeal(await ctx(rep), { name: "Ghost", accountId: "missing", stage: "prospecting", amount: 1, currency: "USD", closeDate: null, ownerEmail: rep.email }),
      404,
    );
    const deal = await data.createDeal(await ctx(rep), {
      name: "Globex — 50 seats", accountId, stage: "prospecting", amount: 50_000, currency: "USD", closeDate: "2099-12-31", ownerEmail: rep.email,
    });
    dealId = deal.id;
    quietDealId = (await data.createDeal(await ctx(rep), {
      name: "Globex — pilot", accountId, stage: "discovery", amount: 5_000, currency: "USD", closeDate: "2020-01-31", ownerEmail: rep2.email,
    })).id;
    const stored = (await db.doc(`products/revenue/tenants/${tenantId}/deals/${dealId}`).get()).data();
    expect(stored).toMatchObject({ name: "Globex — 50 seats", stage: "prospecting", amount: 50_000, ownerEmail: rep.email });
    expect(stored?.stageHistory).toHaveLength(1);
    expect(await auditActions()).toEqual(expect.arrayContaining(["account.created", "deal.created"]));
  });

  it("enforces the stage machine and records stage history", async () => {
    await expectFleetError(data.updateDeal(await ctx(viewer), dealId, { stage: "discovery" }), 403);
    await data.updateDeal(await ctx(rep), dealId, { stage: "discovery" });
    await expectFleetError(data.updateDeal(await ctx(rep), dealId, { stage: "discovery" }), 400);
    await data.updateDeal(await ctx(rep), dealId, { stage: "closed_lost" });
    await expectFleetError(data.updateDeal(await ctx(rep), dealId, { stage: "proposal" }), 409);
    await expectFleetError(data.updateDeal(await ctx(admin), dealId, { stage: "closed_won" }), 409);
    await data.updateDeal(await ctx(admin), dealId, { stage: "demo" });
    const stored = (await db.doc(`products/revenue/tenants/${tenantId}/deals/${dealId}`).get()).data();
    expect(stored?.stage).toBe("demo");
    expect(stored?.stageHistory.map((change: { from: string | null; to: string; by: string }) => [change.from, change.to, change.by])).toEqual([
      [null, "prospecting", rep.email],
      ["prospecting", "discovery", rep.email],
      ["discovery", "closed_lost", rep.email],
      ["closed_lost", "demo", admin.email],
    ]);
    expect((await auditActions()).filter((action) => action === "deal.stage_changed")).toHaveLength(3);
  });

  it("refuses to store a transcript without a complete consent record (422)", async () => {
    const before = (await tenantDocs("calls")).length;
    const { consent: _omit, ...withoutConsent } = callInput();
    void _omit;
    await expectFleetError(data.createCall(await ctx(rep), withoutConsent as never), 422);
    await expectFleetError(data.createCall(await ctx(rep), callInput({ consent: { ...CONSENT, allPartyConfirmed: false } }) as never), 422);
    await expectFleetError(data.createCall(await ctx(rep), callInput({ consent: { ...CONSENT, jurisdiction: "" } }) as never), 422);
    await expectFleetError(data.createCall(await ctx(viewer), callInput()), 403);
    await expectFleetError(data.createCall(await ctx(rep), callInput({ repSpeaker: "Nobody" })), 422);
    await expectFleetError(data.createCall(await ctx(rep), callInput({ transcript: "   " })), 422);
    expect((await tenantDocs("calls")).length).toBe(before);
  });

  it("logs a consented call and persists deterministic analysis", async () => {
    callId = (await data.createCall(await ctx(rep), callInput())).id;
    const detail = await data.getCallDetail(await ctx(viewer), callId);
    expect(detail.call.consent).toMatchObject({ jurisdiction: "California, US", basis: "all-party-verbal", allPartyConfirmed: true, confirmedBy: rep.email });
    expect(detail.call.speakers).toEqual(["Ana Rep", "Ben Buyer"]);
    expect(detail.call.segments).toHaveLength(4);
    const analysis = detail.call.analysis;
    expect(analysis.competitorMentioned).toBe(true);
    expect(analysis.trackerHits.find((hit) => hit.keyword === "Gong")).toMatchObject({ kind: "competitor", segmentIndex: 1, start: 10 });
    expect(analysis.nextSteps.map((step) => step.segmentIndex)).toEqual([2]);
    expect(analysis.speakers.find((speaker) => speaker.speaker === "Ben Buyer")?.talkRatio).toBe(0.6667);
    // Same transcript + same trackers → same analysis.
    const trackers = (await tenantDocs("trackers")).map((doc) => ({ id: doc.id, name: doc.get("name"), kind: doc.get("kind"), keywords: doc.get("keywords") }));
    expect(analyzeCall(detail.call.segments, trackers)).toEqual(analysis);
    expect(detail.deal).toMatchObject({ id: dealId, stage: "demo" });
    // The audit log never carries transcript text.
    const logged = (await tenantDocs("auditEvents")).find((doc) => doc.get("action") === "call.logged");
    expect(JSON.stringify(logged?.data())).not.toContain("pricing process");
    expect(logged?.get("details")).toMatchObject({ dealId, segments: 4, consent: { allPartyConfirmed: true } });
  });

  it("adds comments at a timestamp", async () => {
    await expectFleetError(data.addComment(await ctx(viewer), callId, { at: 12, segmentIndex: 1, body: "Viewer note" }), 403);
    await expectFleetError(data.addComment(await ctx(rep), callId, { at: 12, segmentIndex: 99, body: "Bad segment" }), 422);
    await expectFleetError(data.addComment(await ctx(rep), "missing-call", { at: 0, segmentIndex: null, body: "No call" }), 404);
    await data.addComment(await ctx(manager), callId, { at: 40, segmentIndex: 2, body: "Good dated next step" });
    await data.addComment(await ctx(rep), callId, { at: 10, segmentIndex: 1, body: "Competitor came up here" });
    const detail = await data.getCallDetail(await ctx(rep), callId);
    expect(detail.comments.map((comment) => [comment.at, comment.authorEmail])).toEqual([[10, rep.email], [40, manager.email]]);
  });

  it("computes risk signals with rule ids and transcript evidence", async () => {
    const workspace = await data.loadWorkspace(await ctx(viewer));
    const deal = workspace.deals.find((entry) => entry.id === dealId)!;
    expect(deal.callCount).toBe(1);
    expect(deal.risks.map((risk) => risk.code)).toEqual(["competitor_mentioned"]);
    expect(deal.risks[0]).toMatchObject({ callId, at: 10 });
    const quiet = workspace.deals.find((entry) => entry.id === quietDealId)!;
    expect(quiet.risks.map((risk) => risk.code).sort()).toEqual(["close_date_passed", "no_calls"]);
  });

  it("lets coaches score calls against the rubric", async () => {
    const scores = { discovery: 4, listening: 3, value: 4, objections: 3, "next-steps": 5 };
    await expectFleetError(data.addScorecard(await ctx(rep), callId, { scores, notes: "" }), 403);
    await expectFleetError(data.addScorecard(await ctx(manager), callId, { scores: { discovery: 4 }, notes: "" }), 422);
    const card = await data.addScorecard(await ctx(manager), callId, { scores, notes: "Solid close" });
    expect(card.percent).toBe(73);
    const workspace = await data.loadWorkspace(await ctx(rep));
    expect(workspace.calls.find((call) => call.id === callId)?.scorePercent).toBe(73);
    expect(workspace.repStats.find((stats) => stats.repEmail === rep.email)).toMatchObject({ calls: 1, avgScorePercent: 73, scoredCalls: 1 });
  });

  it("redacts PII without storing the removed text and recomputes analysis", async () => {
    const phone = "415-555-0100";
    const before = await data.getCallDetail(await ctx(manager), callId);
    const segment = before.call.segments[1];
    const charStart = segment.text.indexOf(phone);
    const fingerprint = segmentFingerprint(segment.text);
    await expectFleetError(data.redactCall(await ctx(rep), callId, { segmentIndex: 1, charStart, charEnd: charStart + phone.length, reason: "pii", fingerprint }), 403);
    await expectFleetError(data.redactCall(await ctx(manager), callId, { segmentIndex: 1, charStart: 0, charEnd: 9999, reason: "pii", fingerprint }), 422);
    await expectFleetError(data.redactCall(await ctx(manager), callId, { segmentIndex: 9, charStart: 0, charEnd: 1, reason: "pii", fingerprint }), 422);
    await data.redactCall(await ctx(manager), callId, { segmentIndex: 1, charStart, charEnd: charStart + phone.length, reason: "pii", fingerprint });
    // Redact the competitor name too: analysis must drop the hit.
    const afterPhone = (await data.getCallDetail(await ctx(manager), callId)).call.segments[1].text;
    const gongAt = afterPhone.indexOf("Gong");
    await data.redactCall(await ctx(manager), callId, { segmentIndex: 1, charStart: gongAt, charEnd: gongAt + 4, reason: "confidential", fingerprint: segmentFingerprint(afterPhone) });

    const raw = (await db.doc(`products/revenue/tenants/${tenantId}/calls/${callId}`).get()).data();
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain(phone);
    expect(serialized).not.toContain("Gong last quarter");
    expect(raw?.segments[1].text).toContain(REDACTION_MARK);
    expect(raw?.redactions).toHaveLength(2);
    expect(raw?.redactions[0]).toMatchObject({ segmentIndex: 1, length: phone.length, reason: "pii", by: manager.email });
    expect(raw?.analysis.competitorMentioned).toBe(false);
    expect(raw?.analysis.trackerHits.some((hit: { keyword: string }) => hit.keyword === "Gong")).toBe(false);
    const audits = (await tenantDocs("auditEvents")).filter((doc) => doc.get("action") === "call.redacted");
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits.map((doc) => doc.data()))).not.toContain(phone);
    // The risk signal that pointed at the competitor mention is gone after recomputation.
    const workspace = await data.loadWorkspace(await ctx(rep));
    expect(workspace.deals.find((entry) => entry.id === dealId)?.risks).toEqual([]);
  });

  it("clips call moments into playlists without copying transcript text", async () => {
    await expectFleetError(data.createSnippet(await ctx(viewer), callId, { title: "Clip", startSegment: 0, endSegment: 1, playlist: "Discovery", note: "" }), 403);
    await expectFleetError(data.createSnippet(await ctx(rep), callId, { title: "Clip", startSegment: 3, endSegment: 1, playlist: "Discovery", note: "" }), 422);
    const clip = await data.createSnippet(await ctx(rep), callId, { title: "Great opener", startSegment: 0, endSegment: 1, playlist: "Discovery openers", note: "Open question" });
    expect(clip).toMatchObject({ start: 0, end: 40, dealId });
    expect(JSON.stringify(clip)).not.toContain("pricing process");
    const other = await data.createSnippet(await ctx(rep2), callId, { title: "Close", startSegment: 2, endSegment: 3, playlist: "Closing", note: "" });
    await expectFleetError(data.deleteSnippet(await ctx(rep), other.id), 403);
    await data.deleteSnippet(await ctx(admin), other.id);
    const workspace = await data.loadWorkspace(await ctx(viewer));
    expect(workspace.snippets.map((snippet) => snippet.title)).toEqual(["Great opener"]);
  });

  it("assigns coaching that only the assignee can acknowledge", async () => {
    await expectFleetError(data.createAssignment(await ctx(rep), callId, { assigneeEmail: rep2.email, note: "Watch this", at: 40 }), 403);
    await expectFleetError(data.createAssignment(await ctx(manager), callId, { assigneeEmail: outsider.email, note: "Watch this", at: 40 }), 422);
    const assignment = await data.createAssignment(await ctx(manager), callId, { assigneeEmail: rep.email, note: "Listen to the close", at: 40 });
    await expectFleetError(data.acknowledgeAssignment(await ctx(rep2), assignment.id), 403);
    const acknowledged = await data.acknowledgeAssignment(await ctx(rep), assignment.id);
    expect(acknowledged.status).toBe("acknowledged");
    await expectFleetError(data.acknowledgeAssignment(await ctx(rep), assignment.id), 409);
  });

  it("previews and applies retention, cascading every call record", async () => {
    await expectFleetError(data.previewRetention(await ctx(manager)), 403);
    await expectFleetError(data.applyRetention(await ctx(owner)), 409);
    await expectFleetError(data.updateSettings(await ctx(manager), { retentionDays: 30 }), 403);
    const oldCallId = (await data.createCall(await ctx(rep), callInput({ title: "Old intro call", occurredAt: new Date(Date.now() - 90 * 86_400_000).toISOString() }))).id;
    await data.addComment(await ctx(rep), oldCallId, { at: 0, segmentIndex: 0, body: "Old note" });
    await data.addScorecard(await ctx(manager), oldCallId, { scores: { discovery: 3, listening: 3, value: 3, objections: 3, "next-steps": 3 }, notes: "" });
    await data.createSnippet(await ctx(rep), oldCallId, { title: "Old clip", startSegment: 0, endSegment: 0, playlist: "Archive", note: "" });
    await data.createAssignment(await ctx(manager), oldCallId, { assigneeEmail: rep2.email, note: "Old review", at: null });

    await data.updateSettings(await ctx(admin), { retentionDays: 30 });
    const preview = await data.previewRetention(await ctx(admin));
    expect(preview).toEqual({ retentionDays: 30, calls: [expect.objectContaining({ id: oldCallId, title: "Old intro call" })] });
    expect(await data.applyRetention(await ctx(admin))).toEqual({ deleted: 1 });

    expect((await db.doc(`products/revenue/tenants/${tenantId}/calls/${oldCallId}`).get()).exists).toBe(false);
    for (const name of ["callComments", "scorecards", "snippets", "assignments"]) {
      expect((await tenantDocs(name)).filter((doc) => doc.get("callId") === oldCallId), name).toHaveLength(0);
    }
    expect((await db.doc(`products/revenue/tenants/${tenantId}/calls/${callId}`).get()).exists).toBe(true);
    const applied = (await tenantDocs("auditEvents")).find((doc) => doc.get("action") === "retention.applied");
    expect(applied?.get("details")).toMatchObject({ retentionDays: 30, deletedCalls: [oldCallId] });
    await data.updateSettings(await ctx(admin), { retentionDays: null });
  });

  it("deletes a single call with a recorded reason (admins only)", async () => {
    const doomed = (await data.createCall(await ctx(rep), callInput({ title: "Wrong deal" }))).id;
    await data.addComment(await ctx(rep), doomed, { at: 1, segmentIndex: 0, body: "oops" });
    await expectFleetError(data.deleteCall(await ctx(manager), doomed, "Logged against the wrong deal"), 403);
    await data.deleteCall(await ctx(admin), doomed, "Logged against the wrong deal");
    await expectFleetError(data.getCallDetail(await ctx(admin), doomed), 404);
    expect((await tenantDocs("callComments")).filter((doc) => doc.get("callId") === doomed)).toHaveLength(0);
    const deleted = (await tenantDocs("auditEvents")).find((doc) => doc.get("action") === "call.deleted");
    expect(deleted?.get("details")).toMatchObject({ reason: "Logged against the wrong deal", comments: 1 });
  });

  it("restricts trackers and settings to admins", async () => {
    await expectFleetError(data.saveTracker(await ctx(manager), null, { name: "Legal", kind: "keyword", keywords: ["contract"] }), 403);
    const { id } = await data.saveTracker(await ctx(admin), null, { name: "Legal", kind: "keyword", keywords: ["contract", " contract "] });
    expect((await db.doc(`products/revenue/tenants/${tenantId}/trackers/${id}`).get()).get("keywords")).toEqual(["contract"]);
    await expectFleetError(data.deleteTracker(await ctx(rep), id), 403);
    await data.deleteTracker(await ctx(owner), id);
    await expectFleetError(data.updateSettings(await ctx(admin), { staleAfterDays: 14 }), 400);
    await expectFleetError(data.reanalyzeCall(await ctx(viewer), callId), 403);
    await data.reanalyzeCall(await ctx(rep), callId);
  });

  it("stays consistent under concurrent writes", async () => {
    // Two first loads at once (board + call page) must seed trackers exactly once.
    const fresh = (await platform.createTenant("revenue", owner, "Concurrent Co")).id;
    const freshCtx = await ctx(owner, fresh);
    await Promise.all([data.loadWorkspace(freshCtx), data.loadWorkspace(freshCtx), data.loadWorkspace(freshCtx)]);
    expect((await tenantDocs("trackers", fresh)).length).toBe(4);
    expect((await auditActions(fresh)).filter((action) => action === "workspace.seeded")).toHaveLength(1);

    const [repCtx, rep2Ctx, managerCtx, adminCtx] = await Promise.all([ctx(rep), ctx(rep2), ctx(manager), ctx(admin)]);
    // Two concurrent stage moves: every move that succeeded is in the history, in order.
    const racer = (await data.createDeal(repCtx, { name: "Race", accountId, stage: "prospecting", amount: 1, currency: "USD", closeDate: null, ownerEmail: rep.email })).id;
    const moves = await Promise.allSettled([
      data.updateDeal(repCtx, racer, { stage: "discovery" }),
      data.updateDeal(rep2Ctx, racer, { stage: "demo" }),
    ]);
    const raced = (await db.doc(`products/revenue/tenants/${tenantId}/deals/${racer}`).get()).data();
    expect(raced?.stageHistory).toHaveLength(1 + moves.filter((move) => move.status === "fulfilled").length);
    expect(raced?.stageHistory.at(-1).to).toBe(raced?.stage);
    for (let i = 1; i < raced?.stageHistory.length; i += 1) {
      expect(raced?.stageHistory[i].from).toBe(raced?.stageHistory[i - 1].to);
    }

    // Two coaches redacting different spans at once: neither redaction may be undone.
    const racy = (await data.createCall(repCtx, callInput({ title: "Redaction race" }))).id;
    const text = (await data.getCallDetail(managerCtx, racy)).call.segments[1].text;
    const phoneAt = text.indexOf("415-555-0100");
    const gongAt = text.indexOf("Gong");
    const fingerprint = segmentFingerprint(text);
    const redactions = await Promise.allSettled([
      data.redactCall(managerCtx, racy, { segmentIndex: 1, charStart: phoneAt, charEnd: phoneAt + 12, reason: "pii", fingerprint }),
      data.redactCall(adminCtx, racy, { segmentIndex: 1, charStart: gongAt, charEnd: gongAt + 4, reason: "confidential", fingerprint }),
    ]);
    const after = (await db.doc(`products/revenue/tenants/${tenantId}/calls/${racy}`).get()).data();
    const applied = redactions.filter((result) => result.status === "fulfilled").length;
    expect(applied).toBeGreaterThanOrEqual(1);
    expect(after?.redactions).toHaveLength(applied);
    // A redaction computed against a transcript that changed underneath it is refused (409), never misapplied.
    for (const result of redactions) {
      if (result.status === "rejected") expect((result.reason as InstanceType<typeof FleetError>).status).toBe(409);
    }
    const storedText: string = after?.segments[1].text;
    if (redactions[0].status === "fulfilled") expect(storedText).not.toContain("415-555-0100");
    if (redactions[1].status === "fulfilled") expect(storedText).not.toContain("Gong");
    // A stale fingerprint is refused even when it does not race.
    await expectFleetError(data.redactCall(managerCtx, racy, { segmentIndex: 1, charStart: 0, charEnd: 2, reason: "pii", fingerprint }), 409);
    await data.deleteCall(adminCtx, racy, "Test cleanup");
  });

  it("isolates tenants completely", async () => {
    const rivalCtx = await ctx(rival, rivalTenantId);
    const workspace = await data.loadWorkspace(rivalCtx);
    expect(workspace.deals).toEqual([]);
    expect(workspace.calls).toEqual([]);
    expect(workspace.accounts).toEqual([]);
    await expectFleetError(data.getCallDetail(rivalCtx, callId), 404);
    await expectFleetError(data.updateDeal(rivalCtx, dealId, { stage: "proposal" }), 404);
    await expectFleetError(data.addComment(rivalCtx, callId, { at: 0, segmentIndex: null, body: "peek" }), 404);
    await expectFleetError(data.createDeal(rivalCtx, { name: "Steal", accountId, stage: "prospecting", amount: 1, currency: "USD", closeDate: null, ownerEmail: rival.email }), 404);
    expect((await data.searchCalls(rivalCtx, "proposal")).results).toEqual([]);
    expect((await data.searchCalls(await ctx(viewer), "proposal")).results.length).toBeGreaterThan(0);
    const rivalExport = await data.exportWorkspace(rivalCtx);
    expect(JSON.stringify(rivalExport.data)).not.toContain(dealId);
  });

  it("audits every mutation and limits the audit log to coaches", async () => {
    await expectFleetError(data.listAudit(await ctx(rep)), 403);
    const events = await data.listAudit(await ctx(manager));
    const actions = new Set(events.map((event) => event.action));
    for (const action of [
      "tenant.created", "workspace.seeded", "account.created", "deal.created", "deal.stage_changed", "call.logged", "call.commented",
      "call.scored", "call.redacted", "snippet.created", "snippet.deleted", "coaching.assigned", "coaching.acknowledged",
      "settings.updated", "retention.applied", "call.deleted", "tracker.created", "tracker.deleted", "call.reanalyzed",
    ]) {
      expect(actions, action).toContain(action);
    }
  });

  it("exports every record for admins only", async () => {
    await expectFleetError(data.exportWorkspace(await ctx(manager)), 403);
    const payload = await data.exportWorkspace(await ctx(admin));
    expect(payload.manifest).toMatchObject({ schema: "net.saasassin.workspace-export", product: "revenue", tenantId });
    for (const name of ["accounts", "deals", "calls", "callComments", "scorecards", "snippets", "assignments", "trackers", "settings"]) {
      const stored = await tenantDocs(name);
      expect(payload.data[name], name).toHaveLength(stored.length);
      expect(payload.manifest.files.find((file) => file.path === `${name}.json`)?.records).toBe(stored.length);
    }
    expect(payload.data.members).toHaveLength(6);
    const exportedCall = (payload.data.calls as Array<{ id: string; segments: unknown[]; consent: unknown }>).find((call) => call.id === callId);
    expect(exportedCall?.segments).toHaveLength(4);
    expect(exportedCall?.consent).toMatchObject({ allPartyConfirmed: true });
    expect((payload.data.auditEvents as unknown[]).length).toBeGreaterThan(20);
    expect(await auditActions()).toContain("workspace.exported");
  });
});
