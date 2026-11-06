import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { FleetError, requireFleetUser, type FleetUser } from "@/lib/fleet/platform/session";
import { appendAuditEvent, db, requireTenantMember, tenantCollection } from "@/lib/fleet/platform/tenants";

import { applyArrival, filterOutcome, type FilterActions, type FilterRule } from "./filters";
import { parseEml, type MailAddress, type ParsedMessage } from "./mime";
import { buildSearchIndex } from "./search-index";
import { MAIL_PRODUCT, MAIL_WRITE_ROLES } from "./schema";
import {
  assignThreads,
  DEFAULT_SPLITS,
  isReplySubject,
  messageDocId,
  type KnownMessage,
  type SplitRule,
  type ThreadRecord,
} from "./workflow";

export type MailContext = { user: FleetUser; tenantId: string; role: string };

/** Every mail route: signed-in product user → active tenant membership (optionally role-gated). */
export async function mailContext(params: Promise<{ tenantId: string }>, roles?: string[]): Promise<MailContext> {
  const { tenantId } = await params;
  const user = await requireFleetUser(MAIL_PRODUCT);
  return mailMember(tenantId, user, roles);
}

/** Active-membership check for a known user (the session-free half of mailContext). */
export async function mailMember(tenantId: string, user: FleetUser, roles?: string[]): Promise<MailContext> {
  const { role } = await requireTenantMember(MAIL_PRODUCT, tenantId, user, roles);
  return { user, tenantId, role: String(role) };
}

/** Write paths re-check the role even when a route already did, so no caller can skip it. */
export function assertWriter(context: MailContext) {
  if (!MAIL_WRITE_ROLES.includes(context.role)) throw new FleetError("Your role does not allow this action.", 403);
}

export function mailCollection(tenantId: string, name: string) {
  return tenantCollection(MAIL_PRODUCT, tenantId, name);
}

export function audit(context: MailContext, action: string, target: { type: string; id: string }, details: Record<string, unknown> = {}) {
  return appendAuditEvent(MAIL_PRODUCT, context.tenantId, context.user, action, target, details);
}

function iso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "toDate" in value && typeof value.toDate === "function") return (value.toDate() as Date).toISOString();
  return null;
}

export function toThread(id: string, data: FirebaseFirestore.DocumentData): ThreadRecord {
  return {
    id,
    subject: String(data.subject ?? ""),
    snippet: String(data.snippet ?? ""),
    participants: (data.participants ?? []) as MailAddress[],
    fromAddresses: (data.fromAddresses ?? []) as string[],
    messageCount: Number(data.messageCount ?? 0),
    lastMessageAt: String(data.lastMessageAt ?? new Date(0).toISOString()),
    state: data.state === "archived" || data.state === "trash" ? data.state : "inbox",
    starred: Boolean(data.starred),
    unread: Boolean(data.unread),
    labels: (data.labels ?? []) as string[],
    snoozedUntil: data.snoozedUntil ?? null,
    reminder: data.reminder ?? null,
    hasCalendarInvite: Boolean(data.hasCalendarInvite),
    isNewsletter: Boolean(data.isNewsletter),
    muted: Boolean(data.muted),
  };
}

export async function listThreads(tenantId: string) {
  const snapshot = await mailCollection(tenantId, "threads").orderBy("lastMessageAt", "desc").get();
  return snapshot.docs.map((doc) => toThread(doc.id, doc.data()));
}

export async function listSplits(context: MailContext) {
  const settingsRef = mailCollection(context.tenantId, "settings").doc("mailbox");
  const settings = await settingsRef.get();
  if (!settings.exists || !settings.get("splitsSeeded")) {
    const batch = db().batch();
    // Deterministic ids keep concurrent first loads from seeding twice.
    for (const split of DEFAULT_SPLITS) batch.set(mailCollection(context.tenantId, "splits").doc(`default-${split.kind}`), { ...split, createdAt: FieldValue.serverTimestamp() });
    batch.set(settingsRef, { splitsSeeded: true }, { merge: true });
    await batch.commit();
    await audit(context, "split.defaults_seeded", { type: "split", id: "defaults" }, { names: DEFAULT_SPLITS.map((split) => split.name) });
  }
  const snapshot = await mailCollection(context.tenantId, "splits").get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, name: String(doc.get("name")), kind: doc.get("kind"), value: String(doc.get("value") ?? ""), order: Number(doc.get("order") ?? 0) }) as SplitRule)
    .sort((a, b) => a.order - b.order);
}

