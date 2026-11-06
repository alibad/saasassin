import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { z } from "zod";

import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import { FleetError } from "@/lib/fleet/platform/session";
import { db, listAuditEvents, listTenantMembers } from "@/lib/fleet/platform/tenants";

import { contactId, deriveContacts, frequentCorrespondents, type Contact, type ContactSource } from "./contacts";
import { filterOutcome, matchesFilter, retroPatch, type FilterableMessage } from "./filters";
import type { MailAddress } from "./mime";
import { MAIL_PROVIDERS, providerStatuses, SEND_NOT_CONFIGURED } from "./provider";
import { SCHEDULE_NOT_CONFIGURED, scheduleAfterEdit, validateScheduleTime } from "./schedule";
import { bodiesNeeded, buildSearchIndex, finishHits, rankIndexed, SEARCH_INDEX_VERSION, type IndexedMessage } from "./search-index";
import {
  MAIL_EXPORT_SCHEMA,
  MAIL_EXPORT_VERSION,
  MAIL_PRODUCT,
  type BulkActionInput,
  type DraftInput,
  type FilterDraftInput,
  type FilterInput,
  type splitSchema,
  type templateSchema,
} from "./schema";
import {
  assertWriter,
  audit,
  listAllMessages,
  listDrafts,
  listFilters,
  listImportRuns,
  listSplits,
  listTemplates,
  listThreadMessages,
  listThreads,
  mailCollection,
  toFilter,
  toThread,
  type MailContext,
} from "./store";
import { applyThreadAction, searchMessages, sortThreads, ThreadActionError, type ThreadAction, type ThreadRecord } from "./workflow";

/**
 * Route-level mail operations. Route handlers only resolve the session and parse input; every
 * read and write (and its role check and audit event) lives here, so the emulator spec drives the
 * exact code production runs.
 */

const THREAD_ID = /^t_[0-9a-f]{16}$/;

export async function loadMailbox(context: MailContext) {
  const [threads, splits, drafts, templates, imports, filters] = await Promise.all([
    listThreads(context.tenantId),
    listSplits(context),
    listDrafts(context.tenantId),
    listTemplates(context.tenantId),
    listImportRuns(context.tenantId),
    listFilters(context.tenantId),
  ]);
  return { role: context.role, threads, splits, drafts, templates, imports, filters, providers: providerStatuses() };
}

export async function loadThread(tenantId: string, threadId: string) {
  if (!THREAD_ID.test(threadId)) throw new FleetError("Thread not found.", 404);
  const snapshot = await mailCollection(tenantId, "threads").doc(threadId).get();
  if (!snapshot.exists) throw new FleetError("Thread not found.", 404);
  return toThread(snapshot.id, snapshot.data()!);
}

export async function getThread(context: MailContext, threadId: string) {
  const thread = await loadThread(context.tenantId, threadId);
  return { thread, messages: await listThreadMessages(context.tenantId, threadId) };
}

/** Applies one triage action (archive, trash, star, read, snooze, label, follow-up reminder). */
export async function actOnThread(context: MailContext, threadId: string, action: ThreadAction, now = new Date()) {
  assertWriter(context);
  const thread = await loadThread(context.tenantId, threadId);
  let patch: Partial<ThreadRecord>;
  try {
    patch = applyThreadAction(thread, action, now);
  } catch (error) {
    if (error instanceof ThreadActionError) throw new FleetError(error.message, 400);
    throw error;
  }
  await mailCollection(context.tenantId, "threads").doc(threadId).set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(context, `thread.${action.type}`, { type: "thread", id: threadId }, { action });
  return { ...thread, ...patch };
}

/* ---------- bulk triage ---------- */

const UNDO_FIELDS = ["state", "snoozedUntil", "unread", "starred", "labels", "reminder"] as const;

