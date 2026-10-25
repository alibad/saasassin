import "server-only";

import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import { FleetError, requireFleetUser, type FleetUser } from "@/lib/fleet/platform/session";
import {
  appendAuditEvent,
  listAuditEvents,
  listTenantMembers,
  requireTenantMember,
  tenantCollection,
  tenantRef,
} from "@/lib/fleet/platform/tenants";

import { analyzeCall, DEFAULT_TRACKERS, type CallAnalysis, type Tracker } from "./analysis";
import { computeScorecard, DEFAULT_RUBRIC, redactSegments, aggregateRepStats, type RubricCriterion } from "./coaching";
import {
  checkStageTransition,
  computeRiskSignals,
  DEFAULT_RISK_CONFIG,
  type DealStage,
  type RiskConfig,
  type StageChange,
} from "./deals";
import { callsPastRetention } from "./retention";
import { isAdmin, REVENUE_SLUG as SLUG } from "./schemas";
import { parseTranscript, TranscriptParseError, type TranscriptFormat, type TranscriptSegment } from "./transcript";
import type { z } from "zod";
import type {
  accountSchema,
  callSchema,
  commentSchema,
  consentSchema,
  dealSchema,
  dealUpdateSchema,
  redactionSchema,
  scorecardSchema,
  trackerSchema,
} from "./schemas";

export type TenantContext = { user: FleetUser; tenantId: string; role: string; tenantName: string };

/** requireFleetUser → requireTenantMember (with optional role gate). Never trusts browser-sent roles. */
export async function requireRevenueTenant(tenantId: string, allowedRoles?: string[]): Promise<TenantContext> {
  const user = await requireFleetUser(SLUG);
  const { tenant, role } = await requireTenantMember(SLUG, tenantId, user, allowedRoles);
  return { user, tenantId, role, tenantName: tenant.name };
}

const col = (tenantId: string, name: string) => tenantCollection(SLUG, tenantId, name);
const nowIso = () => new Date().toISOString();

export type AccountRecord = { id: string; name: string; domain: string; createdAt: string; createdBy: string };
export type DealRecord = {
  id: string;
  name: string;
  accountId: string;
  stage: DealStage;
  amount: number;
  currency: string;
  closeDate: string | null;
  ownerEmail: string;
  stageHistory: StageChange[];
  createdAt: string;
  updatedAt: string;
};
export type ConsentRecord = z.infer<typeof consentSchema> & { confirmedBy: string; confirmedAt: string };
export type RedactionRecord = { segmentIndex: number; charStart: number; charEnd: number; length: number; reason: string; by: string; at: string };
export type CallRecord = {
  id: string;
  dealId: string;
  title: string;
  occurredAt: string;
  repEmail: string;
  repSpeaker: string | null;
  format: TranscriptFormat;
  timingEstimated: boolean;
  speakers: string[];
  segments: TranscriptSegment[];
  consent: ConsentRecord;
  analysis: CallAnalysis;
  redactions: RedactionRecord[];
  createdBy: string;
  createdAt: string;
  analyzedAt: string;
};
export type CommentRecord = { id: string; callId: string; at: number; segmentIndex: number | null; body: string; authorEmail: string; createdAt: string };
export type ScorecardRecord = {
  id: string;
  callId: string;
  rubric: RubricCriterion[];
  scores: Record<string, number>;
  percent: number;
  weightedScore: number;
  notes: string;
  scorerEmail: string;
  createdAt: string;
};
export type TrackerRecord = Tracker & { createdAt: string; updatedAt: string };
export type SettingsRecord = RiskConfig & { rubric: RubricCriterion[]; seededAt: string; retentionDays?: number | null };

async function list<T>(tenantId: string, name: string): Promise<T[]> {
  const snapshot = await col(tenantId, name).get();
  return snapshot.docs.map((doc) => ({ ...(doc.data() as object), id: doc.id }) as T);
}

