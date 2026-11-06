import "server-only";

import type { z } from "zod";

import { FleetError } from "@/lib/fleet/platform/session";
import { appendAuditEvent, listTenantMembers } from "@/lib/fleet/platform/tenants";

import { applySpeakerLink, contactEngagement, type SpeakerLink, type SpeakerTarget } from "./contacts";
import {
  col,
  ensureSettings,
  list,
  nowIso,
  requireDoc,
  requireRole,
  type AccountRecord,
  type CallRecord,
  type CommentRecord,
  type ContactRecord,
  type DealRecord,
  type TenantContext,
} from "./data";
import { DEFAULT_STALLED_AFTER_DAYS } from "./deals";
import { checkForecastChange, effectiveCategory, FORECAST_CATEGORY_LABELS } from "./forecast";
import { canCoach, REVENUE_SLUG as SLUG, WRITE_ROLES } from "./schemas";
import type { contactDealRoleSchema, contactSchema, contactUpdateSchema, forecastChangeSchema, speakerLinkSchema } from "./schemas";
import { buildDealTimeline, dealStageStats } from "./timeline";

/* ------------------------------------------------------------------ contacts */

export async function createContact(ctx: TenantContext, input: z.infer<typeof contactSchema>) {
  requireRole(ctx, WRITE_ROLES);
  await requireDoc<AccountRecord>(ctx.tenantId, "accounts", input.accountId, "Account");
  const ref = col(ctx.tenantId, "contacts").doc();
  const at = nowIso();
  const record: ContactRecord = {
    id: ref.id,
    accountId: input.accountId,
    name: input.name,
    title: input.title,
    email: input.email.toLowerCase(),
    dealRoles: [],
    createdBy: ctx.user.email,
    createdAt: at,
    updatedAt: at,
  };
  await ref.set(record);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "contact.created", { type: "contact", id: ref.id }, { accountId: input.accountId });
  return record;
}

export async function updateContact(ctx: TenantContext, contactId: string, input: z.infer<typeof contactUpdateSchema>) {
  requireRole(ctx, WRITE_ROLES);
  const contact = await requireDoc<ContactRecord>(ctx.tenantId, "contacts", contactId, "Contact");
  const patch: Partial<ContactRecord> = {};
  if (input.name !== undefined && input.name !== contact.name) patch.name = input.name;
  if (input.title !== undefined && input.title !== contact.title) patch.title = input.title;
  if (input.email !== undefined && input.email.toLowerCase() !== contact.email) patch.email = input.email.toLowerCase();
  if (!Object.keys(patch).length) throw new FleetError("Nothing changed.", 400);
  await col(ctx.tenantId, "contacts").doc(contactId).update({ ...patch, updatedAt: nowIso() });
  // Field names only: contact details are personal data and stay out of the audit log.
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "contact.updated", { type: "contact", id: contactId }, { fields: Object.keys(patch) });
  return { ...contact, ...patch };
}

/** Sets (or clears) a contact's role on one deal. The deal must belong to the contact's account. */
export async function setContactDealRole(ctx: TenantContext, contactId: string, input: z.infer<typeof contactDealRoleSchema>) {
  requireRole(ctx, WRITE_ROLES);
  const deal = await requireDoc<DealRecord>(ctx.tenantId, "deals", input.dealId, "Deal");
  const ref = col(ctx.tenantId, "contacts").doc(contactId);
  const previous = await ref.firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new FleetError("Contact not found.", 404);
    const contact = snapshot.data() as ContactRecord;
    if (contact.accountId !== deal.accountId) throw new FleetError("That contact belongs to a different account than the deal.", 422);
    const before = (contact.dealRoles ?? []).find((entry) => entry.dealId === input.dealId)?.role ?? null;
    if (before === input.role) throw new FleetError("Nothing changed.", 400);
    const rest = (contact.dealRoles ?? []).filter((entry) => entry.dealId !== input.dealId);
    tx.update(ref, { dealRoles: input.role ? [...rest, { dealId: input.dealId, role: input.role }] : rest, updatedAt: nowIso() });
    return before;
  });
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "contact.deal_role_set", { type: "contact", id: contactId }, {
    dealId: input.dealId,
    from: previous,
    to: input.role,
  });
  return { contactId, dealId: input.dealId, role: input.role };
}

