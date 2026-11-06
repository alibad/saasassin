import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { z } from "zod";

import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import { FleetError } from "@/lib/fleet/platform/session";
import { listAuditEvents, listTenantMembers } from "@/lib/fleet/platform/tenants";

import { MAIL_PROVIDERS, providerStatuses, SEND_NOT_CONFIGURED } from "./provider";
import { MAIL_EXPORT_SCHEMA, MAIL_EXPORT_VERSION, MAIL_PRODUCT, type DraftInput, type splitSchema, type templateSchema } from "./schema";
import {
  assertWriter,
  audit,
  listAllMessages,
  listDrafts,
  listImportRuns,
  listSplits,
  listTemplates,
  listThreadMessages,
  listThreads,
  mailCollection,
  toThread,
  type MailContext,
} from "./store";
import { applyThreadAction, searchMessages, ThreadActionError, type ThreadAction, type ThreadRecord } from "./workflow";

/**
 * Route-level mail operations. Route handlers only resolve the session and parse input; every
 * read and write (and its role check and audit event) lives here, so the emulator spec drives the
 * exact code production runs.
 */

const THREAD_ID = /^t_[0-9a-f]{16}$/;

export async function loadMailbox(context: MailContext) {
  const [threads, splits, drafts, templates, imports] = await Promise.all([
    listThreads(context.tenantId),
    listSplits(context),
    listDrafts(context.tenantId),
    listTemplates(context.tenantId),
    listImportRuns(context.tenantId),
  ]);
  return { role: context.role, threads, splits, drafts, templates, imports, providers: providerStatuses() };
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

/* ---------- drafts ---------- */

export async function saveDraft(context: MailContext, input: DraftInput) {
  assertWriter(context);
  const drafts = mailCollection(context.tenantId, "drafts");
  const ref = input.id ? drafts.doc(input.id) : drafts.doc();
  const existing = input.id ? await ref.get() : null;
  if (input.id && !existing?.exists) throw new FleetError("Draft not found.", 404);
  if (input.threadId) await loadThread(context.tenantId, input.threadId);
  await ref.set(
    {
      threadId: input.threadId ?? null,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      body: input.body,
      status: "draft",
      updatedBy: context.user.uid,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing ? {} : { createdBy: context.user.uid, createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  await audit(context, existing ? "draft.updated" : "draft.created", { type: "draft", id: ref.id }, { threadId: input.threadId ?? null });
  return {
    created: !existing,
    draft: { id: ref.id, threadId: input.threadId ?? null, to: input.to, cc: input.cc, subject: input.subject, body: input.body, status: "draft", updatedAt: new Date().toISOString() },
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
    await ref.set({ status: "send_blocked", lastSendAttemptAt: FieldValue.serverTimestamp() }, { merge: true });
    await audit(context, "draft.send_blocked", { type: "draft", id: draftId }, { reason: "provider_not_configured" });
  }
  throw new FleetError(SEND_NOT_CONFIGURED, 409);
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

/* ---------- search ---------- */

export async function searchMailbox(context: MailContext, rawQuery: string) {
  const query = rawQuery.slice(0, 300);
  const messages = await listAllMessages(context.tenantId);
  return { query, hits: searchMessages(messages, query), searched: messages.length };
}

/* ---------- export ---------- */

export const EXPORT_COLLECTIONS = ["threads", "messages", "drafts", "splits", "templates", "importRuns", "settings"] as const;

/** Complete, versioned JSON export of the tenant mailbox. */
export async function buildMailExport(context: MailContext) {
  const data: Record<string, unknown[]> = {};
  for (const name of EXPORT_COLLECTIONS) {
    const snapshot = await mailCollection(context.tenantId, name).get();
    data[name] = snapshot.docs.map((doc) => ({ id: doc.id, ...(toPortable(doc.data()) as Record<string, unknown>) }));
  }
  data.members = (await listTenantMembers(MAIL_PRODUCT, context.tenantId)).map((member) => toPortable(member));
  data.auditEvents = await listAuditEvents(MAIL_PRODUCT, context.tenantId, 1000);
  const files = Object.entries(data).map(([name, records]) => ({
    path: `${name}.json`,
    schema: `${MAIL_EXPORT_SCHEMA}.${name}@${MAIL_EXPORT_VERSION}`,
    records: records.length,
  }));
  return { manifest: buildExportManifest(MAIL_PRODUCT, context.tenantId, files), data };
}
