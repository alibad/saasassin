import "server-only";

import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import { loadProfiles } from "@/lib/fleet/platform/profiles";
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
import { checkAcknowledge, computeScorecard, DEFAULT_RUBRIC, normalizeRubric, redactSegments, aggregateRepStats, resolveSnippetRange, segmentFingerprint, type RubricCriterion } from "./coaching";
import { contactEngagement, engagedContactsForDeal, type DealRole, type SpeakerLink } from "./contacts";
import {
  checkStageTransition,
  computeRiskSignals,
  currentStageSince,
  DEFAULT_RISK_CONFIG,
  DEFAULT_STALLED_AFTER_DAYS,
  type DealStage,
  type RiskConfig,
  type StageChange,
} from "./deals";
import { dispatchWebhooks, type DeliveryOptions } from "./delivery";
import {
  buildForecast,
  DEFAULT_STAGE_PROBABILITIES,
  effectiveCategory,
  normalizeStageProbabilities,
  type DealForecastCall,
  type DealForecastOverride,
  type StageProbabilities,
} from "./forecast";
import { callsPastRetention, retentionQueue } from "./retention";
import { searchTranscripts } from "./search";
import { ADMIN_ROLES, COACH_ROLES, isAdmin, REVENUE_SLUG as SLUG, WRITE_ROLES } from "./schemas";
import { parseTranscript, TranscriptParseError, type TranscriptFormat, type TranscriptSegment } from "./transcript";
import type { z } from "zod";
import type {
  accountSchema,
  assignmentSchema,
  callSchema,
  commentSchema,
  consentSchema,
  dealSchema,
  dealUpdateSchema,
  redactionSchema,
  scorecardSchema,
  snippetSchema,
  trackerSchema,
} from "./schemas";

export type TenantContext = {
  user: FleetUser;
  tenantId: string;
  role: string;
  tenantName: string;
  /** Test seam for outbound webhook delivery (fetch + DNS); production leaves it unset. */
  delivery?: DeliveryOptions;
};

/** requireTenantMember for an already-authenticated user. Never trusts browser-sent roles. */
export async function revenueContext(user: FleetUser, tenantId: string, allowedRoles?: string[]): Promise<TenantContext> {
  const { tenant, role } = await requireTenantMember(SLUG, tenantId, user, allowedRoles);
  return { user, tenantId, role, tenantName: tenant.name };
}

/** requireFleetUser → requireTenantMember (with optional role gate). */
export async function requireRevenueTenant(tenantId: string, allowedRoles?: string[]): Promise<TenantContext> {
  const user = await requireFleetUser(SLUG);
  return revenueContext(user, tenantId, allowedRoles);
}

/**
 * Role gate inside the data layer, so every mutation is authorized by the same code whether it is
 * reached from a route handler or a test. Routes also pass the roles to requireRevenueTenant.
 */
export function requireRole(ctx: TenantContext, roles: readonly string[]) {
  if (!roles.includes(ctx.role)) throw new FleetError("Your role does not allow this action.", 403);
}

