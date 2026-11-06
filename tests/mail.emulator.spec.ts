import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Never touch production: this spec only runs inside `firebase emulators:exec`.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("mail.emulator.spec.ts must run against the Firestore emulator (FIRESTORE_EMULATOR_HOST is not set).");
}
process.env.FIREBASE_PROJECT_ID = "demo-saasassin";

const app = initializeApp({ projectId: "demo-saasassin" }, "mail-golden-path");
const db: Firestore = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => db,
  getAdminAuth: () => null,
  isFirebaseConfigured: () => true,
}));

const tenants = await import("@/lib/fleet/platform/tenants");
const { FleetError } = await import("@/lib/fleet/platform/session");
const store = await import("@/lib/mail/store");
const service = await import("@/lib/mail/service");
const schema = await import("@/lib/mail/schema");
const workflow = await import("@/lib/mail/workflow");
const { SEND_NOT_CONFIGURED } = await import("@/lib/mail/provider");
const { ZodError } = await import("zod");

type User = { uid: string; email: string; name: string };
const owner: User = { uid: "mail-owner", email: "me@example.com", name: "Mia Owner" };
const member: User = { uid: "mail-member", email: "mo@example.com", name: "Mo Member" };
const viewer: User = { uid: "mail-viewer", email: "vi@example.com", name: "Vi Viewer" };
const outsider: User = { uid: "mail-outsider", email: "ot@example.com", name: "Otto Outsider" };

let tenantId = "";
let otherTenantId = "";

/** Mirrors fleetApiError: FleetError keeps its status, a ZodError becomes a 400. */
async function expectFleetError(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (error instanceof ZodError) {
    expect(status).toBe(400);
    return;
  }
  expect(error, `expected a FleetError ${status}`).toBeInstanceOf(FleetError);
  expect((error as InstanceType<typeof FleetError>).status).toBe(status);
}

async function grant(user: User, role: string) {
  await db.doc(`products/mail/tenants/${tenantId}/memberships/${user.uid}`).set({ uid: user.uid, email: user.email, name: user.name, role, status: "active" });
}

/** Same sequence as every mail route: membership (optionally role-gated), then the operation. */
const as = (user: User, roles?: string[]) => store.mailMember(tenantId, user, roles);

type EmlInput = {
  id: string;
  from: string;
  to?: string;
  subject: string;
  date: string;
  body?: string;
  inReplyTo?: string;
  references?: string[];
  headers?: string[];
  attachment?: string;
  invite?: boolean;
};

function eml(input: EmlInput) {
  const head = [
    `Message-ID: <${input.id}>`,
    `From: ${input.from}`,
    `To: ${input.to ?? "Mia Owner <me@example.com>"}`,
    `Subject: ${input.subject}`,
    `Date: ${new Date(input.date).toUTCString()}`,
    ...(input.inReplyTo ? [`In-Reply-To: <${input.inReplyTo}>`] : []),
    ...(input.references?.length ? [`References: ${input.references.map((id) => `<${id}>`).join(" ")}`] : []),
    ...(input.headers ?? []),
    "MIME-Version: 1.0",
  ];
  const text = input.body ?? `Body of ${input.subject}`;
  if (!input.attachment && !input.invite) return [...head, "Content-Type: text/plain; charset=utf-8", "", text, ""].join("\r\n");
  const parts = [`--b1\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n`];
  if (input.invite) parts.push(`--b1\r\nContent-Type: text/calendar; method=REQUEST\r\n\r\nBEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n`);
  if (input.attachment) parts.push(`--b1\r\nContent-Type: application/pdf\r\nContent-Disposition: attachment; filename="${input.attachment}"\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0xLjQK\r\n`);
  return [...head, 'Content-Type: multipart/mixed; boundary="b1"', "", ...parts, "--b1--", ""].join("\r\n");
}