export async function listDrafts(tenantId: string) {
  const snapshot = await mailCollection(tenantId, "drafts").orderBy("updatedAt", "desc").get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      threadId: (data.threadId ?? null) as string | null,
      to: String(data.to ?? ""),
      cc: String(data.cc ?? ""),
      subject: String(data.subject ?? ""),
      body: String(data.body ?? ""),
      status: String(data.status ?? "draft"),
      scheduledFor: (data.scheduledFor ?? null) as string | null,
      updatedAt: iso(data.updatedAt),
    };
  });
}

export function toFilter(id: string, data: FirebaseFirestore.DocumentData): FilterRule {
  const actions = (data.actions ?? {}) as Partial<FilterActions>;
  return {
    id,
    name: String(data.name ?? ""),
    match: data.match === "any" ? "any" : "all",
    conditions: ((data.conditions ?? []) as FilterRule["conditions"]).map((condition) => ({ field: condition.field, value: String(condition.value ?? "") })),
    actions: { label: actions.label ?? null, archive: Boolean(actions.archive), star: Boolean(actions.star), markRead: Boolean(actions.markRead), skipInbox: Boolean(actions.skipInbox) },
    enabled: data.enabled !== false,
    order: Number(data.order ?? 0),
  };
}

export async function listFilters(tenantId: string) {
  const snapshot = await mailCollection(tenantId, "filters").get();
  return snapshot.docs.map((doc) => toFilter(doc.id, doc.data())).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export async function listTemplates(tenantId: string) {
  const snapshot = await mailCollection(tenantId, "templates").orderBy("name").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, name: String(doc.get("name")), body: String(doc.get("body")) }));
}

export async function listImportRuns(tenantId: string) {
  const snapshot = await mailCollection(tenantId, "importRuns").orderBy("createdAt", "desc").limit(10).get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      fileName: String(data.fileName ?? ""),
      parsed: Number(data.parsed ?? 0),
      imported: Number(data.imported ?? 0),
      duplicates: Number(data.duplicates ?? 0),
      failed: Number(data.failed ?? 0),
      createdAt: iso(data.createdAt),
    };
  });
}

export function toMessage(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    messageId: String(data.messageId),
    threadId: String(data.threadId),
    subject: String(data.subject ?? ""),
    from: (data.from ?? null) as MailAddress | null,
    to: (data.to ?? []) as MailAddress[],
    cc: (data.cc ?? []) as MailAddress[],
    date: (data.date ?? null) as string | null,
    text: String(data.text ?? ""),
    bodySource: String(data.bodySource ?? "none"),
    hasCalendarInvite: Boolean(data.hasCalendarInvite),
    listUnsubscribe: (data.listUnsubscribe ?? null) as string | null,
    listUnsubscribePost: (data.listUnsubscribePost ?? null) as string | null,
    listId: (data.listId ?? null) as string | null,
    appliedFilters: (data.appliedFilters ?? []) as string[],
    attachments: (data.attachments ?? []) as { filename: string; contentType: string; size: number }[],
  };
}

export type StoredMessage = ReturnType<typeof toMessage>;