export const col = (tenantId: string, name: string) => tenantCollection(SLUG, tenantId, name);
export const nowIso = () => new Date().toISOString();

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
  /** Owner's forecast call and an optional manager override; see forecast.ts. */
  forecast?: { call?: DealForecastCall | null; override?: DealForecastOverride | null } | null;
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
  /** Transcript speaker → contact or workspace member, set by a person (never guessed). */
  speakerLinks?: SpeakerLink[];
  /** Denormalized contact ids from speakerLinks, for single-field array-contains queries. */
  linkedContactIds?: string[];
  createdBy: string;
  createdAt: string;
  analyzedAt: string;
};
export type ContactRecord = {
  id: string;
  accountId: string;
  name: string;
  title: string;
  email: string;
  dealRoles: Array<{ dealId: string; role: DealRole }>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
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
export type SnippetRecord = {
  id: string;
  callId: string;
  dealId: string;
  title: string;
  playlist: string;
  note: string;
  startSegment: number;
  endSegment: number;
  start: number;
  end: number;
  createdBy: string;
  createdAt: string;
};
export type AssignmentRecord = {
  id: string;
  callId: string;
  dealId: string;
  assigneeEmail: string;
  note: string;
  at: number | null;
  status: "assigned" | "acknowledged";
  createdBy: string;
  createdAt: string;
  acknowledgedAt: string | null;
};
export type TrackerRecord = Tracker & { createdAt: string; updatedAt: string };
export type SettingsRecord = RiskConfig & {
  rubric: RubricCriterion[];
  seededAt: string;
  retentionDays?: number | null;
  stageProbabilities?: StageProbabilities;
};

export function stageProbabilitiesOf(settings: SettingsRecord): StageProbabilities {
  return { ...DEFAULT_STAGE_PROBABILITIES, ...(settings.stageProbabilities ?? {}) };
}

export async function list<T>(tenantId: string, name: string): Promise<T[]> {
  const snapshot = await col(tenantId, name).get();
  return snapshot.docs.map((doc) => ({ ...(doc.data() as object), id: doc.id }) as T);
}

/** First load of a workspace seeds default trackers + settings once (audited). */
export async function ensureSettings(ctx: TenantContext): Promise<SettingsRecord> {
  const ref = col(ctx.tenantId, "settings").doc("workspace");
  const snapshot = await ref.get();
  if (snapshot.exists) return snapshot.data() as SettingsRecord;
  // Transaction: concurrent first loads (board + call page) must seed trackers exactly once.
  const seeded = await ref.firestore.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (current.exists) return { settings: current.data() as SettingsRecord, created: false };
    const settings: SettingsRecord = { ...DEFAULT_RISK_CONFIG, rubric: DEFAULT_RUBRIC, seededAt: nowIso() };
    tx.set(ref, settings);
    for (const tracker of DEFAULT_TRACKERS) {
      const trackerRef = col(ctx.tenantId, "trackers").doc();
      tx.set(trackerRef, { ...tracker, id: trackerRef.id, createdAt: nowIso(), updatedAt: nowIso() });
    }
    return { settings, created: true };
  });
  if (seeded.created) {
    await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "workspace.seeded", { type: "settings", id: "workspace" }, {
      trackers: DEFAULT_TRACKERS.map((tracker) => tracker.name),
    });
  }
  return seeded.settings;
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
      competitorHits: analysis.trackerHits
        .filter((hit) => hit.kind === "competitor")
        .map((hit) => ({ keyword: hit.keyword, start: hit.start, segmentIndex: hit.segmentIndex })),
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
  const [accounts, deals, calls, trackers, members, scorecards, snippets, assignments, contacts] = await Promise.all([
    list<AccountRecord>(ctx.tenantId, "accounts"),
    list<DealRecord>(ctx.tenantId, "deals"),
    list<CallRecord>(ctx.tenantId, "calls"),
    list<TrackerRecord>(ctx.tenantId, "trackers"),
    listTenantMembers(SLUG, ctx.tenantId),
    list<ScorecardRecord>(ctx.tenantId, "scorecards"),
    list<SnippetRecord>(ctx.tenantId, "snippets"),
    list<AssignmentRecord>(ctx.tenantId, "assignments"),
    list<ContactRecord>(ctx.tenantId, "contacts"),
  ]);
  const activeMembers = members.filter((member) => member.status === "active");
  // Teammates' display names and photos: the same profile data the team page shows every member.
  const profiles = await loadProfiles(SLUG, activeMembers.map((member) => member.uid));
  const contactName = new Map(contacts.map((contact) => [contact.id, contact.name]));
  const engagementCalls = calls.map((call) => ({ id: call.id, dealId: call.dealId, occurredAt: call.occurredAt, speakerLinks: call.speakerLinks ?? [], analysis: call.analysis }));
  const engagement = contactEngagement(engagementCalls);
  const stalledAfterDays = settings.stalledAfterDays ?? DEFAULT_STALLED_AFTER_DAYS;
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
        { staleAfterDays: settings.staleAfterDays, stalledAfterDays },
        {
          engagedContacts: engagedContactsForDeal(deal.id, engagementCalls).map((entry) => ({ ...entry, name: contactName.get(entry.contactId) ?? "One contact" })),
          stageEnteredAt: currentStageSince(deal),
        },
      );
      const stageSince = currentStageSince(deal);
      return {
        ...deal,
        forecastCategory: effectiveCategory(deal),
        daysInStage: stageSince ? Math.max(0, Math.floor((now.getTime() - new Date(stageSince).getTime()) / 86_400_000)) : 0,
        callCount: dealCalls.length,
        lastCall: dealCalls[0] ? { id: dealCalls[0].id, title: dealCalls[0].title, occurredAt: dealCalls[0].occurredAt } : null,
        contacts: contacts
          .flatMap((contact) => contact.dealRoles.filter((entry) => entry.dealId === deal.id).map((entry) => ({ contactId: contact.id, role: entry.role })))
          .sort((a, b) => (contactName.get(a.contactId) ?? "").localeCompare(contactName.get(b.contactId) ?? "")),
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
    members: activeMembers.map(({ uid, email, name, role }) => {
      const profile = profiles.get(uid);
      return { uid, email, name: profile?.name || name, role, title: profile?.title ?? "", photoURL: profile?.photoURL ?? null };
    }),
    repStats,
    contacts: contacts
      .map((contact) => ({ ...contact, engagement: engagement.get(contact.id) ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    forecast: buildForecast(deals, stageProbabilitiesOf(settings)),
    retentionDueCount: isAdmin(ctx.role) ? callsPastRetention(calls, now, settings.retentionDays ?? null).length : null,
    assignments: assignments.sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === "assigned" ? -1 : 1)),
    snippets: snippets.sort((a, b) => a.playlist.localeCompare(b.playlist) || b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function createAccount(ctx: TenantContext, input: z.infer<typeof accountSchema>) {
  requireRole(ctx, WRITE_ROLES);
  const ref = col(ctx.tenantId, "accounts").doc();
  const record: AccountRecord = { id: ref.id, name: input.name, domain: input.domain, createdAt: nowIso(), createdBy: ctx.user.email };
  await ref.set(record);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "account.created", { type: "account", id: ref.id }, { name: input.name });
  return record;
}

export async function requireDoc<T>(tenantId: string, collection: string, id: string, label: string) {
  const snapshot = await col(tenantId, collection).doc(id).get();
  if (!snapshot.exists) throw new FleetError(`${label} not found.`, 404);
  return { ...(snapshot.data() as object), id: snapshot.id } as T;
}

export async function createDeal(ctx: TenantContext, input: z.infer<typeof dealSchema>) {
  requireRole(ctx, WRITE_ROLES);
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
  requireRole(ctx, WRITE_ROLES);
  const ref = col(ctx.tenantId, "deals").doc(dealId);
  // Transaction: two concurrent stage moves must both be checked against the stage they actually
  // move from, and both land in the history — never one silently overwriting the other.
  const result = await ref.firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new FleetError("Deal not found.", 404);
    const deal = { ...(snapshot.data() as DealRecord), id: snapshot.id };
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
    tx.update(ref, patch);
    return { deal: { ...deal, ...patch }, changes };
  });
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, result.changes.stage ? "deal.stage_changed" : "deal.updated", { type: "deal", id: dealId }, result.changes);
  if (result.changes.stage) {
    const last = result.deal.stageHistory.at(-1)!;
    await dispatchWebhooks(ctx.tenantId, "deal.stage_changed", {
      deal: { id: dealId, name: result.deal.name, accountId: result.deal.accountId, amount: result.deal.amount, currency: result.deal.currency, closeDate: result.deal.closeDate, ownerEmail: result.deal.ownerEmail },
      from: last.from,
      to: last.to,
      by: last.by,
      at: last.at,
    }, ctx.delivery);
  }
  return result.deal;
}