/** First load of a workspace seeds default trackers + settings once (audited). */
export async function ensureSettings(ctx: TenantContext): Promise<SettingsRecord> {
  const ref = col(ctx.tenantId, "settings").doc("workspace");
  const snapshot = await ref.get();
  if (snapshot.exists) return snapshot.data() as SettingsRecord;
  const settings: SettingsRecord = { ...DEFAULT_RISK_CONFIG, rubric: DEFAULT_RUBRIC, seededAt: nowIso() };
  const batch = ref.firestore.batch();
  batch.set(ref, settings);
  for (const tracker of DEFAULT_TRACKERS) {
    const trackerRef = col(ctx.tenantId, "trackers").doc();
    batch.set(trackerRef, { ...tracker, id: trackerRef.id, createdAt: nowIso(), updatedAt: nowIso() });
  }
  await batch.commit();
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "workspace.seeded", { type: "settings", id: "workspace" }, {
    trackers: DEFAULT_TRACKERS.map((tracker) => tracker.name),
  });
  return settings;
}

function callSummary(call: CallRecord) {
  const { segments, analysis, ...rest } = call;
  return {
    ...rest,
    segmentCount: segments.length,
    analysis: {
      durationSeconds: analysis.durationSeconds,
      speakers: analysis.speakers,
      questionCount: analysis.questionCount,
      interactivity: analysis.interactivity,
      longestMonologue: analysis.longestMonologue,
      trackerSummary: analysis.trackerSummary,
      nextSteps: analysis.nextSteps,
      competitorMentioned: analysis.competitorMentioned,
    },
  };
}

export type CallSummary = ReturnType<typeof callSummary>;

function competitorHits(call: CallRecord) {
  return call.analysis.trackerHits
    .filter((hit) => hit.kind === "competitor")
    .map((hit) => ({ trackerName: hit.trackerName, keyword: hit.keyword, start: hit.start }));
}