/** Deletes a contact and removes every transcript speaker link that pointed at it. */
export async function deleteContact(ctx: TenantContext, contactId: string) {
  requireRole(ctx, WRITE_ROLES);
  await requireDoc<ContactRecord>(ctx.tenantId, "contacts", contactId, "Contact");
  const linked = await col(ctx.tenantId, "calls").where("linkedContactIds", "array-contains", contactId).get();
  const batch = col(ctx.tenantId, "contacts").firestore.batch();
  batch.delete(col(ctx.tenantId, "contacts").doc(contactId));
  for (const doc of linked.docs) {
    const links = ((doc.get("speakerLinks") ?? []) as SpeakerLink[]).filter((link) => !(link.kind === "contact" && link.contactId === contactId));
    batch.update(doc.ref, { speakerLinks: links, linkedContactIds: linkedIds(links) });
  }
  await batch.commit();
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "contact.deleted", { type: "contact", id: contactId }, { unlinkedCalls: linked.size });
}

function linkedIds(links: SpeakerLink[]) {
  return [...new Set(links.flatMap((link) => (link.kind === "contact" ? [link.contactId] : [])))].sort();
}

/* ------------------------------------------------------------ speaker links */

/**
 * Links a transcript speaker to a contact on the deal's account, or to a workspace member (internal
 * speaker). `link: null` removes it. Server-checked: the speaker must be in the transcript.
 */
export async function linkSpeaker(ctx: TenantContext, callId: string, input: z.infer<typeof speakerLinkSchema>) {
  requireRole(ctx, WRITE_ROLES);
  const callRef = col(ctx.tenantId, "calls").doc(callId);
  const call = await requireDoc<CallRecord>(ctx.tenantId, "calls", callId, "Call");
  if (!call.speakers.includes(input.speaker)) throw new FleetError("That speaker is not in this transcript.", 422);
  let link: SpeakerTarget | null = null;
  if (input.link?.kind === "contact") {
    const [contact, deal] = await Promise.all([
      requireDoc<ContactRecord>(ctx.tenantId, "contacts", input.link.contactId, "Contact"),
      requireDoc<DealRecord>(ctx.tenantId, "deals", call.dealId, "Deal"),
    ]);
    if (contact.accountId !== deal.accountId) throw new FleetError("Link speakers to contacts on this deal's account.", 422);
    link = { kind: "contact", contactId: contact.id };
  } else if (input.link?.kind === "member") {
    const email = input.link.email.toLowerCase();
    const member = (await listTenantMembers(SLUG, ctx.tenantId)).find((entry) => entry.status === "active" && entry.email.toLowerCase() === email);
    if (!member) throw new FleetError("Internal speakers can only be linked to workspace members.", 422);
    link = { kind: "member", email: member.email };
  }
  const links = await callRef.firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(callRef);
    if (!snapshot.exists) throw new FleetError("Call not found.", 404);
    const next = applySpeakerLink((snapshot.get("speakerLinks") ?? []) as SpeakerLink[], input.speaker, link);
    tx.update(callRef, { speakerLinks: next, linkedContactIds: linkedIds(next) });
    return next;
  });
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, link ? "call.speaker_linked" : "call.speaker_unlinked", { type: "call", id: callId }, {
    speaker: input.speaker,
    ...(link?.kind === "contact" ? { contactId: link.contactId } : link?.kind === "member" ? { memberEmail: link.email } : {}),
  });
  return { speakerLinks: links };
}

/* ------------------------------------------------------------------ forecast */