async function currentTrackers(tenantId: string) {
  const trackers = await list<TrackerRecord>(tenantId, "trackers");
  return trackers.map(({ id, name, kind, keywords }) => ({ id, name, kind, keywords }));
}

export async function createCall(ctx: TenantContext, input: z.infer<typeof callSchema>) {
  requireRole(ctx, WRITE_ROLES);
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
    speakerLinks: [],
    linkedContactIds: [],
  };
  await ref.set(record);
  // Transcript text never goes into the audit log — only counts and consent metadata.
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "call.logged", { type: "call", id: ref.id }, {
    dealId: input.dealId,
    format: parsed.format,
    segments: parsed.segments.length,
    consent: { jurisdiction: input.consent.jurisdiction, basis: input.consent.basis, allPartyConfirmed: true },
  });
  await dispatchWebhooks(ctx.tenantId, "call.analyzed", callAnalyzedPayload(record, "logged"), ctx.delivery);
  return { id: ref.id };
}

/** Webhook payload: analysis numbers only — never transcript text or next-step quotes. */
export function callAnalyzedPayload(call: Pick<CallRecord, "id" | "dealId" | "title" | "occurredAt" | "repEmail" | "analysis">, reason: "logged" | "reanalyzed" | "redacted") {
  return {
    reason,
    call: { id: call.id, dealId: call.dealId, title: call.title, occurredAt: call.occurredAt, repEmail: call.repEmail },
    analysis: {
      version: call.analysis.version,
      durationSeconds: call.analysis.durationSeconds,
      questionCount: call.analysis.questionCount,
      interactivity: call.analysis.interactivity.score,
      speakers: call.analysis.speakers.map((speaker) => ({ speaker: speaker.speaker, talkRatio: speaker.talkRatio, talkSeconds: speaker.talkSeconds })),
      nextStepCount: call.analysis.nextSteps.length,
      competitorMentioned: call.analysis.competitorMentioned,
      trackers: call.analysis.trackerSummary.map((entry) => ({ name: entry.trackerName, kind: entry.kind, count: entry.count })),
    },
  };
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
    deal: deal.exists ? { id: deal.id, name: String(deal.get("name")), stage: deal.get("stage") as DealStage, accountId: String(deal.get("accountId")) } : null,
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
  requireRole(ctx, WRITE_ROLES);
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
  requireRole(ctx, COACH_ROLES);
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
  requireRole(ctx, COACH_ROLES);
  const trackers = await currentTrackers(ctx.tenantId);
  const ref = col(ctx.tenantId, "calls").doc(callId);
  // Transaction + fingerprint: two coaches redacting at once must never undo each other's redaction
  // (which would restore the removed text), and offsets taken from a stale view are refused.
  const redaction = await ref.firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new FleetError("Call not found.", 404);
    const call = snapshot.data() as CallRecord;
    const segment = call.segments.find((entry) => entry.index === input.segmentIndex);
    if (!segment) throw new FleetError("That transcript segment does not exist.", 422);
    if (segmentFingerprint(segment.text) !== input.fingerprint) {
      throw new FleetError("This part of the transcript changed since you loaded it. Reload the call and select the text again.", 409);
    }
    let redacted;
    try {
      redacted = redactSegments(call.segments, input);
    } catch (error) {
      throw new FleetError(error instanceof Error ? error.message : "Select a span to redact.", 422);
    }
    const at = nowIso();
    const record: RedactionRecord = {
      segmentIndex: input.segmentIndex,
      charStart: input.charStart,
      charEnd: input.charEnd,
      length: redacted.redactedLength,
      reason: input.reason,
      by: ctx.user.email,
      at,
    };
    const analysis = analyzeCall(redacted.segments, trackers);
    tx.update(ref, { segments: redacted.segments, analysis, analyzedAt: at, redactions: [...(call.redactions ?? []), record] });
    return { record, call: { ...call, id: callId, analysis } };
  });
  // The removed text is not stored anywhere — the audit records position, length, and reason only.
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "call.redacted", { type: "call", id: callId }, {
    segmentIndex: input.segmentIndex,
    length: redaction.record.length,
    reason: input.reason,
  });
  await dispatchWebhooks(ctx.tenantId, "call.analyzed", callAnalyzedPayload(redaction.call, "redacted"), ctx.delivery);
  return redaction.record;
}