export async function loadWorkspace(ctx: TenantContext) {
  const settings = await ensureSettings(ctx);
  const [accounts, deals, calls, trackers, members, scorecards] = await Promise.all([
    list<AccountRecord>(ctx.tenantId, "accounts"),
    list<DealRecord>(ctx.tenantId, "deals"),
    list<CallRecord>(ctx.tenantId, "calls"),
    list<TrackerRecord>(ctx.tenantId, "trackers"),
    listTenantMembers(SLUG, ctx.tenantId),
    list<ScorecardRecord>(ctx.tenantId, "scorecards"),
  ]);
  const now = new Date();
  const latestScore = new Map<string, number>();
  for (const card of [...scorecards].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    latestScore.set(card.callId, card.percent);
  }
  const callsByDeal = new Map<string, CallRecord[]>();
  for (const call of calls) callsByDeal.set(call.dealId, [...(callsByDeal.get(call.dealId) ?? []), call]);

  const enrichedDeals = deals
    .map((deal) => {
      const dealCalls = (callsByDeal.get(deal.id) ?? []).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      const risks = computeRiskSignals(
        { stage: deal.stage, closeDate: deal.closeDate, createdAt: deal.createdAt },
        dealCalls.map((call) => ({
          id: call.id,
          occurredAt: call.occurredAt,
          nextStepCount: call.analysis.nextSteps.length,
          competitorHits: competitorHits(call),
        })),
        now,
        { staleAfterDays: settings.staleAfterDays },
      );
      return {
        ...deal,
        callCount: dealCalls.length,
        lastCall: dealCalls[0] ? { id: dealCalls[0].id, title: dealCalls[0].title, occurredAt: dealCalls[0].occurredAt } : null,
        risks,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const repStats = aggregateRepStats(
    calls.map((call) => ({
      repEmail: call.repEmail,
      repSpeaker: call.repSpeaker,
      analysis: call.analysis,
      scorePercent: latestScore.get(call.id) ?? null,
    })),
  );

  return {
    tenant: { id: ctx.tenantId, name: ctx.tenantName },
    role: ctx.role,
    user: { email: ctx.user.email, name: ctx.user.name },
    settings,
    accounts: accounts.sort((a, b) => a.name.localeCompare(b.name)),
    deals: enrichedDeals,
    calls: calls
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .map((call) => ({ ...callSummary(call), scorePercent: latestScore.get(call.id) ?? null })),
    trackers: trackers.sort((a, b) => a.name.localeCompare(b.name)),
    members: members.filter((member) => member.status === "active").map(({ uid, email, name, role }) => ({ uid, email, name, role })),
    repStats,
  };
}

export async function createAccount(ctx: TenantContext, input: z.infer<typeof accountSchema>) {
  const ref = col(ctx.tenantId, "accounts").doc();
  const record: AccountRecord = { id: ref.id, name: input.name, domain: input.domain, createdAt: nowIso(), createdBy: ctx.user.email };
  await ref.set(record);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "account.created", { type: "account", id: ref.id }, { name: input.name });
  return record;
}

async function requireDoc<T>(tenantId: string, collection: string, id: string, label: string) {
  const snapshot = await col(tenantId, collection).doc(id).get();
  if (!snapshot.exists) throw new FleetError(`${label} not found.`, 404);
  return { ...(snapshot.data() as object), id: snapshot.id } as T;
}

export async function createDeal(ctx: TenantContext, input: z.infer<typeof dealSchema>) {
  await requireDoc<AccountRecord>(ctx.tenantId, "accounts", input.accountId, "Account");
  const ref = col(ctx.tenantId, "deals").doc();
  const at = nowIso();
  const record: DealRecord = {
    id: ref.id,
    name: input.name,
    accountId: input.accountId,
    stage: input.stage,
    amount: input.amount,
    currency: input.currency,
    closeDate: input.closeDate,
    ownerEmail: input.ownerEmail,
    stageHistory: [{ from: null, to: input.stage, at, by: ctx.user.email }],
    createdAt: at,
    updatedAt: at,
  };
  await ref.set(record);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "deal.created", { type: "deal", id: ref.id }, {
    name: input.name,
    stage: input.stage,
    amount: input.amount,
  });
  return record;
}

export async function updateDeal(ctx: TenantContext, dealId: string, input: z.infer<typeof dealUpdateSchema>) {
  const deal = await requireDoc<DealRecord>(ctx.tenantId, "deals", dealId, "Deal");
  const at = nowIso();
  const patch: Partial<DealRecord> = { updatedAt: at };
  const changes: Record<string, unknown> = {};
  if (input.stage && input.stage !== deal.stage) {
    const check = checkStageTransition(deal.stage, input.stage, { privileged: isAdmin(ctx.role) });
    if (!check.allowed) throw new FleetError(check.reason, 409);
    patch.stage = input.stage;
    patch.stageHistory = [...(deal.stageHistory ?? []), { from: deal.stage, to: input.stage, at, by: ctx.user.email }];
    changes.stage = { from: deal.stage, to: input.stage };
  }
  if (input.amount !== undefined && input.amount !== deal.amount) {
    patch.amount = input.amount;
    changes.amount = { from: deal.amount, to: input.amount };
  }
  if (input.closeDate !== undefined && input.closeDate !== deal.closeDate) {
    patch.closeDate = input.closeDate;
    changes.closeDate = { from: deal.closeDate, to: input.closeDate };
  }
  if (input.ownerEmail && input.ownerEmail !== deal.ownerEmail) {
    patch.ownerEmail = input.ownerEmail;
    changes.ownerEmail = { from: deal.ownerEmail, to: input.ownerEmail };
  }
  if (!Object.keys(changes).length) throw new FleetError("Nothing changed.", 400);
  await col(ctx.tenantId, "deals").doc(dealId).update(patch);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, changes.stage ? "deal.stage_changed" : "deal.updated", { type: "deal", id: dealId }, changes);
  return { ...deal, ...patch };
}

async function currentTrackers(tenantId: string) {
  const trackers = await list<TrackerRecord>(tenantId, "trackers");
  return trackers.map(({ id, name, kind, keywords }) => ({ id, name, kind, keywords }));
}