const ROOT = eml({ id: "root@acme.com", from: "Alice Acme <alice@acme.com>", subject: "Q4 planning", date: "2026-10-01T09:00:00Z", body: "Let us plan the quarterly roadmap together." });
const REPLY1 = eml({ id: "reply1@example.com", from: "Mia Owner <me@example.com>", to: "alice@acme.com", subject: "Re: Q4 planning", date: "2026-10-01T10:00:00Z", inReplyTo: "root@acme.com", references: ["root@acme.com"], body: "Sounds good, Tuesday works." });
const REPLY2 = eml({ id: "reply2@acme.com", from: "Bob Acme <bob@acme.com>", subject: "Re: Q4 planning", date: "2026-10-02T08:00:00Z", inReplyTo: "reply1@example.com", references: ["root@acme.com", "reply1@example.com"], body: "Adding the budget sheet." });
const NEWSLETTER = eml({
  id: "issue-7@letters.io",
  from: "Weekly Letters <news@letters.io>",
  subject: "Weekly digest #7",
  date: "2026-10-03T07:00:00Z",
  body: "Top stories this week. Manage your subscription below.",
  headers: ["List-Id: Weekly Letters <weekly.letters.io>", "List-Unsubscribe: <mailto:unsub@letters.io?subject=stop>, <https://letters.io/u/abc123>", "List-Unsubscribe-Post: List-Unsubscribe=One-Click"],
});
const INVITE = eml({ id: "invite-1@partner.org", from: "Carol Partner <carol@partner.org>", subject: "Sync meeting", date: "2026-10-04T12:00:00Z", invite: true, body: "Invitation to our sync." });
const INVOICE = eml({ id: "invoice-42@vendor.com", from: "Dave Vendor <dave@vendor.com>", subject: "Invoice 42", date: "2026-10-05T12:00:00Z", attachment: "invoice-42.pdf", body: "Please find the invoice attached. Payment due in 30 days." });

const thread = (id: string) => workflow.threadIdFor(id);
const Q4 = thread("root@acme.com");

async function threadDoc(id: string) {
  const ctx = await as(owner);
  return (await service.getThread(ctx, id)).thread;
}

async function auditActions() {
  return (await tenants.listAuditEvents("mail", tenantId, 1000)).map((event) => event.action);
}

beforeAll(async () => {
  tenantId = (await tenants.createTenant("mail", owner, "Mia's inbox")).id;
  await grant(member, "member");
  await grant(viewer, "viewer");
  otherTenantId = (await tenants.createTenant("mail", outsider, "Otto's inbox")).id;
});

afterAll(async () => {
  await Promise.all(getApps().map((existing) => deleteApp(existing)));
});