export async function reanalyzeCall(ctx: TenantContext, callId: string) {
  requireRole(ctx, WRITE_ROLES);
  const call = await requireDoc<CallRecord>(ctx.tenantId, "calls", callId, "Call");
  const trackers = await currentTrackers(ctx.tenantId);
  const analysis = analyzeCall(call.segments, trackers);
  await col(ctx.tenantId, "calls").doc(callId).update({ analysis, analyzedAt: nowIso() });
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "call.reanalyzed", { type: "call", id: callId }, { trackers: trackers.length });
  await dispatchWebhooks(ctx.tenantId, "call.analyzed", callAnalyzedPayload({ ...call, analysis }, "reanalyzed"), ctx.delivery);
  return analysis;
}

export async function saveTracker(ctx: TenantContext, trackerId: string | null, input: z.infer<typeof trackerSchema>) {
  requireRole(ctx, ADMIN_ROLES);
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
  requireRole(ctx, ADMIN_ROLES);
  const tracker = await requireDoc<TrackerRecord>(ctx.tenantId, "trackers", trackerId, "Tracker");
  await col(ctx.tenantId, "trackers").doc(trackerId).delete();
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "tracker.deleted", { type: "tracker", id: trackerId }, { name: tracker.name });
}

export async function updateSettings(
  ctx: TenantContext,
  input: {
    staleAfterDays?: number;
    stalledAfterDays?: number;
    retentionDays?: number | null;
    rubric?: Array<{ label: string; weight: number }>;
    stageProbabilities?: Partial<Record<string, number>>;
  },
) {
  requireRole(ctx, ADMIN_ROLES);
  const settings = await ensureSettings(ctx);
  const patch: Partial<SettingsRecord> = {};
  const changes: Record<string, unknown> = {};
  if (input.staleAfterDays !== undefined && input.staleAfterDays !== settings.staleAfterDays) {
    patch.staleAfterDays = input.staleAfterDays;
    changes.staleAfterDays = { from: settings.staleAfterDays, to: input.staleAfterDays };
  }
  const stalledNow = settings.stalledAfterDays ?? DEFAULT_STALLED_AFTER_DAYS;
  if (input.stalledAfterDays !== undefined && input.stalledAfterDays !== stalledNow) {
    patch.stalledAfterDays = input.stalledAfterDays;
    changes.stalledAfterDays = { from: stalledNow, to: input.stalledAfterDays };
  }
  if (input.stageProbabilities) {
    const before = stageProbabilitiesOf(settings);
    let next: StageProbabilities;
    try {
      next = normalizeStageProbabilities({ ...before, ...input.stageProbabilities });
    } catch (error) {
      throw new FleetError(error instanceof Error ? error.message : "Check the stage probabilities.", 422);
    }
    const changed = Object.fromEntries(
      (Object.keys(next) as DealStage[]).filter((stage) => next[stage] !== before[stage]).map((stage) => [stage, { from: before[stage], to: next[stage] }]),
    );
    if (Object.keys(changed).length) {
      patch.stageProbabilities = next;
      changes.stageProbabilities = changed;
    }
  }
  if (input.retentionDays !== undefined && input.retentionDays !== (settings.retentionDays ?? null)) {
    patch.retentionDays = input.retentionDays;
    changes.retentionDays = { from: settings.retentionDays ?? null, to: input.retentionDays };
  }
  if (input.rubric) {
    let rubric: RubricCriterion[];
    try {
      rubric = normalizeRubric(input.rubric);
    } catch (error) {
      throw new FleetError(error instanceof Error ? error.message : "Check the rubric.", 422);
    }
    patch.rubric = rubric;
    changes.rubric = { criteria: rubric.map((criterion) => `${criterion.label} (x${criterion.weight})`) };
  }
  if (!Object.keys(changes).length) throw new FleetError("Nothing changed.", 400);
  await col(ctx.tenantId, "settings").doc("workspace").update(patch);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "settings.updated", { type: "settings", id: "workspace" }, changes);
}