export async function createCall(ctx: TenantContext, input: z.infer<typeof callSchema>) {
  // Consent is validated by callSchema (z.literal(true)); re-assert so no caller can bypass it.
  if (input.consent?.allPartyConfirmed !== true || !input.consent.jurisdiction || !input.consent.basis) {
    throw new FleetError("Recording consent is required before a transcript can be stored.", 422);
  }
  await requireDoc<DealRecord>(ctx.tenantId, "deals", input.dealId, "Deal");
  let parsed;
  try {
    parsed = parseTranscript(input.transcript, input.format);
  } catch (error) {
    if (error instanceof TranscriptParseError) throw new FleetError(error.message, 422);
    throw error;
  }
  if (input.repSpeaker && !parsed.speakers.includes(input.repSpeaker)) {
    throw new FleetError("The rep speaker is not in this transcript.", 422);
  }
  const trackers = await currentTrackers(ctx.tenantId);
  const analysis = analyzeCall(parsed.segments, trackers);
  const ref = col(ctx.tenantId, "calls").doc();
  const at = nowIso();
  const record: CallRecord = {
    id: ref.id,
    dealId: input.dealId,
    title: input.title,
    occurredAt: new Date(input.occurredAt).toISOString(),
    repEmail: input.repEmail,
    repSpeaker: input.repSpeaker,
    format: parsed.format,
    timingEstimated: parsed.timingEstimated,
    speakers: parsed.speakers,
    segments: parsed.segments,
    consent: { ...input.consent, confirmedBy: ctx.user.email, confirmedAt: at },
    analysis,
    redactions: [],
    createdBy: ctx.user.email,
    createdAt: at,
    analyzedAt: at,
  };
  await ref.set(record);
  // Transcript text never goes into the audit log — only counts and consent metadata.
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "call.logged", { type: "call", id: ref.id }, {
    dealId: input.dealId,
    format: parsed.format,
    segments: parsed.segments.length,
    consent: { jurisdiction: input.consent.jurisdiction, basis: input.consent.basis, allPartyConfirmed: true },
  });
  return { id: ref.id };
}

export async function getCallDetail(ctx: TenantContext, callId: string) {
  const call = await requireDoc<CallRecord>(ctx.tenantId, "calls", callId, "Call");
  const [comments, scorecards, deal] = await Promise.all([
    col(ctx.tenantId, "callComments").where("callId", "==", callId).get(),
    col(ctx.tenantId, "scorecards").where("callId", "==", callId).get(),
    col(ctx.tenantId, "deals").doc(call.dealId).get(),
  ]);
  const settings = await ensureSettings(ctx);
  return {
    call,
    deal: deal.exists ? { id: deal.id, name: String(deal.get("name")), stage: deal.get("stage") as DealStage } : null,
    comments: comments.docs
      .map((doc) => ({ ...(doc.data() as CommentRecord), id: doc.id }))
      .sort((a, b) => a.at - b.at || a.createdAt.localeCompare(b.createdAt)),
    scorecards: scorecards.docs
      .map((doc) => ({ ...(doc.data() as ScorecardRecord), id: doc.id }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    rubric: settings.rubric,
  };
}

export async function addComment(ctx: TenantContext, callId: string, input: z.infer<typeof commentSchema>) {
  const call = await requireDoc<CallRecord>(ctx.tenantId, "calls", callId, "Call");
  if (input.segmentIndex !== null && !call.segments.some((segment) => segment.index === input.segmentIndex)) {
    throw new FleetError("That transcript segment does not exist.", 422);
  }
  const ref = col(ctx.tenantId, "callComments").doc();
  const record: CommentRecord = { id: ref.id, callId, at: input.at, segmentIndex: input.segmentIndex, body: input.body, authorEmail: ctx.user.email, createdAt: nowIso() };
  await ref.set(record);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "call.commented", { type: "call", id: callId }, { commentId: ref.id, at: input.at });
  return record;
}

export async function addScorecard(ctx: TenantContext, callId: string, input: z.infer<typeof scorecardSchema>) {
  await requireDoc<CallRecord>(ctx.tenantId, "calls", callId, "Call");
  const settings = await ensureSettings(ctx);
  let result;
  try {
    result = computeScorecard(settings.rubric, input.scores);
  } catch (error) {
    throw new FleetError(error instanceof Error ? error.message : "Score every criterion.", 422);
  }
  const ref = col(ctx.tenantId, "scorecards").doc();
  const record: ScorecardRecord = {
    id: ref.id,
    callId,
    rubric: settings.rubric,
    scores: Object.fromEntries(settings.rubric.map((criterion) => [criterion.id, input.scores[criterion.id]])),
    percent: result.percent,
    weightedScore: result.weightedScore,
    notes: input.notes,
    scorerEmail: ctx.user.email,
    createdAt: nowIso(),
  };
  await ref.set(record);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "call.scored", { type: "call", id: callId }, { scorecardId: ref.id, percent: result.percent });
  return record;
}