describe("mail golden path against Firestore", () => {
  it("threads a reply imported before its parent, then dedupes by Message-ID on re-import", async () => {
    const ctx = await as(owner, schema.MAIL_WRITE_ROLES);
    const first = await store.importRawMessages(ctx, "late-reply.eml", [REPLY2]);
    expect(first).toMatchObject({ parsed: 1, imported: 1, duplicates: 0, failed: 0, threads: 1 });

    const second = await store.importRawMessages(ctx, "export.mbox", [ROOT, REPLY1, NEWSLETTER, INVITE, INVOICE, "not a message at all"]);
    expect(second).toMatchObject({ parsed: 5, imported: 5, duplicates: 0, failed: 1 });

    const again = await store.importRawMessages(ctx, "export.mbox", [ROOT, REPLY1, REPLY2, NEWSLETTER, INVITE, INVOICE]);
    expect(again).toMatchObject({ parsed: 6, imported: 0, duplicates: 6 });

    const { messages, thread: q4 } = await service.getThread(ctx, Q4);
    expect(messages.map((message) => message.messageId)).toEqual(["root@acme.com", "reply1@example.com", "reply2@acme.com"]);
    expect(q4).toMatchObject({ subject: "Q4 planning", messageCount: 3, unread: true, state: "inbox" });
    expect(q4.fromAddresses.sort()).toEqual(["alice@acme.com", "bob@acme.com", "me@example.com"]);

    const mailbox = await service.loadMailbox(ctx);
    expect(mailbox.threads).toHaveLength(4);
    expect(mailbox.imports.map((run) => run.imported).sort()).toEqual([0, 1, 5]);
    expect(await db.collection(`products/mail/tenants/${tenantId}/messages`).count().get().then((snapshot) => snapshot.data().count)).toBe(6);
  });

  it("seeds default splits, adds a rule-based split and counts unread per split", async () => {
    const ctx = await as(owner);
    const mailbox = await service.loadMailbox(ctx);
    expect(mailbox.splits.map((split) => split.name)).toEqual(["Calendar", "News"]);
    const acme = await service.createSplit(ctx, schema.splitSchema.parse({ name: "Acme", kind: "from-domain", value: "ACME.com" }));
    expect(acme.value).toBe("acme.com");
    const { threads, splits } = await service.loadMailbox(ctx);
    const counts = workflow.splitCounts(threads, splits, new Date());
    expect(counts["default-calendar-invite"]).toEqual({ total: 1, unread: 1 });
    expect(counts["default-newsletter"]).toEqual({ total: 1, unread: 1 });
    expect(counts[acme.id]).toEqual({ total: 1, unread: 1 });
    expect(counts[workflow.PRIMARY_SPLIT]).toEqual({ total: 1, unread: 1 });
    await service.deleteSplit(ctx, acme.id);
    expect((await service.loadMailbox(ctx)).splits).toHaveLength(2);
    await expectFleetError(service.deleteSplit(ctx, acme.id), 404);
  });

  it("archives, trashes, restores, stars, marks read and labels threads", async () => {
    const ctx = await as(member, schema.MAIL_WRITE_ROLES);
    const invoice = thread("invoice-42@vendor.com");
    await service.actOnThread(ctx, invoice, { type: "archive" });
    expect(await threadDoc(invoice)).toMatchObject({ state: "archived", unread: false });
    await service.actOnThread(ctx, invoice, { type: "restore" });
    await service.actOnThread(ctx, invoice, { type: "star", value: true });
    await service.actOnThread(ctx, invoice, { type: "read", value: true });
    await service.actOnThread(ctx, invoice, { type: "label", label: "Finance", value: true });
    await service.actOnThread(ctx, invoice, { type: "label", label: "Clients", value: true });
    await service.actOnThread(ctx, invoice, { type: "label", label: "Clients", value: false });
    expect(await threadDoc(invoice)).toMatchObject({ state: "inbox", starred: true, unread: false, labels: ["Finance"] });
    await service.actOnThread(ctx, invoice, { type: "trash" });
    expect(await threadDoc(invoice)).toMatchObject({ state: "trash" });
    await expectFleetError(service.actOnThread(ctx, invoice, { type: "snooze", until: new Date(Date.now() + 3_600_000).toISOString() }), 400);
    await service.actOnThread(ctx, invoice, { type: "restore" });
    await expectFleetError(service.actOnThread(ctx, "t_0000000000000000", { type: "archive" }), 404);
    await expectFleetError(service.actOnThread(ctx, "../../etc", { type: "archive" }), 404);
  });

  it("hides a snoozed thread until its time and wakes it when new mail arrives", async () => {
    const ctx = await as(owner);
    const until = new Date(Date.now() + 2 * 86_400_000).toISOString();
    await expectFleetError(service.actOnThread(ctx, Q4, { type: "snooze", until: "2020-01-01T00:00:00Z" }), 400);
    await service.actOnThread(ctx, Q4, { type: "snooze", until });
    const snoozed = await threadDoc(Q4);
    expect(workflow.threadView(snoozed, new Date())).toBe("snoozed");
    expect(workflow.threadView(snoozed, new Date(Date.parse(until) + 1000))).toBe("inbox");

    const followUp = eml({ id: "reply3@acme.com", from: "alice@acme.com", subject: "Re: Q4 planning", date: new Date(Date.now() - 60_000).toISOString(), inReplyTo: "reply2@acme.com", references: ["root@acme.com", "reply2@acme.com"] });
    await store.importRawMessages(ctx, "new.eml", [followUp]);
    const woken = await threadDoc(Q4);
    expect(woken.snoozedUntil).toBeNull();
    expect(workflow.threadView(woken, new Date())).toBe("inbox");
    expect(woken.messageCount).toBe(4);
  });

  it("surfaces a follow-up reminder only if nobody replied", async () => {
    const ctx = await as(owner);
    const invite = thread("invite-1@partner.org");
    const at = new Date(Date.now() + 86_400_000).toISOString();
    await expectFleetError(service.actOnThread(ctx, invite, { type: "remind", at: "2020-01-01T00:00:00Z" }), 400);
    await service.actOnThread(ctx, invite, { type: "remind", at });
    await service.actOnThread(ctx, invite, { type: "archive" });
    const waiting = await threadDoc(invite);
    expect(waiting.reminder?.at).toBe(at);
    expect(workflow.threadView(waiting, new Date())).toBe("archived");
    expect(workflow.threadView(waiting, new Date(Date.parse(at) + 1000))).toBe("inbox");

    const reply = eml({ id: "invite-reply@partner.org", from: "carol@partner.org", subject: "Re: Sync meeting", date: new Date(Date.now() + 60_000).toISOString(), inReplyTo: "invite-1@partner.org", references: ["invite-1@partner.org"] });
    await store.importRawMessages(ctx, "reply.eml", [reply]);
    const answered = await threadDoc(invite);
    expect(workflow.hasReplySinceReminder(answered)).toBe(true);
    expect(workflow.isReminderDue(answered, new Date(Date.parse(at) + 1000))).toBe(false);
    await service.actOnThread(ctx, invite, { type: "clear-reminder" });
    expect((await threadDoc(invite)).reminder).toBeNull();
  });

  it("saves reply drafts, records a blocked send without sending, and discards", async () => {
    const ctx = await as(member, schema.MAIL_WRITE_ROLES);
    await expectFleetError(Promise.resolve().then(() => service.saveDraft(ctx, schema.draftSchema.parse({ to: "nobody", subject: "x", body: "" }))), 400);
    await expectFleetError(service.saveDraft(ctx, schema.draftSchema.parse({ threadId: "t_0000000000000000", to: "a@b.co", subject: "x", body: "" })), 404);
    const { draft, created } = await service.saveDraft(ctx, schema.draftSchema.parse({ threadId: Q4, to: "alice@acme.com", subject: "Re: Q4 planning", body: "Draft one" }));
    expect(created).toBe(true);
    const updated = await service.saveDraft(ctx, schema.draftSchema.parse({ id: draft.id, threadId: Q4, to: "alice@acme.com", subject: "Re: Q4 planning", body: "Draft two" }));
    expect(updated.created).toBe(false);
    await expectFleetError(service.saveDraft(ctx, schema.draftSchema.parse({ id: "missing-draft", to: "a@b.co", subject: "", body: "" })), 404);

    const sendError = await service.sendDraft(ctx, draft.id).then(() => null, (caught: unknown) => caught);
    expect(sendError).toBeInstanceOf(FleetError);
    expect((sendError as InstanceType<typeof FleetError>).status).toBe(409);
    expect((sendError as Error).message).toBe(SEND_NOT_CONFIGURED);
    const drafts = await store.listDrafts(tenantId);
    expect(drafts.find((entry) => entry.id === draft.id)).toMatchObject({ status: "send_blocked", body: "Draft two" });
    expect(await auditActions()).toContain("draft.send_blocked");

    const scratch = await service.saveDraft(ctx, schema.draftSchema.parse({ to: "x@y.co", subject: "Scratch", body: "" }));
    await service.discardDraft(ctx, scratch.draft.id);
    await expectFleetError(service.discardDraft(ctx, scratch.draft.id), 404);
    await expectFleetError(service.sendDraft(ctx, scratch.draft.id), 404);
  });

  it("stores snippets", async () => {
    const ctx = await as(owner);
    await expectFleetError(Promise.resolve().then(() => schema.templateSchema.parse({ name: "", body: "x" })), 400);
    const snippet = await service.createTemplate(ctx, schema.templateSchema.parse({ name: "Thanks", body: "Thanks, talk soon." }));
    expect((await service.loadMailbox(ctx)).templates).toEqual([{ id: snippet.id, name: "Thanks", body: "Thanks, talk soon." }]);
    const extra = await service.createTemplate(ctx, schema.templateSchema.parse({ name: "Zzz", body: "Later" }));
    await service.deleteTemplate(ctx, extra.id);
    await expectFleetError(service.deleteTemplate(ctx, extra.id), 404);
  });

  it("searches with operators and ranks subject matches first", async () => {
    const ctx = await as(viewer);
    const ids = async (query: string) => (await service.searchMailbox(ctx, query)).hits.map((hit) => hit.threadId);
    expect(await ids("invoice")).toEqual([thread("invoice-42@vendor.com")]);
    expect(await ids("from:bob budget")).toEqual([Q4]);
    expect(await ids("has:attachment")).toEqual([thread("invoice-42@vendor.com")]);
    expect(await ids("has:invite")).toEqual([thread("invite-1@partner.org")]);
    expect(await ids("subject:digest")).toEqual([thread("issue-7@letters.io")]);
    expect(await ids("to:alice tuesday")).toEqual([Q4]);
    expect(await ids("nothing-matches-this")).toEqual([]);
    expect(await ids("")).toEqual([]);
    const [hit] = (await service.searchMailbox(ctx, "payment")).hits;
    expect(hit.snippet).toContain("Payment due");
  });

  it("lets viewers read but never write, and hides the workspace from outsiders", async () => {
    await expectFleetError(as(viewer, schema.MAIL_WRITE_ROLES), 403);
    const ctx = await as(viewer);
    expect((await service.loadMailbox(ctx)).role).toBe("viewer");
    expect((await service.getThread(ctx, Q4)).messages.length).toBe(4);
    await expectFleetError(store.importRawMessages(ctx, "x.eml", [ROOT]), 403);
    await expectFleetError(service.actOnThread(ctx, Q4, { type: "archive" }), 403);
    await expectFleetError(service.saveDraft(ctx, schema.draftSchema.parse({ to: "a@b.co", subject: "", body: "" })), 403);
    await expectFleetError(service.createSplit(ctx, schema.splitSchema.parse({ name: "X", kind: "newsletter" })), 403);
    await expectFleetError(service.createTemplate(ctx, schema.templateSchema.parse({ name: "X", body: "y" })), 403);
    await expectFleetError(service.discardDraft(ctx, "whatever"), 403);
    await expectFleetError(service.sendDraft(ctx, "whatever"), 403);

    await expectFleetError(as(outsider), 404);
    await expectFleetError(store.mailMember("no-such-tenant", owner), 404);
  });

  it("keeps a second tenant's mailbox isolated", async () => {
    const otto = await store.mailMember(otherTenantId, outsider, schema.MAIL_WRITE_ROLES);
    expect((await service.loadMailbox(otto)).threads).toEqual([]);
    expect((await service.searchMailbox(otto, "invoice")).hits).toEqual([]);
    await expectFleetError(service.getThread(otto, Q4), 404);
    await store.importRawMessages(otto, "otto.eml", [ROOT]);
    // Same Message-ID in another tenant is a different record; neither side sees the other.
    expect((await service.getThread(otto, Q4)).messages).toHaveLength(1);
    expect((await service.getThread(await as(owner), Q4)).messages).toHaveLength(4);
    const ottoExport = await service.buildMailExport(otto);
    expect(ottoExport.data.messages).toHaveLength(1);
  });

  it("audits every mutation", async () => {
    const actions = await auditActions();
    for (const action of [
      "tenant.created",
      "mail.imported",
      "split.defaults_seeded",
      "split.created",
      "split.deleted",
      "thread.archive",
      "thread.trash",
      "thread.restore",
      "thread.star",
      "thread.read",
      "thread.label",
      "thread.snooze",
      "thread.remind",
      "thread.clear-reminder",
      "draft.created",
      "draft.updated",
      "draft.send_blocked",
      "draft.discarded",
      "template.created",
      "template.deleted",
    ]) {
      expect(actions, action).toContain(action);
    }
    const events = await tenants.listAuditEvents("mail", tenantId, 1000);
    expect(events.every((event) => event.actor.uid && event.occurredAt)).toBe(true);
  });

  it("exports every record with a versioned manifest", async () => {
    const ctx = await as(viewer);
    const { manifest, data } = await service.buildMailExport(ctx);
    expect(manifest).toMatchObject({ schema: "net.saasassin.workspace-export", product: "mail", tenantId });
    for (const name of service.EXPORT_COLLECTIONS) {
      const count = (await db.collection(`products/mail/tenants/${tenantId}/${name}`).count().get()).data().count;
      expect(data[name], name).toHaveLength(count);
      expect(manifest.files.find((file) => file.path === `${name}.json`)?.records, name).toBe(count);
    }
    expect(data.messages).toHaveLength(8);
    expect(data.members).toHaveLength(3);
    expect((data.auditEvents as unknown[]).length).toBeGreaterThan(20);
    expect(JSON.stringify(data)).not.toContain("_seconds");
  });
});