async function deleteCallRecords(tenantId: string, callId: string) {
  const [comments, scorecards, snippets, assignments] = await Promise.all([
    col(tenantId, "callComments").where("callId", "==", callId).get(),
    col(tenantId, "scorecards").where("callId", "==", callId).get(),
    col(tenantId, "snippets").where("callId", "==", callId).get(),
    col(tenantId, "assignments").where("callId", "==", callId).get(),
  ]);
  const batch = col(tenantId, "calls").firestore.batch();
  batch.delete(col(tenantId, "calls").doc(callId));
  for (const doc of [...comments.docs, ...scorecards.docs, ...snippets.docs, ...assignments.docs]) batch.delete(doc.ref);
  await batch.commit();
  return { comments: comments.size, scorecards: scorecards.size, snippets: snippets.size, assignments: assignments.size };
}

export async function createSnippet(ctx: TenantContext, callId: string, input: z.infer<typeof snippetSchema>) {
  requireRole(ctx, WRITE_ROLES);
  const call = await requireDoc<CallRecord>(ctx.tenantId, "calls", callId, "Call");
  let range;
  try {
    range = resolveSnippetRange(call.segments, input.startSegment, input.endSegment);
  } catch (error) {
    throw new FleetError(error instanceof Error ? error.message : "Choose a valid range.", 422);
  }
  const ref = col(ctx.tenantId, "snippets").doc();
  const record: SnippetRecord = {
    id: ref.id,
    callId,
    dealId: call.dealId,
    title: input.title,
    playlist: input.playlist,
    note: input.note,
    startSegment: input.startSegment,
    endSegment: input.endSegment,
    ...range,
    createdBy: ctx.user.email,
    createdAt: nowIso(),
  };
  await ref.set(record);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "snippet.created", { type: "snippet", id: ref.id }, { callId, playlist: input.playlist });
  return record;
}