export async function redactCall(ctx: TenantContext, callId: string, input: z.infer<typeof redactionSchema>) {
  const call = await requireDoc<CallRecord>(ctx.tenantId, "calls", callId, "Call");
  let redacted;
  try {
    redacted = redactSegments(call.segments, input);
  } catch (error) {
    throw new FleetError(error instanceof Error ? error.message : "Select a span to redact.", 422);
  }
  const at = nowIso();
  const trackers = await currentTrackers(ctx.tenantId);
  const redaction: RedactionRecord = {
    segmentIndex: input.segmentIndex,
    charStart: input.charStart,
    charEnd: input.charEnd,
    length: redacted.redactedLength,
    reason: input.reason,
    by: ctx.user.email,
    at,
  };
  await col(ctx.tenantId, "calls").doc(callId).update({
    segments: redacted.segments,
    analysis: analyzeCall(redacted.segments, trackers),
    analyzedAt: at,
    redactions: [...(call.redactions ?? []), redaction],
  });
  // The removed text is not stored anywhere — the audit records position, length, and reason only.
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "call.redacted", { type: "call", id: callId }, {
    segmentIndex: input.segmentIndex,
    length: redacted.redactedLength,
    reason: input.reason,
  });
  return redaction;
}

export async function reanalyzeCall(ctx: TenantContext, callId: string) {
  const call = await requireDoc<CallRecord>(ctx.tenantId, "calls", callId, "Call");
  const trackers = await currentTrackers(ctx.tenantId);
  const analysis = analyzeCall(call.segments, trackers);
  await col(ctx.tenantId, "calls").doc(callId).update({ analysis, analyzedAt: nowIso() });
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "call.reanalyzed", { type: "call", id: callId }, { trackers: trackers.length });
  return analysis;
}

export async function saveTracker(ctx: TenantContext, trackerId: string | null, input: z.infer<typeof trackerSchema>) {
  const keywords = [...new Set(input.keywords.map((keyword) => keyword.trim()).filter(Boolean))];
  const at = nowIso();
  if (trackerId) {
    await requireDoc<TrackerRecord>(ctx.tenantId, "trackers", trackerId, "Tracker");
    await col(ctx.tenantId, "trackers").doc(trackerId).update({ name: input.name, kind: input.kind, keywords, updatedAt: at });
    await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "tracker.updated", { type: "tracker", id: trackerId }, { name: input.name, keywords });
    return { id: trackerId };
  }
  const ref = col(ctx.tenantId, "trackers").doc();
  await ref.set({ id: ref.id, name: input.name, kind: input.kind, keywords, createdAt: at, updatedAt: at });
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "tracker.created", { type: "tracker", id: ref.id }, { name: input.name, keywords });
  return { id: ref.id };
}

export async function deleteTracker(ctx: TenantContext, trackerId: string) {
  const tracker = await requireDoc<TrackerRecord>(ctx.tenantId, "trackers", trackerId, "Tracker");
  await col(ctx.tenantId, "trackers").doc(trackerId).delete();
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "tracker.deleted", { type: "tracker", id: trackerId }, { name: tracker.name });
}