/** Owner calls the category; coaches override with a reason, or clear the override. Audited. */
export async function setDealForecast(ctx: TenantContext, dealId: string, input: z.infer<typeof forecastChangeSchema>) {
  requireRole(ctx, WRITE_ROLES);
  const ref = col(ctx.tenantId, "deals").doc(dealId);
  const result = await ref.firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new FleetError("Deal not found.", 404);
    const deal = snapshot.data() as DealRecord;
    const check = checkForecastChange(deal, { kind: input.kind === "call" ? "call" : "override" }, { email: ctx.user.email, coach: canCoach(ctx.role) });
    if (!check.allowed) throw new FleetError(check.reason, check.status);
    const before = effectiveCategory(deal);
    const forecast = { call: deal.forecast?.call ?? null, override: deal.forecast?.override ?? null };
    const at = nowIso();
    if (input.kind === "call") {
      if (forecast.call?.category === input.category) throw new FleetError("Nothing changed.", 400);
      forecast.call = { category: input.category, by: ctx.user.email, at };
    } else if (input.kind === "override") {
      forecast.override = { category: input.category, reason: input.reason, by: ctx.user.email, at };
    } else {
      if (!forecast.override) throw new FleetError("There is no override to clear.", 409);
      forecast.override = null;
    }
    tx.update(ref, { forecast, updatedAt: at });
    return { before, after: effectiveCategory({ forecast }), forecast, ownerCall: forecast.call?.category ?? null };
  });
  const action = input.kind === "call" ? "deal.forecast_called" : input.kind === "override" ? "deal.forecast_overridden" : "deal.forecast_override_cleared";
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, action, { type: "deal", id: dealId }, {
    from: result.before,
    to: result.after,
    ownerCall: result.ownerCall,
    ...(input.kind === "override" ? { reason: input.reason } : {}),
  });
  return { forecast: result.forecast, effective: result.after, label: FORECAST_CATEGORY_LABELS[result.after] };
}

/* ------------------------------------------------------------------ timeline */

/** Stage history + calls + comments + next steps for one deal, with time-in-stage statistics. */
export async function getDealTimeline(ctx: TenantContext, dealId: string) {
  const deal = await requireDoc<DealRecord>(ctx.tenantId, "deals", dealId, "Deal");
  const settings = await ensureSettings(ctx);
  const [callsSnapshot, contacts] = await Promise.all([
    col(ctx.tenantId, "calls").where("dealId", "==", dealId).get(),
    list<ContactRecord>(ctx.tenantId, "contacts"),
  ]);
  const calls = callsSnapshot.docs.map((doc) => ({ ...(doc.data() as CallRecord), id: doc.id }));
  const comments: CommentRecord[] = [];
  // Single-field `in` queries (≤30 values each) — no composite index needed.
  for (let i = 0; i < calls.length; i += 30) {
    const ids = calls.slice(i, i + 30).map((call) => call.id);
    const snapshot = await col(ctx.tenantId, "callComments").where("callId", "in", ids).get();
    comments.push(...snapshot.docs.map((doc) => ({ ...(doc.data() as CommentRecord), id: doc.id })));
  }
  const now = new Date();
  const engagement = contactEngagement(calls.map((call) => ({ id: call.id, dealId: call.dealId, occurredAt: call.occurredAt, speakerLinks: call.speakerLinks ?? [], analysis: call.analysis })));
  const people = contacts
    .filter((contact) => contact.accountId === deal.accountId)
    .map((contact) => ({
      id: contact.id,
      name: contact.name,
      title: contact.title,
      role: contact.dealRoles.find((entry) => entry.dealId === dealId)?.role ?? null,
      engagement: engagement.get(contact.id) ?? null,
    }))
    .sort((a, b) => (b.engagement?.talkSeconds ?? 0) - (a.engagement?.talkSeconds ?? 0) || a.name.localeCompare(b.name));
  return {
    deal: { id: deal.id, name: deal.name, stage: deal.stage, accountId: deal.accountId },
    stats: dealStageStats(deal, now, settings.stalledAfterDays ?? DEFAULT_STALLED_AFTER_DAYS),
    entries: buildDealTimeline(
      deal.stageHistory ?? [],
      calls.map((call) => ({
        id: call.id,
        title: call.title,
        occurredAt: call.occurredAt,
        repEmail: call.repEmail,
        durationSeconds: call.analysis.durationSeconds,
        nextSteps: call.analysis.nextSteps.map((step) => ({ text: step.text, start: step.start, segmentIndex: step.segmentIndex })),
      })),
      comments,
    ),
    people,
  };
}