export async function createAssignment(ctx: TenantContext, callId: string, input: z.infer<typeof assignmentSchema>) {
  requireRole(ctx, COACH_ROLES);
  const call = await requireDoc<CallRecord>(ctx.tenantId, "calls", callId, "Call");
  const members = await listTenantMembers(SLUG, ctx.tenantId);
  const assignee = members.find((member) => member.status === "active" && member.email.toLowerCase() === input.assigneeEmail.toLowerCase());
  if (!assignee) throw new FleetError("Coaching can only be assigned to a workspace member.", 422);
  const ref = col(ctx.tenantId, "assignments").doc();
  const record: AssignmentRecord = {
    id: ref.id,
    callId,
    dealId: call.dealId,
    assigneeEmail: assignee.email,
    note: input.note,
    at: input.at,
    status: "assigned",
    createdBy: ctx.user.email,
    createdAt: nowIso(),
    acknowledgedAt: null,
  };
  await ref.set(record);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "coaching.assigned", { type: "assignment", id: ref.id }, { callId, assignee: assignee.email });
  return record;
}

export async function acknowledgeAssignment(ctx: TenantContext, assignmentId: string) {
  const ref = col(ctx.tenantId, "assignments").doc(assignmentId);
  const result = await ref.firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new FleetError("Assignment not found.", 404);
    const assignment = { ...(snapshot.data() as AssignmentRecord), id: snapshot.id };
    const check = checkAcknowledge(assignment, ctx.user.email);
    if (!check.allowed) throw new FleetError(check.reason, assignment.status === "acknowledged" ? 409 : 403);
    const at = nowIso();
    tx.update(ref, { status: "acknowledged", acknowledgedAt: at });
    return { ...assignment, status: "acknowledged" as const, acknowledgedAt: at };
  });
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "coaching.acknowledged", { type: "assignment", id: assignmentId }, { callId: result.callId });
  return result;
}

export async function deleteSnippet(ctx: TenantContext, snippetId: string) {
  requireRole(ctx, WRITE_ROLES);
  const snippet = await requireDoc<SnippetRecord>(ctx.tenantId, "snippets", snippetId, "Clip");
  if (snippet.createdBy !== ctx.user.email && !isAdmin(ctx.role)) {
    throw new FleetError("Only the clip's creator or an admin can remove it.", 403);
  }
  await col(ctx.tenantId, "snippets").doc(snippetId).delete();
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "snippet.deleted", { type: "snippet", id: snippetId }, { callId: snippet.callId });
}