/** One action over many threads, recorded as an undoable operation (z restores the prior fields). */
export async function bulkAct(context: MailContext, input: BulkActionInput, now = new Date()) {
  assertWriter(context);
  const threadsRef = mailCollection(context.tenantId, "threads");
  const docs = await db().getAll(...input.threadIds.map((id) => threadsRef.doc(id)));
  if (docs.some((doc) => !doc.exists)) throw new FleetError("One of the selected threads no longer exists.", 404);
  const updated: ThreadRecord[] = [];
  const before: Record<string, Partial<ThreadRecord>> = {};
  const patches: Array<[string, Partial<ThreadRecord>]> = [];
  for (const doc of docs) {
    const thread = toThread(doc.id, doc.data()!);
    let patch: Partial<ThreadRecord>;
    try {
      patch = applyThreadAction(thread, input.action, now);
    } catch (error) {
      if (error instanceof ThreadActionError) throw new FleetError(error.message, 400);
      throw error;
    }
    const touched = UNDO_FIELDS.filter((field) => field in patch);
    before[doc.id] = Object.fromEntries(touched.map((field) => [field, thread[field] ?? null]));
    patches.push([doc.id, patch]);
    updated.push({ ...thread, ...patch });
  }
  const opRef = mailCollection(context.tenantId, "bulkOps").doc();
  const batch = db().batch();
  for (const [id, patch] of patches) batch.set(threadsRef.doc(id), { ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(opRef, { action: input.action, threadIds: input.threadIds, before, undoneAt: null, createdBy: context.user.uid, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  await audit(context, `thread.bulk_${input.action.type}`, { type: "bulkOp", id: opRef.id }, { action: input.action, count: input.threadIds.length, threadIds: input.threadIds });
  return { opId: opRef.id, threads: updated };
}

export async function undoBulk(context: MailContext, opId: string) {
  assertWriter(context);
  if (!/^[A-Za-z0-9]{1,40}$/.test(opId)) throw new FleetError("Nothing to undo.", 404);
  const opRef = mailCollection(context.tenantId, "bulkOps").doc(opId);
  const op = await opRef.get();
  if (!op.exists) throw new FleetError("Nothing to undo.", 404);
  if (op.get("undoneAt")) throw new FleetError("That change was already undone.", 409);
  const before = (op.get("before") ?? {}) as Record<string, Partial<ThreadRecord>>;
  const threadsRef = mailCollection(context.tenantId, "threads");
  const ids = Object.keys(before);
  const docs = ids.length ? await db().getAll(...ids.map((id) => threadsRef.doc(id))) : [];
  const batch = db().batch();
  const restored: ThreadRecord[] = [];
  for (const doc of docs) {
    if (!doc.exists) continue;
    batch.set(doc.ref, { ...before[doc.id], updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    restored.push({ ...toThread(doc.id, doc.data()!), ...before[doc.id] });
  }
  batch.set(opRef, { undoneAt: FieldValue.serverTimestamp(), undoneBy: context.user.uid }, { merge: true });
  await batch.commit();
  await audit(context, "thread.bulk_undone", { type: "bulkOp", id: opId }, { action: op.get("action"), count: restored.length });
  return { threads: restored };
}

/* ---------- drafts ---------- */

export async function saveDraft(context: MailContext, input: DraftInput) {
  assertWriter(context);
  const drafts = mailCollection(context.tenantId, "drafts");
  const ref = input.id ? drafts.doc(input.id) : drafts.doc();
  const existing = input.id ? await ref.get() : null;
  if (input.id && !existing?.exists) throw new FleetError("Draft not found.", 404);
  if (input.threadId) await loadThread(context.tenantId, input.threadId);
  const schedule = existing?.exists
    ? scheduleAfterEdit({ status: String(existing.get("status") ?? "draft"), scheduledFor: existing.get("scheduledFor") ?? null }, new Date())
    : { status: "draft", scheduledFor: null, cleared: false };
  await ref.set(
    {
      threadId: input.threadId ?? null,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      body: input.body,
      status: schedule.status,
      scheduledFor: schedule.scheduledFor,
      updatedBy: context.user.uid,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing ? {} : { createdBy: context.user.uid, createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  await audit(context, existing ? "draft.updated" : "draft.created", { type: "draft", id: ref.id }, { threadId: input.threadId ?? null, ...(schedule.cleared ? { scheduleCleared: true } : {}) });
  return {
    created: !existing,
    draft: {
      id: ref.id,
      threadId: input.threadId ?? null,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      body: input.body,
      status: schedule.status,
      scheduledFor: schedule.scheduledFor,
      updatedAt: new Date().toISOString(),
    },
  };
}

async function requireDraft(context: MailContext, draftId: string) {
  const ref = mailCollection(context.tenantId, "drafts").doc(draftId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new FleetError("Draft not found.", 404);
  return { ref, snapshot };
}

export async function discardDraft(context: MailContext, draftId: string) {
  assertWriter(context);
  const { ref } = await requireDraft(context, draftId);
  await ref.delete();
  await audit(context, "draft.discarded", { type: "draft", id: draftId });
}

/** Sending goes through a provider adapter; with none configured the attempt is recorded and refused. */
export async function sendDraft(context: MailContext, draftId: string) {
  assertWriter(context);
  const { ref } = await requireDraft(context, draftId);
  const senders = MAIL_PROVIDERS.filter((provider) => provider.status().send);
  if (!senders.length) {
    await ref.set({ status: "send_blocked", scheduledFor: null, lastSendAttemptAt: FieldValue.serverTimestamp() }, { merge: true });
    await audit(context, "draft.send_blocked", { type: "draft", id: draftId }, { reason: "provider_not_configured" });
  }
  throw new FleetError(SEND_NOT_CONFIGURED, 409);
}

/** Queues a draft for a later time. With no provider configured it is never sent; the UI says so. */
export async function scheduleDraft(context: MailContext, draftId: string, at: string, now = new Date()) {
  assertWriter(context);
  const { ref, snapshot } = await requireDraft(context, draftId);
  const checked = validateScheduleTime(at, now);
  if ("error" in checked) throw new FleetError(checked.error, 400);
  if (!String(snapshot.get("to") ?? "").trim()) throw new FleetError("Add a recipient before scheduling.", 400);
  await ref.set({ status: "scheduled", scheduledFor: checked.at, scheduledBy: context.user.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const providerConfigured = MAIL_PROVIDERS.some((provider) => provider.status().send);
  await audit(context, "draft.scheduled", { type: "draft", id: draftId }, { scheduledFor: checked.at, provider: providerConfigured ? "configured" : "not_configured" });
  return { id: draftId, status: "scheduled", scheduledFor: checked.at, notice: providerConfigured ? null : SCHEDULE_NOT_CONFIGURED };
}

export async function cancelScheduledDraft(context: MailContext, draftId: string) {
  assertWriter(context);
  const { ref, snapshot } = await requireDraft(context, draftId);
  if (snapshot.get("status") !== "scheduled") throw new FleetError("This draft is not scheduled.", 409);
  await ref.set({ status: "draft", scheduledFor: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(context, "draft.schedule_cancelled", { type: "draft", id: draftId }, { scheduledFor: snapshot.get("scheduledFor") ?? null });
  return { id: draftId, status: "draft", scheduledFor: null };
}

/* ---------- splits and snippets ---------- */

export async function createSplit(context: MailContext, input: z.infer<typeof splitSchema>) {
  assertWriter(context);
  const existing = await listSplits(context);
  const order = existing.reduce((max, split) => Math.max(max, split.order), 0) + 1;
  const value = input.kind === "from-domain" || input.kind === "from-address" ? input.value.toLowerCase() : input.value;
  const ref = await mailCollection(context.tenantId, "splits").add({ name: input.name, kind: input.kind, value, order, createdAt: FieldValue.serverTimestamp() });
  await audit(context, "split.created", { type: "split", id: ref.id }, { name: input.name, kind: input.kind, value });
  return { id: ref.id, name: input.name, kind: input.kind, value, order };
}

export async function deleteSplit(context: MailContext, splitId: string) {
  assertWriter(context);
  const ref = mailCollection(context.tenantId, "splits").doc(splitId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new FleetError("Split not found.", 404);
  await ref.delete();
  await audit(context, "split.deleted", { type: "split", id: splitId }, { name: snapshot.get("name") });
}

export async function createTemplate(context: MailContext, input: z.infer<typeof templateSchema>) {
  assertWriter(context);
  const ref = await mailCollection(context.tenantId, "templates").add({ ...input, createdBy: context.user.uid, createdAt: FieldValue.serverTimestamp() });
  await audit(context, "template.created", { type: "template", id: ref.id }, { name: input.name });
  return { id: ref.id, ...input };
}

export async function deleteTemplate(context: MailContext, templateId: string) {
  assertWriter(context);
  const ref = mailCollection(context.tenantId, "templates").doc(templateId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new FleetError("Snippet not found.", 404);
  await ref.delete();
  await audit(context, "template.deleted", { type: "template", id: templateId }, { name: snapshot.get("name") });
}

/* ---------- filters ---------- */

type FilterTarget = FilterableMessage & { id: string; threadId: string; hasListId: boolean };

/** The header facts filters match on — never message bodies. */
async function filterTargets(tenantId: string): Promise<FilterTarget[]> {
  const snapshot = await mailCollection(tenantId, "messages").select("threadId", "from", "to", "cc", "subject", "listId", "attachments").get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    threadId: String(doc.get("threadId")),
    from: (doc.get("from") ?? null) as MailAddress | null,
    to: (doc.get("to") ?? []) as MailAddress[],
    cc: (doc.get("cc") ?? []) as MailAddress[],
    subject: String(doc.get("subject") ?? ""),
    listId: (doc.get("listId") ?? null) as string | null,
    hasListId: doc.get("listId") !== undefined,
    attachments: (doc.get("attachments") ?? []) as { filename: string }[],
  }));
}

async function requireFilter(context: MailContext, filterId: string) {
  const ref = mailCollection(context.tenantId, "filters").doc(filterId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new FleetError("Filter not found.", 404);
  return { ref, rule: toFilter(snapshot.id, snapshot.data()!) };
}

/** "Test against existing mail": which stored messages and threads a (possibly unsaved) rule matches. */
export async function previewFilter(context: MailContext, input: FilterDraftInput) {
  const [targets, threads] = await Promise.all([filterTargets(context.tenantId), listThreads(context.tenantId)]);
  const matched = targets.filter((message) => matchesFilter(input, message));
  const threadIds = new Set(matched.map((message) => message.threadId));
  const sample = sortThreads(threads.filter((thread) => threadIds.has(thread.id)))
    .slice(0, 20)
    .map((thread) => ({ id: thread.id, subject: thread.subject, state: thread.state, lastMessageAt: thread.lastMessageAt, fromAddresses: thread.fromAddresses.slice(0, 3) }));
  const usesListId = input.conditions.some((condition) => condition.field === "list-id");
  return {
    scanned: targets.length,
    messages: matched.length,
    threads: threadIds.size,
    sample,
    // Mail imported before List-Id was recorded cannot match a mailing-list condition.
    withoutListId: usesListId ? targets.filter((message) => !message.hasListId).length : 0,
  };
}

export async function createFilter(context: MailContext, input: FilterInput) {
  assertWriter(context);
  const existing = await listFilters(context.tenantId);
  if (existing.length >= 50) throw new FleetError("A workspace can have at most 50 filters.", 409);
  const order = existing.reduce((max, rule) => Math.max(max, rule.order), 0) + 1;
  const ref = await mailCollection(context.tenantId, "filters").add({ ...input, order, createdBy: context.user.uid, createdAt: FieldValue.serverTimestamp() });
  await audit(context, "filter.created", { type: "filter", id: ref.id }, { name: input.name, match: input.match, conditions: input.conditions, actions: input.actions });
  return toFilter(ref.id, { ...input, order });
}

export async function setFilterEnabled(context: MailContext, filterId: string, enabled: boolean) {
  assertWriter(context);
  const { ref, rule } = await requireFilter(context, filterId);
  await ref.set({ enabled, updatedBy: context.user.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(context, enabled ? "filter.enabled" : "filter.disabled", { type: "filter", id: filterId }, { name: rule.name });
  return { ...rule, enabled };
}

export async function deleteFilter(context: MailContext, filterId: string) {
  assertWriter(context);
  const { ref, rule } = await requireFilter(context, filterId);
  await ref.delete();
  await audit(context, "filter.deleted", { type: "filter", id: filterId }, { name: rule.name });
}

/** Explicit retro-apply: runs one saved rule over existing mail. Trash is never touched. */
export async function applyFilterToExisting(context: MailContext, filterId: string) {
  assertWriter(context);
  const { rule } = await requireFilter(context, filterId);
  const [targets, threads] = await Promise.all([filterTargets(context.tenantId), listThreads(context.tenantId)]);
  const active = { ...rule, enabled: true };
  const matched = targets.filter((message) => matchesFilter(active, message));
  const outcome = matched.length ? filterOutcome([active], matched[0]) : null;
  const threadIds = new Set(matched.map((message) => message.threadId));
  const threadsRef = mailCollection(context.tenantId, "threads");
  const patches: Array<[string, Partial<ThreadRecord>]> = [];
  for (const thread of threads) {
    if (!threadIds.has(thread.id) || !outcome) continue;
    const patch = retroPatch(thread, outcome);
    if (patch) patches.push([thread.id, patch]);
  }
  for (let index = 0; index < patches.length; index += 400) {
    const batch = db().batch();
    for (const [id, patch] of patches.slice(index, index + 400)) batch.set(threadsRef.doc(id), { ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
  }
  const result = { matchedMessages: matched.length, matchedThreads: threadIds.size, changedThreads: patches.length };
  await audit(context, "filter.retro_applied", { type: "filter", id: filterId }, { name: rule.name, ...result, threadIds: patches.map(([id]) => id).slice(0, 200) });
  return result;
}

/* ---------- contacts ---------- */

async function addressBook(context: MailContext) {
  const [snapshot, overrides] = await Promise.all([
    mailCollection(context.tenantId, "messages").select("threadId", "from", "to", "cc", "date").get(),
    mailCollection(context.tenantId, "contacts").get(),
  ]);
  const sources: ContactSource[] = snapshot.docs.map((doc) => ({
    threadId: String(doc.get("threadId")),
    from: (doc.get("from") ?? null) as MailAddress | null,
    to: (doc.get("to") ?? []) as MailAddress[],
    cc: (doc.get("cc") ?? []) as MailAddress[],
    date: (doc.get("date") ?? null) as string | null,
  }));
  const names = new Map(overrides.docs.map((doc) => [String(doc.get("email")), String(doc.get("displayName"))]));
  return deriveContacts(sources, names, context.user.email);
}

export async function listContacts(context: MailContext) {
  const contacts = await addressBook(context);
  return { contacts: contacts.map(withoutThreadIds), frequent: frequentCorrespondents(contacts).map((contact) => contact.id) };
}

function withoutThreadIds(contact: Contact): Omit<Contact, "threadIds"> {
  const { threadIds, ...rest } = contact;
  void threadIds;
  return rest;
}

async function requireContact(context: MailContext, id: string) {
  if (!/^c_[0-9a-f]{16}$/.test(id)) throw new FleetError("Contact not found.", 404);
  const contact = (await addressBook(context)).find((entry) => entry.id === id);
  if (!contact) throw new FleetError("Contact not found.", 404);
  return contact;
}

/** A contact page: the person plus every thread you share with them, newest first. */
export async function getContact(context: MailContext, id: string) {
  const contact = await requireContact(context, id);
  const ids = new Set(contact.threadIds);
  const threads = sortThreads((await listThreads(context.tenantId)).filter((thread) => ids.has(thread.id)));
  return { contact, threads };
}

/** Saves (or, with an empty name, clears) the display name you see for an address. */
export async function renameContact(context: MailContext, id: string, displayName: string) {
  assertWriter(context);
  const contact = await requireContact(context, id);
  const ref = mailCollection(context.tenantId, "contacts").doc(contactId(contact.email));
  const name = displayName.trim();
  if (name) await ref.set({ email: contact.email, displayName: name, updatedBy: context.user.uid, updatedAt: FieldValue.serverTimestamp() });
  else await ref.delete();
  await audit(context, name ? "contact.renamed" : "contact.name_cleared", { type: "contact", id }, { email: contact.email, from: contact.displayName, to: name || null });
  return { ...contact, displayName: name || null };
}

/* ---------- search ---------- */

async function readBodies(tenantId: string, keys: string[], into: Map<string, string>) {
  const messages = mailCollection(tenantId, "messages");
  const wanted = [...new Set(keys)].filter((key) => !into.has(key));
  for (let index = 0; index < wanted.length; index += 300) {
    const refs = wanted.slice(index, index + 300).map((key) => messages.doc(key));
    const docs = await db().getAll(...refs, { fieldMask: ["text"] });
    for (const doc of docs) into.set(doc.id, String(doc.get("text") ?? ""));
  }
  return wanted.length;
}

/**
 * Search reads each message's header fields and stored token index, never every body. Bodies are
 * read only to verify phrases/punctuated terms on candidates, for messages without an index, and
 * for the snippet of each returned thread. Results equal the full-scan reference (searchMessages).
 */
export async function searchMailbox(context: MailContext, rawQuery: string) {
  const query = rawQuery.slice(0, 300);
  const snapshot = await mailCollection(context.tenantId, "messages")
    .select("threadId", "subject", "from", "to", "cc", "date", "hasCalendarInvite", "attachments", "searchTokens", "searchIndexVersion", "searchIndexComplete")
    .get();
  const entries: IndexedMessage[] = snapshot.docs.map((doc) => ({
    key: doc.id,
    threadId: String(doc.get("threadId")),
    subject: String(doc.get("subject") ?? ""),
    from: (doc.get("from") ?? null) as MailAddress | null,
    to: (doc.get("to") ?? []) as MailAddress[],
    cc: (doc.get("cc") ?? []) as MailAddress[],
    date: (doc.get("date") ?? null) as string | null,
    hasCalendarInvite: Boolean(doc.get("hasCalendarInvite")),
    attachments: (doc.get("attachments") ?? []) as { filename: string }[],
    searchTokens: doc.get("searchIndexVersion") === SEARCH_INDEX_VERSION && doc.get("searchIndexComplete") !== false ? String(doc.get("searchTokens") ?? "") : null,
  }));
  const bodies = new Map<string, string>();
  const verified = await readBodies(context.tenantId, bodiesNeeded(entries, query), bodies);
  const ranked = rankIndexed(entries, query, bodies);
  const forSnippets = await readBodies(context.tenantId, ranked.map((hit) => hit.key), bodies);
  return {
    query,
    hits: finishHits(ranked, bodies),
    searched: entries.length,
    bodiesRead: verified + forSnippets,
    unindexed: entries.filter((entry) => entry.searchTokens === null).length,
  };
}

/** Full-scan reference search (every body); kept to prove the indexed search returns the same. */
export async function searchMailboxFullScan(context: MailContext, rawQuery: string) {
  const messages = await listAllMessages(context.tenantId);
  return searchMessages(messages, rawQuery.slice(0, 300));
}

/** Builds the token index for messages imported before it existed (or with an older version). */
export async function reindexSearch(context: MailContext) {
  assertWriter(context);
  const messages = mailCollection(context.tenantId, "messages");
  const snapshot = await messages.select("searchIndexVersion").get();
  const stale = snapshot.docs.filter((doc) => doc.get("searchIndexVersion") !== SEARCH_INDEX_VERSION).map((doc) => doc.id);
  const texts = new Map<string, string>();
  await readBodies(context.tenantId, stale, texts);
  const ids = [...texts.keys()];
  for (let index = 0; index < ids.length; index += 400) {
    const batch = db().batch();
    for (const id of ids.slice(index, index + 400)) batch.set(messages.doc(id), buildSearchIndex(texts.get(id) ?? ""), { merge: true });
    await batch.commit();
  }
  await audit(context, "search.reindexed", { type: "searchIndex", id: `v${SEARCH_INDEX_VERSION}` }, { indexed: ids.length, total: snapshot.size });
  return { indexed: ids.length, total: snapshot.size };
}

/* ---------- export ---------- */

export const EXPORT_COLLECTIONS = ["threads", "messages", "drafts", "splits", "templates", "filters", "contacts", "bulkOps", "importRuns", "settings"] as const;

/** Complete, versioned JSON export of the tenant mailbox. */
export async function buildMailExport(context: MailContext) {
  const data: Record<string, unknown[]> = {};
  for (const name of EXPORT_COLLECTIONS) {
    const snapshot = await mailCollection(context.tenantId, name).get();
    data[name] = snapshot.docs.map((doc) => ({ id: doc.id, ...(toPortable(doc.data()) as Record<string, unknown>) }));
  }
  // The derived address book (counts, last contact, shared threads) alongside the saved name overrides.
  data.addressBook = (await addressBook(context)) as unknown[];
  data.members = (await listTenantMembers(MAIL_PRODUCT, context.tenantId)).map((member) => toPortable(member));
  data.auditEvents = await listAuditEvents(MAIL_PRODUCT, context.tenantId, 1000);
  const files = Object.entries(data).map(([name, records]) => ({
    path: `${name}.json`,
    schema: `${MAIL_EXPORT_SCHEMA}.${name}@${MAIL_EXPORT_VERSION}`,
    records: records.length,
  }));
  return { manifest: buildExportManifest(MAIL_PRODUCT, context.tenantId, files), data };
}