export async function updateSettings(ctx: TenantContext, input: { staleAfterDays?: number; retentionDays?: number | null }) {
  const settings = await ensureSettings(ctx);
  const patch: Partial<SettingsRecord> = {};
  const changes: Record<string, unknown> = {};
  if (input.staleAfterDays !== undefined && input.staleAfterDays !== settings.staleAfterDays) {
    patch.staleAfterDays = input.staleAfterDays;
    changes.staleAfterDays = { from: settings.staleAfterDays, to: input.staleAfterDays };
  }
  if (input.retentionDays !== undefined && input.retentionDays !== (settings.retentionDays ?? null)) {
    patch.retentionDays = input.retentionDays;
    changes.retentionDays = { from: settings.retentionDays ?? null, to: input.retentionDays };
  }
  if (!Object.keys(changes).length) throw new FleetError("Nothing changed.", 400);
  await col(ctx.tenantId, "settings").doc("workspace").update(patch);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "settings.updated", { type: "settings", id: "workspace" }, changes);
}

async function deleteCallRecords(tenantId: string, callId: string) {
  const [comments, scorecards] = await Promise.all([
    col(tenantId, "callComments").where("callId", "==", callId).get(),
    col(tenantId, "scorecards").where("callId", "==", callId).get(),
  ]);
  const batch = col(tenantId, "calls").firestore.batch();
  batch.delete(col(tenantId, "calls").doc(callId));
  for (const doc of [...comments.docs, ...scorecards.docs]) batch.delete(doc.ref);
  await batch.commit();
  return { comments: comments.size, scorecards: scorecards.size };
}

/** Hard-deletes a call with its transcript, comments and scorecards. The audit keeps metadata only. */
export async function deleteCall(ctx: TenantContext, callId: string, reason: string) {
  const call = await requireDoc<CallRecord>(ctx.tenantId, "calls", callId, "Call");
  const removed = await deleteCallRecords(ctx.tenantId, callId);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "call.deleted", { type: "call", id: callId }, {
    dealId: call.dealId,
    occurredAt: call.occurredAt,
    reason,
    ...removed,
  });
}

export async function previewRetention(ctx: TenantContext) {
  const settings = await ensureSettings(ctx);
  const calls = await list<CallRecord>(ctx.tenantId, "calls");
  const retentionDays = settings.retentionDays ?? null;
  const due = callsPastRetention(calls, new Date(), retentionDays);
  return {
    retentionDays,
    calls: due.map((call) => ({ id: call.id, title: call.title, occurredAt: call.occurredAt, dealId: call.dealId })),
  };
}

export async function applyRetention(ctx: TenantContext) {
  const preview = await previewRetention(ctx);
  if (preview.retentionDays === null) throw new FleetError("Set a retention period first.", 409);
  for (const call of preview.calls) await deleteCallRecords(ctx.tenantId, call.id);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "retention.applied", { type: "settings", id: "workspace" }, {
    retentionDays: preview.retentionDays,
    deletedCalls: preview.calls.map((call) => call.id),
  });
  return { deleted: preview.calls.length };
}

export const EXPORT_SCHEMA_VERSION = "1.0.0";
const EXPORT_COLLECTIONS = ["accounts", "deals", "calls", "callComments", "scorecards", "trackers", "settings"] as const;

export async function exportWorkspace(ctx: TenantContext) {
  const tenant = await tenantRef(SLUG, ctx.tenantId).get();
  const collections = await Promise.all(
    EXPORT_COLLECTIONS.map(async (name) => [name, (await col(ctx.tenantId, name).get()).docs.map((doc) => ({ id: doc.id, ...(toPortable(doc.data()) as object) }))] as const),
  );
  const members = (await listTenantMembers(SLUG, ctx.tenantId)).map((member) => toPortable(member));
  const audit = await listAuditEvents(SLUG, ctx.tenantId, 1000);
  const data: Record<string, unknown[]> = Object.fromEntries(collections);
  data.members = members;
  data.auditEvents = audit;
  const manifest = buildExportManifest(
    SLUG,
    ctx.tenantId,
    Object.entries(data).map(([name, records]) => ({
      path: `${name}.json`,
      schema: `net.saasassin.revenue.${name}@${EXPORT_SCHEMA_VERSION}`,
      records: records.length,
    })),
  );
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "workspace.exported", { type: "tenant", id: ctx.tenantId }, {
    files: manifest.files.map((file) => `${file.path}:${file.records}`),
  });
  return { manifest, tenant: { id: ctx.tenantId, ...(toPortable(tenant.data() ?? {}) as object) }, data };
}