/** Hard-deletes a call with its transcript, comments and scorecards. The audit keeps metadata only. */
export async function deleteCall(ctx: TenantContext, callId: string, reason: string) {
  requireRole(ctx, ADMIN_ROLES);
  const call = await requireDoc<CallRecord>(ctx.tenantId, "calls", callId, "Call");
  const removed = await deleteCallRecords(ctx.tenantId, callId);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "call.deleted", { type: "call", id: callId }, {
    dealId: call.dealId,
    occurredAt: call.occurredAt,
    reason,
    ...removed,
  });
}

export async function listAudit(ctx: TenantContext, limit = 200) {
  requireRole(ctx, COACH_ROLES);
  return listAuditEvents(SLUG, ctx.tenantId, limit);
}

export async function searchCalls(ctx: TenantContext, query: string) {
  const calls = await list<CallRecord>(ctx.tenantId, "calls");
  return searchTranscripts(calls, query);
}

export async function previewRetention(ctx: TenantContext) {
  requireRole(ctx, ADMIN_ROLES);
  const settings = await ensureSettings(ctx);
  const calls = await list<CallRecord>(ctx.tenantId, "calls");
  const retentionDays = settings.retentionDays ?? null;
  const due = callsPastRetention(calls, new Date(), retentionDays);
  return {
    retentionDays,
    calls: due.map((call) => ({ id: call.id, title: call.title, occurredAt: call.occurredAt, dealId: call.dealId })),
  };
}

/** The retention queue: calls past their retention date and calls due within two weeks. */
export async function getRetentionQueue(ctx: TenantContext) {
  requireRole(ctx, ADMIN_ROLES);
  const settings = await ensureSettings(ctx);
  const [calls, deals] = await Promise.all([list<CallRecord>(ctx.tenantId, "calls"), list<DealRecord>(ctx.tenantId, "deals")]);
  const dealName = new Map(deals.map((deal) => [deal.id, deal.name]));
  const rows = calls.map((call) => ({ id: call.id, title: call.title, occurredAt: call.occurredAt, dealId: call.dealId, dealName: dealName.get(call.dealId) ?? null, repEmail: call.repEmail }));
  return retentionQueue(rows, new Date(), settings.retentionDays ?? null);
}

/**
 * Admin-triggered retention. With no ids it deletes every call in the due queue; with ids it deletes
 * only those, and refuses (409) any id that is not past its retention date.
 */
export async function applyRetention(ctx: TenantContext, callIds?: string[]) {
  const preview = await previewRetention(ctx);
  if (preview.retentionDays === null) throw new FleetError("Set a retention period first.", 409);
  const due = new Set(preview.calls.map((call) => call.id));
  const selected = callIds ? [...new Set(callIds)] : [...due];
  const notDue = selected.filter((id) => !due.has(id));
  if (notDue.length) throw new FleetError(`${notDue.length} selected call${notDue.length === 1 ? " is" : "s are"} not past retention.`, 409);
  for (const id of selected) await deleteCallRecords(ctx.tenantId, id);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "retention.applied", { type: "settings", id: "workspace" }, {
    retentionDays: preview.retentionDays,
    scope: callIds ? "selected" : "all-due",
    deletedCalls: selected,
  });
  return { deleted: selected.length };
}

export const EXPORT_SCHEMA_VERSION = "1.0.0";
export const EXPORT_COLLECTIONS = [
  "accounts",
  "contacts",
  "deals",
  "calls",
  "callComments",
  "scorecards",
  "snippets",
  "assignments",
  "trackers",
  "settings",
  "webhooks",
  "webhookDeliveries",
] as const;

export async function exportWorkspace(ctx: TenantContext) {
  requireRole(ctx, ADMIN_ROLES);
  const tenant = await tenantRef(SLUG, ctx.tenantId).get();
  const collections = await Promise.all(
    EXPORT_COLLECTIONS.map(
      async (name) =>
        [
          name,
          (await col(ctx.tenantId, name).get()).docs.map((doc) => {
            const record: Record<string, unknown> = { id: doc.id, ...(toPortable(doc.data()) as object) };
            // Signing secrets never leave the server after creation.
            if (name === "webhooks") record.secret = "[redacted]";
            return record;
          }),
        ] as const,
    ),
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