export async function listThreadMessages(tenantId: string, threadId: string) {
  const snapshot = await mailCollection(tenantId, "messages").where("threadId", "==", threadId).get();
  return snapshot.docs.map((doc) => toMessage(doc.id, doc.data())).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

export async function listAllMessages(tenantId: string) {
  const snapshot = await mailCollection(tenantId, "messages").get();
  return snapshot.docs.map((doc) => toMessage(doc.id, doc.data()));
}

function snippetOf(text: string) {
  return text.replace(/^>.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function mergeParticipants(current: MailAddress[], message: ParsedMessage) {
  const byEmail = new Map(current.map((address) => [address.email, address]));
  for (const address of [message.from, ...message.to, ...message.cc]) {
    if (!address) continue;
    const existing = byEmail.get(address.email);
    if (!existing || (!existing.name && address.name)) byEmail.set(address.email, address);
  }
  return [...byEmail.values()].slice(0, 30);
}

/** Parses raw messages, threads them against the stored mailbox, and writes idempotently. */
export async function importRawMessages(context: MailContext, fileName: string, rawMessages: string[]) {
  assertWriter(context);
  const parsed: ParsedMessage[] = [];
  let failed = 0;
  for (const raw of rawMessages) {
    try {
      const message = parseEml(raw);
      if (!message.from && !message.subject && !message.text) failed += 1;
      else parsed.push(message);
    } catch {
      failed += 1;
    }
  }

  const messages = mailCollection(context.tenantId, "messages");
  const existingSnapshot = await messages.select("messageId", "threadId", "references", "inReplyTo", "subject").get();
  const known: KnownMessage[] = existingSnapshot.docs.map((doc) => ({
    messageId: String(doc.get("messageId")),
    threadId: String(doc.get("threadId")),
    references: (doc.get("references") ?? []) as string[],
    inReplyTo: (doc.get("inReplyTo") ?? null) as string | null,
    subject: String(doc.get("subject") ?? ""),
  }));
  const storedIds = new Set(known.map((message) => message.messageId));

  const unique = new Map<string, ParsedMessage>();
  let duplicates = 0;
  for (const message of parsed) {
    if (storedIds.has(message.messageId) || unique.has(message.messageId)) duplicates += 1;
    else unique.set(message.messageId, message);
  }
  const fresh = [...unique.values()];
  const threadMap = assignThreads(known, fresh);

  const threadIds = [...new Set(fresh.map((message) => threadMap.get(message.messageId)!))];
  const threadsRef = mailCollection(context.tenantId, "threads");
  const threadDocs = threadIds.length ? await db().getAll(...threadIds.map((id) => threadsRef.doc(id))) : [];
  const threads = new Map<string, ThreadRecord & { exists: boolean }>();
  for (const doc of threadDocs) {
    const base = toThread(doc.id, doc.data() ?? {});
    threads.set(doc.id, { ...base, exists: doc.exists, messageCount: doc.exists ? base.messageCount : 0, lastMessageAt: doc.exists ? base.lastMessageAt : new Date(0).toISOString() });
  }

  const rules = (await listFilters(context.tenantId)).filter((rule) => rule.enabled);
  const appliedFilters = new Map<string, string[]>();
  const nowIso = new Date().toISOString();
  const sortedFresh = [...fresh].sort((a, b) => (a.date ?? nowIso).localeCompare(b.date ?? nowIso));
  for (const message of sortedFresh) {
    const threadId = threadMap.get(message.messageId)!;
    const thread = threads.get(threadId)!;
    const isNewThread = !thread.exists && thread.messageCount === 0;
    const date = message.date ?? nowIso;
    thread.participants = mergeParticipants(thread.participants, message);
    if (message.from && !thread.fromAddresses.includes(message.from.email)) thread.fromAddresses = [...thread.fromAddresses, message.from.email].slice(0, 30);
    thread.messageCount += 1;
    // A reply imported before its parent names the thread "Re: …" until the original arrives.
    if (!thread.subject || (isReplySubject(thread.subject) && message.subject && !isReplySubject(message.subject))) thread.subject = message.subject || "(no subject)";
    if (date >= thread.lastMessageAt) {
      thread.lastMessageAt = date;
      thread.snippet = snippetOf(message.text);
    }
    thread.hasCalendarInvite ||= message.hasCalendarInvite;
    thread.isNewsletter ||= Boolean(message.listUnsubscribe);
    // New mail brings a thread back (out of Done and snooze, unread) unless the thread is muted
    // or a filter skips the inbox; filters may also label, star, mark read or archive.
    const outcome = filterOutcome(rules, message);
    if (outcome.matched.length) appliedFilters.set(message.messageId, outcome.matched);
    Object.assign(thread, applyArrival(thread, outcome, isNewThread));
  }

  const writes: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
  for (const message of fresh) {
    const threadId = threadMap.get(message.messageId)!;
    writes.push((batch) =>
      batch.set(messages.doc(messageDocId(message.messageId)), {
        ...message,
        threadId,
        appliedFilters: appliedFilters.get(message.messageId) ?? [],
        ...buildSearchIndex(message.text),
        sourceFile: fileName,
        importedBy: context.user.uid,
        importedAt: FieldValue.serverTimestamp(),
      }),
    );
  }
  for (const [threadId, thread] of threads) {
    const { exists, id: _id, ...data } = thread;
    void _id;
    writes.push((batch) =>
      batch.set(threadsRef.doc(threadId), { ...data, updatedAt: FieldValue.serverTimestamp(), ...(exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true }),
    );
  }
  for (let index = 0; index < writes.length; index += 400) {
    const batch = db().batch();
    for (const write of writes.slice(index, index + 400)) write(batch);
    await batch.commit();
  }

  const summary = { fileName, parsed: parsed.length, imported: fresh.length, duplicates, failed, threads: threadIds.length, filtered: appliedFilters.size };
  const run = await mailCollection(context.tenantId, "importRuns").add({ ...summary, createdBy: context.user.uid, createdAt: FieldValue.serverTimestamp() });
  await audit(context, "mail.imported", { type: "importRun", id: run.id }, summary);
  return { id: run.id, ...summary };
}
