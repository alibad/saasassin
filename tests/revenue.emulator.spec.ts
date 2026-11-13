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
const pipeline = await import("@/lib/revenue/pipeline-data");
const hooks = await import("@/lib/revenue/webhook-data");
const { SIGNATURE_HEADER, verifySignature } = await import("@/lib/revenue/webhooks");

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

  it("shows every member's profile name, title and photo, and nothing for people outside the workspace", async () => {
    await db.doc(`products/revenue/users/${rep.uid}`).set({ name: "Ana Reyes", title: "Account Executive", photo: { source: "upload", version: 3, chosen: true } });
    await db.doc(`products/revenue/users/${rival.uid}`).set({ name: "Rita Rival", title: "Spy", photo: { source: "upload", version: 1, chosen: true } });
    const workspace = await data.loadWorkspace(await ctx(viewer));
    const ana = workspace.members.find((member) => member.uid === rep.uid);
    expect(ana).toMatchObject({ name: "Ana Reyes", title: "Account Executive", photoURL: `/api/fleet/revenue/avatars/${rep.uid}?v=3` });
    expect(workspace.members.find((member) => member.uid === manager.uid)).toMatchObject({ name: "Mia Manager", title: "", photoURL: null });
    expect(workspace.members.some((member) => member.uid === rival.uid)).toBe(false);
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

const CARA_TRANSCRIPT = `WEBVTT

00:00:00.000 --> 00:00:20.000
<v Ana Rep>Thanks Cara. What would budget approval need from us?

00:00:20.000 --> 00:01:00.000
<v Cara CFO>A security review and a signed DPA. I'll follow up with procurement next week.
`;

describe("revenue round 2: contacts, forecast, timeline, webhooks, retention queue", () => {
  let benId = "";
  let caraId = "";
  let otherAccountId = "";
  let otherDealId = "";
  let caraCallId = "";
  let webhookId = "";
  let secret = "";
  const sent: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const delivery = {
    fetcher: async (url: string, init: RequestInit) => {
      sent.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
      return { status: 204 };
    },
    resolve: async () => ["93.184.216.34"],
  };
  const withDelivery = async (user: User, options: typeof delivery | Record<string, unknown> = delivery) => ({ ...(await ctx(user)), delivery: options as never });

  it("adds contacts on accounts and their roles in deals", async () => {
    await expectFleetError(pipeline.createContact(await ctx(viewer), { accountId, name: "Ben Buyer", title: "", email: "" }), 403);
    await expectFleetError(pipeline.createContact(await ctx(rep), { accountId: "missing", name: "Ben Buyer", title: "", email: "" }), 404);
    benId = (await pipeline.createContact(await ctx(rep), { accountId, name: "Ben Buyer", title: "VP Sales", email: "Ben@Globex.test" })).id;
    caraId = (await pipeline.createContact(await ctx(rep), { accountId, name: "Cara CFO", title: "CFO", email: "" })).id;
    expect((await db.doc(`products/revenue/tenants/${tenantId}/contacts/${benId}`).get()).data()).toMatchObject({ name: "Ben Buyer", email: "ben@globex.test", dealRoles: [] });

    await pipeline.setContactDealRole(await ctx(rep), benId, { dealId, role: "champion" });
    await pipeline.setContactDealRole(await ctx(rep), caraId, { dealId, role: "decision_maker" });
    await expectFleetError(pipeline.setContactDealRole(await ctx(rep), benId, { dealId, role: "champion" }), 400);
    await expectFleetError(pipeline.setContactDealRole(await ctx(viewer), benId, { dealId, role: "blocker" }), 403);
    otherAccountId = (await data.createAccount(await ctx(rep), { name: "Initech", domain: "" })).id;
    otherDealId = (await data.createDeal(await ctx(rep), { name: "Initech — trial", accountId: otherAccountId, stage: "discovery", amount: 9_000, currency: "USD", closeDate: "2099-11-15", ownerEmail: rep2.email })).id;
    await expectFleetError(pipeline.setContactDealRole(await ctx(rep), benId, { dealId: otherDealId, role: "blocker" }), 422);

    await pipeline.updateContact(await ctx(rep), benId, { title: "SVP Sales" });
    await expectFleetError(pipeline.updateContact(await ctx(rep), benId, { title: "SVP Sales" }), 400);
    const updated = (await tenantDocs("auditEvents")).find((doc) => doc.get("action") === "contact.updated");
    expect(updated?.get("details")).toEqual({ fields: ["title"] });

    const workspace = await data.loadWorkspace(await ctx(viewer));
    expect(workspace.deals.find((deal) => deal.id === dealId)?.contacts).toEqual([
      { contactId: benId, role: "champion" },
      { contactId: caraId, role: "decision_maker" },
    ]);
  });

  it("links speakers to contacts and members, computes talk time and the multi-threading signal", async () => {
    await expectFleetError(pipeline.linkSpeaker(await ctx(viewer), callId, { speaker: "Ben Buyer", link: { kind: "contact", contactId: benId } }), 403);
    await expectFleetError(pipeline.linkSpeaker(await ctx(rep), callId, { speaker: "Nobody", link: { kind: "contact", contactId: benId } }), 422);
    const initechPerson = (await pipeline.createContact(await ctx(rep), { accountId: otherAccountId, name: "Ian Initech", title: "", email: "" })).id;
    await expectFleetError(pipeline.linkSpeaker(await ctx(rep), callId, { speaker: "Ben Buyer", link: { kind: "contact", contactId: initechPerson } }), 422);
    await expectFleetError(pipeline.linkSpeaker(await ctx(rep), callId, { speaker: "Ana Rep", link: { kind: "member", email: outsider.email } }), 422);

    await pipeline.linkSpeaker(await ctx(rep), callId, { speaker: "Ben Buyer", link: { kind: "contact", contactId: benId } });
    await pipeline.linkSpeaker(await ctx(rep), callId, { speaker: "Ana Rep", link: { kind: "member", email: rep.email } });
    const stored = (await db.doc(`products/revenue/tenants/${tenantId}/calls/${callId}`).get()).data();
    expect(stored?.speakerLinks).toEqual([
      { speaker: "Ana Rep", kind: "member", email: rep.email },
      { speaker: "Ben Buyer", kind: "contact", contactId: benId },
    ]);
    expect(stored?.linkedContactIds).toEqual([benId]);

    let workspace = await data.loadWorkspace(await ctx(viewer));
    expect(workspace.contacts.find((contact) => contact.id === benId)?.engagement).toMatchObject({ calls: 1, talkSeconds: 40, talkShare: 0.6667, lastCallId: callId, dealIds: [dealId] });
    expect(workspace.contacts.find((contact) => contact.id === caraId)?.engagement).toBeNull();
    const single = workspace.deals.find((deal) => deal.id === dealId)?.risks.find((risk) => risk.code === "single_threaded");
    expect(single).toMatchObject({ callId, severity: "medium" });
    expect(single?.message).toContain("Ben Buyer");

    // A second stakeholder speaks on a later call: the deal is multi-threaded.
    caraCallId = (await data.createCall(await ctx(rep), callInput({ title: "CFO review", transcript: CARA_TRANSCRIPT, occurredAt: new Date(Date.now() - 86_400_000).toISOString() }))).id;
    await pipeline.linkSpeaker(await ctx(rep), caraCallId, { speaker: "Cara CFO", link: { kind: "contact", contactId: caraId } });
    workspace = await data.loadWorkspace(await ctx(viewer));
    expect(workspace.deals.find((deal) => deal.id === dealId)?.risks.map((risk) => risk.code)).not.toContain("single_threaded");
    expect(workspace.contacts.find((contact) => contact.id === caraId)?.engagement).toMatchObject({ calls: 1, talkSeconds: 40 });

    // Unlinking is audited; deleting a contact removes its links from every call.
    await pipeline.linkSpeaker(await ctx(rep), callId, { speaker: "Ana Rep", link: null });
    await pipeline.deleteContact(await ctx(rep), initechPerson);
    expect(await auditActions()).toEqual(expect.arrayContaining(["call.speaker_linked", "call.speaker_unlinked", "contact.deleted"]));
    // Tenant isolation for contacts.
    const rivalCtx = await ctx(rival, rivalTenantId);
    await expectFleetError(pipeline.setContactDealRole(rivalCtx, benId, { dealId, role: "blocker" }), 404);
    await expectFleetError(pipeline.linkSpeaker(rivalCtx, callId, { speaker: "Ben Buyer", link: null }), 404);
    expect((await data.loadWorkspace(rivalCtx)).contacts).toEqual([]);
  });

  it("forecasts weighted pipeline from owner calls, manager overrides and editable probabilities", async () => {
    await expectFleetError(pipeline.setDealForecast(await ctx(rep2), dealId, { kind: "call", category: "commit" }), 403);
    await expectFleetError(pipeline.setDealForecast(await ctx(viewer), dealId, { kind: "call", category: "commit" }), 403);
    await pipeline.setDealForecast(await ctx(rep), dealId, { kind: "call", category: "commit" });
    await expectFleetError(pipeline.setDealForecast(await ctx(rep), dealId, { kind: "override", category: "pipeline", reason: "Self override" }), 403);
    await pipeline.setDealForecast(await ctx(rep2), quietDealId, { kind: "call", category: "best_case" });

    let forecast = (await data.loadWorkspace(await ctx(viewer))).forecast;
    expect(forecast.byMonth.find((bucket) => bucket.key === "2099-12")).toMatchObject({ deals: 1, pipeline: 50_000, weighted: 20_000, commit: 50_000, bestCase: 50_000 });
    expect(forecast.byMonth.find((bucket) => bucket.key === "2020-01")).toMatchObject({ deals: 1, pipeline: 5_000, weighted: 1_000, commit: 0, bestCase: 5_000 });
    expect(forecast.byRep.find((bucket) => bucket.key === rep2.email)).toMatchObject({ pipeline: 14_000, weighted: 2_800, bestCase: 5_000 });

    await pipeline.setDealForecast(await ctx(manager), dealId, { kind: "override", category: "best_case", reason: "Security review not started" });
    const deal = (await db.doc(`products/revenue/tenants/${tenantId}/deals/${dealId}`).get()).data();
    expect(deal?.forecast).toMatchObject({ call: { category: "commit", by: rep.email }, override: { category: "best_case", by: manager.email, reason: "Security review not started" } });
    forecast = (await data.loadWorkspace(await ctx(viewer))).forecast;
    expect(forecast.byMonth.find((bucket) => bucket.key === "2099-12")).toMatchObject({ commit: 0, bestCase: 50_000 });

    await expectFleetError(data.updateSettings(await ctx(manager), { stageProbabilities: { demo: 50 } }), 403);
    await expectFleetError(data.updateSettings(await ctx(admin), { stageProbabilities: { closed_won: 90 } }), 422);
    await data.updateSettings(await ctx(admin), { stageProbabilities: { demo: 50 } });
    forecast = (await data.loadWorkspace(await ctx(viewer))).forecast;
    expect(forecast.probabilities.demo).toBe(50);
    expect(forecast.byMonth.find((bucket) => bucket.key === "2099-12")?.weighted).toBe(25_000);

    await pipeline.setDealForecast(await ctx(manager), dealId, { kind: "clear_override" });
    await expectFleetError(pipeline.setDealForecast(await ctx(manager), dealId, { kind: "clear_override" }), 409);
    expect((await data.loadWorkspace(await ctx(viewer))).deals.find((entry) => entry.id === dealId)?.forecastCategory).toBe("commit");
    const overridden = (await tenantDocs("auditEvents")).find((doc) => doc.get("action") === "deal.forecast_overridden");
    expect(overridden?.get("details")).toMatchObject({ from: "commit", to: "best_case", ownerCall: "commit", reason: "Security review not started" });
    expect(await auditActions()).toEqual(expect.arrayContaining(["deal.forecast_called", "deal.forecast_override_cleared"]));
    const settingsAudit = (await tenantDocs("auditEvents")).find((doc) => doc.get("action") === "settings.updated" && doc.get("details.stageProbabilities"));
    expect(settingsAudit?.get("details.stageProbabilities")).toEqual({ demo: { from: 40, to: 50 } });
  });

  it("builds a unified deal timeline with time-in-stage and stalled deals", async () => {
    const timeline = await pipeline.getDealTimeline(await ctx(viewer), dealId);
    const kinds = timeline.entries.map((entry) => entry.kind);
    expect(kinds.filter((kind) => kind === "stage")).toHaveLength(4);
    expect(kinds.filter((kind) => kind === "call")).toHaveLength(2);
    expect(kinds).toContain("next_step");
    expect(timeline.entries.filter((entry) => entry.kind === "comment").map((entry) => entry.kind === "comment" && entry.body).sort()).toEqual(["Competitor came up here", "Good dated next step"]);
    expect(timeline.entries[0].at >= timeline.entries.at(-1)!.at).toBe(true);
    expect(timeline.stats).toMatchObject({ currentStage: "demo", stalled: false, stalledAfterDays: 30 });
    expect(timeline.stats.durations.map((entry) => entry.stage)).toEqual(["prospecting", "discovery", "demo", "closed_lost"]);
    expect(timeline.people.map((person) => [person.name, person.role])).toEqual([["Ben Buyer", "champion"], ["Cara CFO", "decision_maker"]]);
    await expectFleetError(pipeline.getDealTimeline(await ctx(rival, rivalTenantId), dealId), 404);
    await expectFleetError(pipeline.getDealTimeline(await ctx(viewer), "missing"), 404);

    // Backdate the Initech deal's stage entry: it is now stalled in Discovery.
    const old = new Date(Date.now() - 45 * 86_400_000).toISOString();
    await db.doc(`products/revenue/tenants/${tenantId}/deals/${otherDealId}`).update({ stageHistory: [{ from: null, to: "discovery", at: old, by: rep.email }], createdAt: old });
    const stalled = await pipeline.getDealTimeline(await ctx(viewer), otherDealId);
    expect(stalled.stats).toMatchObject({ stalled: true, daysInCurrentStage: 45 });
    const workspace = await data.loadWorkspace(await ctx(viewer));
    const initech = workspace.deals.find((deal) => deal.id === otherDealId)!;
    expect(initech.daysInStage).toBe(45);
    expect(initech.risks.find((risk) => risk.code === "stalled_in_stage")?.message).toContain("45 days");
  });

  it("manages signed webhooks for admins only and never stores secrets in reads or exports", async () => {
    await expectFleetError(hooks.createWebhook(await ctx(manager), { url: "https://hooks.example.com/revenue", events: ["call.analyzed"] }), 403);
    await expectFleetError(hooks.createWebhook(await ctx(admin), { url: "http://hooks.example.com/revenue", events: ["call.analyzed"] }), 422);
    await expectFleetError(hooks.createWebhook(await ctx(admin), { url: "https://10.0.0.8/hook", events: ["call.analyzed"] }), 422);
    await expectFleetError(hooks.createWebhook(await ctx(admin), { url: "https://localhost/hook", events: ["call.analyzed"] }), 422);
    await expectFleetError(hooks.createWebhook(await ctx(admin), { url: "https://metadata.google.internal/x", events: ["call.analyzed"] }), 422);
    const created = await hooks.createWebhook(await ctx(admin), { url: "https://hooks.example.com/revenue", events: ["call.analyzed", "deal.stage_changed"] });
    webhookId = created.webhook.id;
    secret = created.secret;
    expect(secret).toMatch(/^whsec_[0-9a-f]{48}$/);
    const listed = await hooks.listWebhooks(await ctx(owner));
    expect(listed.webhooks[0]).toMatchObject({ id: webhookId, secretHint: `whsec_…${secret.slice(-4)}`, active: true });
    expect(JSON.stringify(listed)).not.toContain(secret);
    await expectFleetError(hooks.listWebhooks(await ctx(manager)), 403);
    const audit = (await tenantDocs("auditEvents")).find((doc) => doc.get("action") === "webhook.created");
    expect(JSON.stringify(audit?.data())).not.toContain(secret);
  });

  it("delivers signed deal.stage_changed and call.analyzed events and logs honest outcomes", async () => {
    await data.updateDeal(await withDelivery(rep), dealId, { stage: "proposal" });
    const stage = sent.at(-1)!;
    expect(stage.url).toBe("https://hooks.example.com/revenue");
    expect(verifySignature(secret, stage.headers[SIGNATURE_HEADER], stage.body, Math.floor(Date.now() / 1000))).toBe(true);
    expect(verifySignature("whsec_wrong", stage.headers[SIGNATURE_HEADER], stage.body, Math.floor(Date.now() / 1000))).toBe(false);
    expect(JSON.parse(stage.body)).toMatchObject({ type: "deal.stage_changed", tenantId, data: { deal: { id: dealId }, from: "demo", to: "proposal", by: rep.email } });

    await data.reanalyzeCall(await withDelivery(rep), callId);
    const analyzed = JSON.parse(sent.at(-1)!.body);
    expect(analyzed).toMatchObject({ type: "call.analyzed", data: { reason: "reanalyzed", call: { id: callId, dealId }, analysis: { nextStepCount: 1 } } });
    expect(sent.at(-1)!.body).not.toContain("pricing process");
    expect(sent.at(-1)!.body).not.toContain("proposal by Friday");

    // A 500, a network error and a host that resolves privately are all logged as failures.
    await data.reanalyzeCall(await withDelivery(rep, { ...delivery, fetcher: async () => ({ status: 500 }) }), callId);
    await data.reanalyzeCall(await withDelivery(rep, { ...delivery, fetcher: async () => { throw new Error("ECONNRESET"); } }), callId);
    let calledPrivate = false;
    await data.reanalyzeCall(await withDelivery(rep, { fetcher: async () => { calledPrivate = true; return { status: 204 }; }, resolve: async () => ["10.1.2.3"] }), callId);
    expect(calledPrivate).toBe(false);
    const log = (await hooks.listWebhooks(await ctx(admin))).deliveries;
    expect(log.slice(0, 5).map((entry) => [entry.event, entry.status, entry.error])).toEqual([
      ["call.analyzed", "failed", "Refused: the host resolves to a private or internal address."],
      ["call.analyzed", "failed", "Network error: ECONNRESET"],
      ["call.analyzed", "failed", "Endpoint responded 500."],
      ["call.analyzed", "delivered", null],
      ["deal.stage_changed", "delivered", null],
    ]);

    // Disabled webhooks receive nothing; the test button still reaches them on demand.
    await hooks.setWebhookActive(await ctx(admin), webhookId, false);
    const before = sent.length;
    await data.updateDeal(await withDelivery(rep), dealId, { stage: "negotiation" });
    expect(sent.length).toBe(before);
    const test = await hooks.sendTestWebhook(await withDelivery(admin), webhookId);
    expect(test).toMatchObject({ event: "webhook.test", status: "delivered", httpStatus: 204 });
    await expectFleetError(hooks.sendTestWebhook(await ctx(manager), webhookId), 403);
    expect(await auditActions()).toEqual(expect.arrayContaining(["webhook.disabled", "webhook.tested"]));
  });

  it("shows a retention-due queue and applies retention to selected calls only", async () => {
    const day = 86_400_000;
    const make = async (title: string, daysAgo: number) => (await data.createCall(await ctx(rep), callInput({ title, occurredAt: new Date(Date.now() - daysAgo * day).toISOString() }))).id;
    const oldest = await make("Q1 kickoff", 60);
    const older = await make("Q1 follow-up", 45);
    const soon = await make("Recent check-in", 20);
    await expectFleetError(data.getRetentionQueue(await ctx(manager)), 403);
    expect((await data.getRetentionQueue(await ctx(admin))).due).toEqual([]);
    await data.updateSettings(await ctx(admin), { retentionDays: 30 });

    const queue = await data.getRetentionQueue(await ctx(admin));
    expect(queue.due.map((entry) => [entry.id, entry.daysOverdue, entry.dealName])).toEqual([[oldest, 30, "Globex — 50 seats"], [older, 15, "Globex — 50 seats"]]);
    expect(queue.upcoming.map((entry) => entry.id)).toEqual([soon]);
    expect(queue.due[0].dueAt.slice(0, 10)).toBe(new Date(Date.now() - 30 * day).toISOString().slice(0, 10));
    expect((await data.loadWorkspace(await ctx(admin))).retentionDueCount).toBe(2);
    expect((await data.loadWorkspace(await ctx(rep))).retentionDueCount).toBeNull();

    await expectFleetError(data.applyRetention(await ctx(admin), [soon]), 409);
    await expectFleetError(data.applyRetention(await ctx(manager), [oldest]), 403);
    expect(await data.applyRetention(await ctx(admin), [oldest])).toEqual({ deleted: 1 });
    expect((await db.doc(`products/revenue/tenants/${tenantId}/calls/${oldest}`).get()).exists).toBe(false);
    expect((await db.doc(`products/revenue/tenants/${tenantId}/calls/${older}`).get()).exists).toBe(true);
    const applied = (await tenantDocs("auditEvents")).filter((doc) => doc.get("action") === "retention.applied").map((doc) => doc.get("details"));
    expect(applied).toContainEqual(expect.objectContaining({ scope: "selected", deletedCalls: [oldest], retentionDays: 30 }));
    expect((await data.getRetentionQueue(await ctx(admin))).due.map((entry) => entry.id)).toEqual([older]);

    await data.updateSettings(await ctx(admin), { retentionDays: null });
    await data.deleteCall(await ctx(admin), older, "Test cleanup");
    await data.deleteCall(await ctx(admin), soon, "Test cleanup");
  });

  it("exports contacts, forecast calls, webhooks (secret redacted) and the delivery log", async () => {
    const payload = await data.exportWorkspace(await ctx(admin));
    for (const name of ["contacts", "webhooks", "webhookDeliveries", "deals", "calls"]) {
      expect(payload.data[name], name).toHaveLength((await tenantDocs(name)).length);
    }
    expect(payload.data.contacts).toHaveLength(2);
    expect((payload.data.webhookDeliveries as unknown[]).length).toBeGreaterThanOrEqual(6);
    expect(payload.data.webhooks).toEqual([expect.objectContaining({ id: webhookId, secret: "[redacted]" })]);
    expect(JSON.stringify(payload)).not.toContain(secret);
    const exportedDeal = (payload.data.deals as Array<{ id: string; forecast?: unknown }>).find((deal) => deal.id === dealId);
    expect(exportedDeal?.forecast).toMatchObject({ call: { category: "commit" }, override: null });
    const exportedCall = (payload.data.calls as Array<{ id: string; speakerLinks?: unknown }>).find((call) => call.id === callId);
    expect(exportedCall?.speakerLinks).toEqual([{ speaker: "Ben Buyer", kind: "contact", contactId: benId }]);
    await hooks.deleteWebhook(await ctx(admin), webhookId);
    expect(await tenantDocs("webhooks")).toHaveLength(0);
  });
});
