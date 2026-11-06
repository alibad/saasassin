import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { EntitlementEvent, Post } from "@/lib/community/model";

// Golden path for SaaSassin Community against the Firestore emulator. Never runs against production.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("community.emulator.spec.ts only runs under the Firestore emulator (FIRESTORE_EMULATOR_HOST is not set).");
}
process.env.FIREBASE_PROJECT_ID = "demo-saasassin";

const app = initializeApp({ projectId: "demo-saasassin" }, "community-golden-path");
const db: Firestore = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => db,
  getAdminAuth: () => null,
  isFirebaseConfigured: () => true,
}));

const platform = await import("@/lib/fleet/platform/tenants");
const { FleetError } = await import("@/lib/fleet/platform/session");
const data = await import("@/lib/community/data");
const model = await import("@/lib/community/model");

type User = { uid: string; email: string; name: string };
const owner: User = { uid: "cm-owner", email: "olivia.owner@example.com", name: "Olivia Owner" };
const mod: User = { uid: "cm-mod", email: "max.mod@example.com", name: "Max Mod" };
const alice: User = { uid: "cm-alice", email: "alice.secret@example.com", name: "Alice Member" };
const bob: User = { uid: "cm-bob", email: "bob.private@example.com", name: "Bob Member" };
const dave: User = { uid: "cm-dave", email: "dave@example.com", name: "Dave Leaver" };
const outsider: User = { uid: "cm-outsider", email: "otto@example.com", name: "Otto Outsider" };
const rival: User = { uid: "cm-rival", email: "rita@example.com", name: "Rita Rival" };

let tenantId = "";
let rivalTenantId = "";
let inviteCode = "";
const ids: Record<string, string> = {};

async function expectFleetError(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (cause: unknown) => cause);
  expect(error, `expected FleetError ${status}`).toBeInstanceOf(FleetError);
  expect((error as InstanceType<typeof FleetError>).status).toBe(status);
}

const act = async (user: User, action: unknown) => data.runAction(tenantId, user, model.actionSchema.parse(action));
const col = (name: string) => db.collection(`products/community/tenants/${tenantId}/${name}`);
async function auditActions() {
  return (await col("auditEvents").get()).docs.map((doc) => String(doc.get("action")));
}

beforeAll(async () => {
  tenantId = (await platform.createTenant("community", owner, "Indie Makers")).id;
  rivalTenantId = (await platform.createTenant("community", rival, "Rival Club")).id;
});

afterAll(async () => {
  await Promise.all(getApps().map((existing) => deleteApp(existing)));
});

describe("community golden path (Firestore emulator)", () => {
  it("creates the community, an invite link and open, private, announcement and event spaces", async () => {
    const workspace = await data.getWorkspace(tenantId, owner);
    expect(workspace.me.role).toBe("owner");
    inviteCode = workspace.invite?.code ?? "";
    expect(inviteCode).toMatch(model.INVITE_CODE_PATTERN);

    ids.general = (await act(owner, { type: "space.create", space: { name: "General", kind: "discussion", visibility: "members" } }) as { id: string }).id;
    ids.vip = (await act(owner, { type: "space.create", space: { name: "VIP Lounge", kind: "discussion", visibility: "private" } }) as { id: string }).id;
    ids.news = (await act(owner, { type: "space.create", space: { name: "News", kind: "announcements", visibility: "members" } }) as { id: string }).id;
    ids.events = (await act(owner, { type: "space.create", space: { name: "Meetups", kind: "events", visibility: "members" } }) as { id: string }).id;
    const spaces = (await col("spaces").get()).docs.map((doc) => doc.data());
    expect(spaces.map((space) => space.name).sort()).toEqual(["General", "Meetups", "News", "VIP Lounge"]);
    expect(spaces.find((space) => space.name === "VIP Lounge")?.visibility).toBe("private");

    await act(owner, { type: "space.move", spaceId: ids.events, direction: "up" });
    const ordered = model.sortSpaces((await col("spaces").get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }) as never as { id: string; order: number; name: string }));
    expect(ordered.map((space) => space.name)).toEqual(["General", "VIP Lounge", "Meetups", "News"]);
  });

  it("lets people join by invite link and handles disabled and rotated codes", async () => {
    await expect(data.previewInvite(tenantId, inviteCode)).resolves.toEqual({ ok: true, name: "Indie Makers" });
    await expect(data.previewInvite(tenantId, "a".repeat(20))).resolves.toMatchObject({ ok: false });
    await expect(data.joinWithInvite(tenantId, inviteCode, alice)).resolves.toEqual({ tenantId, alreadyMember: false });
    await expect(data.joinWithInvite(tenantId, inviteCode, alice)).resolves.toEqual({ tenantId, alreadyMember: true });
    await data.joinWithInvite(tenantId, inviteCode, bob);
    await data.joinWithInvite(tenantId, inviteCode, mod);
    await data.joinWithInvite(tenantId, inviteCode, dave);
    await act(owner, { type: "member.role", uid: mod.uid, role: "moderator" });
    expect((await db.doc(`products/community/tenants/${tenantId}/memberships/${mod.uid}`).get()).get("role")).toBe("moderator");
    expect((await db.doc(`products/community/users/${alice.uid}/tenants/${tenantId}`).get()).exists).toBe(true);

    await act(owner, { type: "invite.toggle", enabled: false });
    await expectFleetError(data.joinWithInvite(tenantId, inviteCode, outsider), 403);
    await expect(data.previewInvite(tenantId, inviteCode)).resolves.toMatchObject({ ok: false, error: model.INVITE_ERRORS.disabled });
    await act(owner, { type: "invite.toggle", enabled: true });
    const rotated = (await act(owner, { type: "invite.rotate" }) as { code: string }).code;
    expect(rotated).not.toBe(inviteCode);
    await expectFleetError(data.joinWithInvite(tenantId, inviteCode, outsider), 404);
    inviteCode = rotated;

    // A removed member cannot come back through the link.
    await expectFleetError(act(alice, { type: "member.remove", uid: dave.uid }), 403);
    await act(owner, { type: "member.remove", uid: dave.uid });
    await expectFleetError(data.getWorkspace(tenantId, dave), 404);
    await expectFleetError(data.joinWithInvite(tenantId, inviteCode, dave), 403);
    await expectFleetError(act(owner, { type: "member.remove", uid: owner.uid }), 403);
  });

  it("publishes posts with space rules enforced on the server", async () => {
    ids.alicePost = (await act(alice, { type: "post.create", spaceId: ids.general, title: "Hello makers", body: "First post" }) as { id: string }).id;
    ids.bobPost = (await act(bob, { type: "post.create", spaceId: ids.general, title: "Buy my course", body: "Spam spam" }) as { id: string }).id;
    ids.modPost = (await act(mod, { type: "post.create", spaceId: ids.general, title: "Mod opinion", body: "Hot take" }) as { id: string }).id;
    ids.vipPost = (await act(owner, { type: "post.create", spaceId: ids.vip, title: "VIP secret", body: "Members-only plan" }) as { id: string }).id;
    ids.newsPost = (await act(owner, { type: "post.create", spaceId: ids.news, title: "Welcome", body: "Read the rules" }) as { id: string }).id;
    await expectFleetError(act(alice, { type: "post.create", spaceId: ids.vip, title: "Sneak", body: "in" }), 404);
    await expectFleetError(act(alice, { type: "post.create", spaceId: ids.news, title: "Not allowed", body: "announce" }), 403);
    await expectFleetError(act(alice, { type: "post.create", spaceId: ids.events, title: "No time", body: "when?" }), 400);
    ids.event = (await act(alice, {
      type: "post.create",
      spaceId: ids.events,
      title: "Founder breakfast",
      body: "Coffee and demos",
      event: { startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: null, location: "Cafe Uno" },
    }) as { id: string }).id;
    const stored = (await col("posts").doc(ids.alicePost).get()).data();
    expect(stored).toMatchObject({ title: "Hello makers", authorUid: alice.uid, spaceId: ids.general, removed: false });
  });

  it("filters the feed by visibility: private-space posts are invisible and answer 404", async () => {
    const aliceView = await data.getWorkspace(tenantId, alice);
    expect(aliceView.spaces.map((space) => space.name)).not.toContain("VIP Lounge");
    expect(aliceView.feed.posts.map((post) => post.id)).not.toContain(ids.vipPost);
    expect(aliceView.feed.posts.map((post) => post.id)).toEqual(expect.arrayContaining([ids.alicePost, ids.bobPost, ids.newsPost, ids.event]));
    await expectFleetError(data.getPostThread(tenantId, ids.vipPost, alice), 404);
    await expectFleetError(act(alice, { type: "comment.create", postId: ids.vipPost, body: "let me in" }), 404);
    await expectFleetError(act(alice, { type: "reaction.toggle", postId: ids.vipPost, reaction: "like" }), 404);
    const ownerView = await data.getWorkspace(tenantId, owner);
    expect(ownerView.feed.posts.map((post) => post.id)).toContain(ids.vipPost);
    await expect(data.getPostThread(tenantId, ids.vipPost, owner)).resolves.toMatchObject({ post: { title: "VIP secret" } });
  });

  it("threads replies and keeps one reaction per member per type", async () => {
    await act(bob, { type: "comment.create", postId: ids.alicePost, body: "Welcome aboard" });
    await act(mod, { type: "comment.create", postId: ids.alicePost, body: "Glad you're here" });
    const thread = await data.getPostThread(tenantId, ids.alicePost, alice);
    expect(thread.comments.map((comment) => comment.body)).toEqual(["Welcome aboard", "Glad you're here"]);
    expect((await col("posts").doc(ids.alicePost).get()).get("commentCount")).toBe(2);

    await expect(act(bob, { type: "reaction.toggle", postId: ids.alicePost, reaction: "like" })).resolves.toMatchObject({ active: true, count: 1 });
    await expect(act(bob, { type: "reaction.toggle", postId: ids.alicePost, reaction: "like" })).resolves.toMatchObject({ active: false, count: 0 });
    await Promise.all([
      act(bob, { type: "reaction.toggle", postId: ids.alicePost, reaction: "celebrate" }),
      act(bob, { type: "reaction.toggle", postId: ids.alicePost, reaction: "celebrate" }),
    ]);
    const reactions = (await col("reactions").where("postId", "==", ids.alicePost).get()).docs.map((doc) => doc.data());
    const celebrate = reactions.filter((reaction) => reaction.uid === bob.uid && reaction.type === "celebrate");
    expect(celebrate.length).toBeLessThanOrEqual(1);
    expect((await col("posts").doc(ids.alicePost).get()).get("reactionCounts.celebrate")).toBe(celebrate.length);
    await act(alice, { type: "reaction.toggle", postId: ids.alicePost, reaction: "insightful" });
    await act(bob, { type: "bookmark.toggle", postId: ids.alicePost });
    expect((await data.getWorkspace(tenantId, bob)).myBookmarks).toEqual([ids.alicePost]);
  });

  it("gives members unique, validated, changeable handles; mentions resolve by handle and emails never leak", async () => {
    const before = await data.getWorkspace(tenantId, alice);
    expect(before.me.profile.handle).toBeNull();
    expect(before.me.suggestedHandle).toBe("alice-member");
    expect(before.members.find((member) => member.uid === alice.uid)?.handle).toBeNull();

    await expect(act(alice, { type: "profile.handle", handle: "@Alice" })).resolves.toEqual({ handle: "alice", changed: true });
    await expect(act(alice, { type: "profile.handle", handle: "alice" })).resolves.toEqual({ handle: "alice", changed: false });
    await expectFleetError(act(bob, { type: "profile.handle", handle: "alice" }), 409);
    await expectFleetError(act(bob, { type: "profile.handle", handle: "ad" }), 400);
    await expectFleetError(act(bob, { type: "profile.handle", handle: "admin" }), 400);
    await expectFleetError(act(bob, { type: "profile.handle", handle: "bob builds" }), 400);
    await act(bob, { type: "profile.handle", handle: "bob-builds" });
    await act(mod, { type: "profile.handle", handle: "max" });

    // Mentions resolve by chosen handle, not by the email name.
    ids.mentionPost = (await act(bob, { type: "post.create", spaceId: ids.general, title: "Shout-out", body: "Thanks @alice and @max! cc @alice.lovelace" }) as { id: string }).id;
    expect((await col("posts").doc(ids.mentionPost).get()).get("mentions").sort()).toEqual([alice.uid, mod.uid].sort());
    const emailMention = (await act(bob, { type: "comment.create", postId: ids.mentionPost, body: "ping @alice.lovelace and @bob.builder" }) as { id: string }).id;
    expect((await col("comments").doc(emailMention).get()).get("mentions")).toEqual([]);
    expect((await data.getWorkspace(tenantId, alice)).notifications.map((item) => item.postId)).toContain(ids.mentionPost);

    // Changing a handle releases the old one, re-points mentions and is audited.
    await act(alice, { type: "profile.handle", handle: "alice-m" });
    expect((await col("handles").doc("alice").get()).exists).toBe(false);
    expect((await col("handles").doc("alice-m").get()).get("uid")).toBe(alice.uid);
    const change = (await col("auditEvents").where("action", "==", "profile.handle_changed").get()).docs[0]?.get("details");
    expect(change).toEqual({ from: "alice", to: "alice-m" });
    const comment = (await act(bob, { type: "comment.create", postId: ids.mentionPost, body: "@alice-m see above, not @alice" }) as { id: string }).id;
    expect((await col("comments").doc(comment).get()).get("mentions")).toEqual([alice.uid]);

    // No member, moderator included, ever receives another member's email.
    const memberView = JSON.stringify(await data.getWorkspace(tenantId, bob));
    const modView = JSON.stringify([await data.getWorkspace(tenantId, mod), await data.getPostThread(tenantId, ids.event, mod)]);
    for (const view of [memberView, modView]) {
      for (const person of [owner, alice, dave]) {
        expect(view).not.toContain(person.email);
        expect(view).not.toContain(person.email.split("@")[0]);
      }
    }
    expect(JSON.stringify((await data.getWorkspace(tenantId, owner)).members)).toContain(alice.email);
  });

  it("moderates: pin, close, remove and restore with reasons, reports queue, appeals", async () => {
    await expectFleetError(act(alice, { type: "post.moderate", postId: ids.bobPost, operation: "pin" }), 403);
    await act(mod, { type: "post.moderate", postId: ids.alicePost, operation: "pin" });
    await act(mod, { type: "post.moderate", postId: ids.alicePost, operation: "close" });
    await expectFleetError(act(bob, { type: "comment.create", postId: ids.alicePost, body: "closed?" }), 403);
    await act(mod, { type: "post.moderate", postId: ids.alicePost, operation: "reopen" });
    await act(bob, { type: "comment.create", postId: ids.alicePost, body: "Open again" });

    // Reports: one per member per post, never your own, oldest first for moderators.
    await expectFleetError(act(bob, { type: "post.report", postId: ids.bobPost, reason: "mine" }), 400);
    await act(alice, { type: "post.report", postId: ids.bobPost, reason: "Spam" });
    await act(alice, { type: "post.report", postId: ids.bobPost, reason: "Spam, really" });
    const modView = await data.getWorkspace(tenantId, mod);
    expect(modView.reports).toHaveLength(1);
    expect(modView.reports[0]).toMatchObject({ postId: ids.bobPost, reason: "Spam, really" });
    expect((await data.getWorkspace(tenantId, alice)).reports).toEqual([]);
    await act(mod, { type: "report.resolve", reportId: modView.reports[0].id, resolution: "actioned", note: "Self-promotion" });
    await expectFleetError(act(mod, { type: "report.resolve", reportId: modView.reports[0].id, resolution: "dismissed" }), 409);

    // The author sees the reason, cannot open the post, and appeals once.
    const bobView = await data.getWorkspace(tenantId, bob);
    expect(bobView.myRemovedPosts).toEqual([expect.objectContaining({ id: ids.bobPost, removedReason: "Self-promotion", appealStatus: null })]);
    expect(bobView.feed.posts.map((post) => post.id)).not.toContain(ids.bobPost);
    // Moderators still see it in the feed, marked removed.
    expect((await data.getWorkspace(tenantId, mod)).feed.posts.find((post) => post.id === ids.bobPost)).toMatchObject({ removed: true, body: "Spam spam" });
    await expectFleetError(data.getPostThread(tenantId, ids.bobPost, bob), 410);
    await expectFleetError(act(alice, { type: "post.appeal", postId: ids.bobPost, message: "Not mine" }), 403);
    await act(bob, { type: "post.appeal", postId: ids.bobPost, message: "It was a genuine resource" });
    await expectFleetError(act(bob, { type: "post.appeal", postId: ids.bobPost, message: "Again" }), 403);
    await expectFleetError(act(bob, { type: "appeal.resolve", appealId: ids.bobPost, decision: "reinstated" }), 403);
    await act(mod, { type: "appeal.resolve", appealId: ids.bobPost, decision: "upheld", note: "Still spam" });

    // A moderator cannot decide their own appeal.
    await act(owner, { type: "post.moderate", postId: ids.modPost, operation: "remove", reason: "Off-topic" });
    await act(mod, { type: "post.appeal", postId: ids.modPost, message: "It was on topic" });
    expect((await data.getWorkspace(tenantId, mod)).appeals.map((appeal) => appeal.postId)).not.toContain(ids.modPost);
    await expectFleetError(act(mod, { type: "appeal.resolve", appealId: ids.modPost, decision: "reinstated" }), 403);
    await act(owner, { type: "appeal.resolve", appealId: ids.modPost, decision: "reinstated", note: "Fair" });
    expect((await col("posts").doc(ids.modPost).get()).get("removed")).toBe(false);

    // Remove and restore by hand, with the reason on the record.
    await act(mod, { type: "post.moderate", postId: ids.newsPost, operation: "remove", reason: "Outdated" });
    expect((await col("posts").doc(ids.newsPost).get()).get("removedReason")).toBe("Outdated");
    await act(mod, { type: "post.moderate", postId: ids.newsPost, operation: "restore" });
    expect((await col("posts").doc(ids.newsPost).get()).get("removed")).toBe(false);
    const commentId = (await data.getPostThread(tenantId, ids.alicePost, mod)).comments[0].id;
    await act(mod, { type: "comment.remove", commentId, reason: "Rude" });
    expect((await data.getPostThread(tenantId, ids.alicePost, alice)).comments.map((comment) => comment.id)).not.toContain(commentId);
  });

  it("takes RSVPs and moderator check-ins for events", async () => {
    await act(alice, { type: "rsvp.set", postId: ids.event, status: "going" });
    await act(bob, { type: "rsvp.set", postId: ids.event, status: "maybe" });
    await act(bob, { type: "rsvp.set", postId: ids.event, status: "going" });
    await expectFleetError(act(bob, { type: "rsvp.set", postId: ids.alicePost, status: "going" }), 400);
    await expectFleetError(act(alice, { type: "attendance.set", postId: ids.event, uid: bob.uid, attended: true }), 403);
    await act(mod, { type: "attendance.set", postId: ids.event, uid: alice.uid, attended: true });
    await act(mod, { type: "attendance.set", postId: ids.event, uid: owner.uid, attended: true });
    const thread = await data.getPostThread(tenantId, ids.event, mod);
    expect(thread.rsvps.summary).toEqual({ going: 3, maybe: 0, not_going: 0 });
    expect(thread.rsvps.attendance).toEqual({ going: 3, attended: 2, walkIns: 0, showUpRate: 2 / 3 });
    expect((await data.getPostThread(tenantId, ids.event, alice)).rsvps.attendance).toBeNull();
    const ics = await data.getEventCalendar(tenantId, ids.event, alice, "https://community.saasassin.net/apps/community");
    expect(ics).toContain("SUMMARY:Founder breakfast");
    await expectFleetError(data.getEventCalendar(tenantId, ids.alicePost, alice, "https://x"), 400);
  });

  it("unlocks private spaces through plans and replays the entitlement log", async () => {
    await expectFleetError(act(alice, { type: "plan.create", name: "VIP", spaceIds: [ids.vip] }), 403);
    ids.plan = (await act(owner, { type: "plan.create", name: "VIP", priceLabel: "$20 / month", spaceIds: [ids.vip] }) as { id: string }).id;
    await expectFleetError(act(owner, { type: "plan.create", name: "Ghost", spaceIds: ["missing-space"] }), 400);

    await expect(act(owner, { type: "entitlement.grant", planId: ids.plan, uid: alice.uid, reason: "Paid by invoice" })).resolves.toEqual({ changed: true, status: "active" });
    await expect(act(owner, { type: "entitlement.grant", planId: ids.plan, uid: alice.uid })).resolves.toEqual({ changed: false, status: "active" });
    const aliceView = await data.getWorkspace(tenantId, alice);
    expect(aliceView.spaces.map((space) => space.name)).toContain("VIP Lounge");
    expect(aliceView.feed.posts.map((post) => post.id)).toContain(ids.vipPost);
    expect(aliceView.myPlanIds).toEqual([ids.plan]);
    await expect(data.getPostThread(tenantId, ids.vipPost, alice)).resolves.toMatchObject({ post: { id: ids.vipPost } });
    await expectFleetError(data.getPostThread(tenantId, ids.vipPost, bob), 404);

    await act(owner, { type: "entitlement.revoke", planId: ids.plan, uid: alice.uid, reason: "Refunded" });
    await expectFleetError(data.getPostThread(tenantId, ids.vipPost, alice), 404);
    await act(owner, { type: "entitlement.grant", planId: ids.plan, uid: alice.uid, reason: "Re-subscribed" });
    const events = (await col("entitlementEvents").get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }) as never as EntitlementEvent);
    expect(events.map((event) => event.type).sort()).toEqual(["granted", "granted", "revoked"]);
    expect([...model.replayEntitlements(events)]).toEqual([model.entitlementDocId(ids.plan, alice.uid)]);
  });

  it("runs courses with progress and a certificate on completion", async () => {
    await expectFleetError(act(alice, { type: "course.create", spaceId: ids.vip, title: "Launch 101" }), 403);
    ids.course = (await act(owner, { type: "course.create", spaceId: ids.vip, title: "Launch 101", description: "Ship it" }) as { id: string }).id;
    ids.lesson1 = (await act(owner, { type: "lesson.add", courseId: ids.course, title: "Positioning", body: "Who is it for?" }) as { id: string }).id;
    ids.lesson2 = (await act(owner, { type: "lesson.add", courseId: ids.course, title: "Pricing", body: "Charge more" }) as { id: string }).id;
    await expectFleetError(act(bob, { type: "lesson.complete", courseId: ids.course, lessonId: ids.lesson1, completed: true }), 404);
    expect((await data.getWorkspace(tenantId, bob)).courses).toEqual([]);
    await expect(act(alice, { type: "lesson.complete", courseId: ids.course, lessonId: ids.lesson1, completed: true })).resolves.toEqual({ certificateId: null });
    const done = await act(alice, { type: "lesson.complete", courseId: ids.course, lessonId: ids.lesson2, completed: true }) as { certificateId: string };
    expect(done.certificateId).toBe(`cert_${ids.course}_${alice.uid}`);
    expect((await data.getWorkspace(tenantId, alice)).myProgress[ids.course]).toMatchObject({ certificateId: done.certificateId });
    await expectFleetError(act(alice, { type: "lesson.complete", courseId: ids.course, lessonId: "nope", completed: true }), 404);
  });

  it("edits and archives plans; archived plans stop new grants and existing access follows the admin's choice", async () => {
    await expectFleetError(act(alice, { type: "plan.update", planId: ids.plan, name: "Mine" }), 403);
    await expect(act(owner, { type: "plan.update", planId: ids.plan, name: "VIP Club", priceLabel: "$25 / month", spaceIds: [ids.vip] })).resolves.toEqual({ id: ids.plan, changed: true });
    await expect(act(owner, { type: "plan.update", planId: ids.plan, name: "VIP Club", priceLabel: "$25 / month", spaceIds: [ids.vip] })).resolves.toEqual({ id: ids.plan, changed: false });
    const updated = (await col("auditEvents").where("action", "==", "plan.updated").get()).docs[0]?.get("details");
    expect(updated).toEqual({ changes: { name: { from: "VIP", to: "VIP Club" }, priceLabel: { from: "$20 / month", to: "$25 / month" } } });
    await expectFleetError(act(owner, { type: "plan.update", planId: "missing", name: "x" }), 404);

    // "keep": holders keep access, nobody new can be granted.
    ids.founding = (await act(owner, { type: "plan.create", name: "Founding", spaceIds: [ids.vip] }) as { id: string }).id;
    await act(owner, { type: "entitlement.grant", planId: ids.founding, uid: bob.uid });
    await expect(act(owner, { type: "plan.archive", planId: ids.founding })).rejects.toThrow("Choose what happens");
    await expect(act(owner, { type: "plan.archive", planId: ids.founding, existingAccess: "keep", reason: "Closed cohort" })).resolves.toEqual({ id: ids.founding, revoked: 0, kept: 1 });
    await expectFleetError(act(owner, { type: "plan.archive", planId: ids.founding, existingAccess: "keep" }), 409);
    await expectFleetError(act(owner, { type: "entitlement.grant", planId: ids.founding, uid: mod.uid }), 409);
    await expect(data.getPostThread(tenantId, ids.vipPost, bob)).resolves.toMatchObject({ post: { id: ids.vipPost } });
    expect((await data.getWorkspace(tenantId, bob)).plans.map((plan) => plan.name)).toContain("Founding");
    expect((await data.getWorkspace(tenantId, mod)).plans.map((plan) => plan.name)).not.toContain("Founding");

    // "revoke": every holder loses access through ordinary, replayable entitlement events.
    await expect(act(owner, { type: "plan.archive", planId: ids.plan, existingAccess: "revoke", reason: "Sunset" })).resolves.toEqual({ id: ids.plan, revoked: 1, kept: 0 });
    await expectFleetError(data.getPostThread(tenantId, ids.vipPost, alice), 404);
    const events = (await col("entitlementEvents").get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }) as never as EntitlementEvent);
    expect(events.filter((event) => event.source === "plan_archived").map((event) => event.uid)).toEqual([alice.uid]);
    expect([...model.replayEntitlements(events)]).toEqual([model.entitlementDocId(ids.founding, bob.uid)]);
    const archived = (await col("auditEvents").where("action", "==", "plan.archived").get()).docs.map((doc) => doc.get("details"));
    expect(archived).toEqual(expect.arrayContaining([
      { existingAccess: "keep", revokedCount: 0, keptCount: 1, reason: "Closed cohort" },
      { existingAccess: "revoke", revokedCount: 1, keptCount: 0, reason: "Sunset" },
    ]));
    // Unarchiving allows new grants again but never restores revoked access by itself.
    await act(owner, { type: "plan.unarchive", planId: ids.plan });
    await expectFleetError(data.getPostThread(tenantId, ids.vipPost, alice), 404);
    await act(owner, { type: "entitlement.grant", planId: ids.plan, uid: alice.uid, reason: "Came back" });
    await act(owner, { type: "entitlement.revoke", planId: ids.founding, uid: bob.uid, reason: "Cohort ended" });
    await expectFleetError(data.getPostThread(tenantId, ids.vipPost, bob), 404);
  });

  it("paginates the feed, a space and a thread with stable cursors and no caps", async () => {
    for (let index = 0; index < 41; index += 1) {
      await act(mod, { type: "post.create", spaceId: ids.general, title: `Bulk ${index}`, body: "Page filler" });
    }
    await act(owner, { type: "post.create", spaceId: ids.vip, title: "VIP two", body: "Still private" });
    // Five posts sharing one timestamp: ties must break deterministically, never duplicate or skip.
    const tieAt = new Date(Date.now() - 3_600_000).toISOString();
    for (let index = 0; index < 5; index += 1) {
      await col("posts").doc(`tie-${index}`).set({
        spaceId: ids.general, authorUid: mod.uid, authorName: "Max Mod", title: `Tie ${index}`, body: "same time", event: null, pinned: false,
        commentsClosed: false, removed: false, removedReason: null, mentions: [], reactionCounts: {}, commentCount: 0, createdAt: tieAt,
      });
    }
    const all = (await col("posts").get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }) as never as Post);
    const visibleToBob = all.filter((post) => post.spaceId !== ids.vip && !post.removed).sort(model.compareNewestFirst).map((post) => post.id);
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await data.getFeedPage(tenantId, bob, { cursor, limit: 20 });
      expect(page.posts.length).toBeLessThanOrEqual(20);
      seen.push(...page.posts.map((post) => post.id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(seen).toEqual(visibleToBob);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.filter((id) => id.startsWith("tie-"))).toEqual(["tie-4", "tie-3", "tie-2", "tie-1", "tie-0"]);

    // A space view leads with pinned posts once, then pages the rest.
    const spacePage = await data.getFeedPage(tenantId, bob, { spaceId: ids.general, limit: 10 });
    expect(spacePage.pinned.map((post) => post.id)).toEqual([ids.alicePost]);
    expect(spacePage.posts.map((post) => post.id)).not.toContain(ids.alicePost);
    const second = await data.getFeedPage(tenantId, bob, { spaceId: ids.general, limit: 10, cursor: spacePage.nextCursor ?? undefined });
    expect(second.pinned).toEqual([]);
    expect(second.posts.some((post) => spacePage.posts.some((first) => first.id === post.id))).toBe(false);
    await expectFleetError(data.getFeedPage(tenantId, bob, { spaceId: ids.vip }), 404);
    await expectFleetError(data.getFeedPage(tenantId, bob, { cursor: "does-not-exist" }), 400);
    expect((await data.getFeedPage(tenantId, bob, { q: "founder breakfast" })).posts.map((post) => post.id)).toEqual([ids.event]);
    expect((await data.getFeedPage(tenantId, bob, { q: "VIP" })).posts).toEqual([]);
    expect((await data.getFeedPage(tenantId, bob, { filter: "saved" })).posts.map((post) => post.id)).toEqual([ids.alicePost]);
    expect((await data.getWorkspace(tenantId, bob)).feed.posts).toHaveLength(model.FEED_PAGE_SIZE);

    // Threads page oldest-first by thread key; comments written before keys existed are back-filled once.
    ids.threadPost = (await act(mod, { type: "post.create", spaceId: ids.general, title: "Long thread", body: "Reply below" }) as { id: string }).id;
    for (let index = 0; index < 7; index += 1) await act(mod, { type: "comment.create", postId: ids.threadPost, body: `Reply ${index}` });
    const bodies: string[] = [];
    let threadCursor: string | undefined;
    do {
      const page = await data.getPostThread(tenantId, ids.threadPost, bob, { cursor: threadCursor, limit: 3 });
      bodies.push(...page.comments.map((comment) => comment.body));
      threadCursor = page.nextCursor ?? undefined;
    } while (threadCursor);
    expect(bodies).toEqual(Array.from({ length: 7 }, (_, index) => `Reply ${index}`));
    await expectFleetError(data.getPostThread(tenantId, ids.threadPost, bob, { cursor: `${ids.alicePost}__x` }), 400);

    const legacyId = "legacy-post";
    await col("posts").doc(legacyId).set({ ...all.find((post) => post.id === "tie-0"), id: undefined, title: "Legacy", createdAt: tieAt });
    for (const [id, at] of [["old-b", "2026-01-02T00:00:00.000Z"], ["old-a", "2026-01-01T00:00:00.000Z"]]) {
      await col("comments").doc(id).set({ postId: legacyId, spaceId: ids.general, authorUid: mod.uid, authorName: "Max Mod", body: id, mentions: [], removed: false, createdAt: at });
    }
    expect((await data.getPostThread(tenantId, legacyId, bob)).comments.map((comment) => comment.id)).toEqual(["old-a", "old-b"]);
    expect((await col("comments").doc("old-a").get()).get("threadKey")).toBe(model.threadKey(legacyId, "2026-01-01T00:00:00.000Z", "old-a"));
    expect((await col("posts").doc(legacyId).get()).get("threadKeyed")).toBe(true);
  });

  it("lets members mute and block others, and enforces a per-member posting limit", async () => {
    await expectFleetError(act(bob, { type: "safety.set", targetUid: bob.uid, kind: "mute" }), 400);
    await expectFleetError(act(bob, { type: "safety.set", targetUid: "nobody", kind: "mute" }), 404);
    await act(bob, { type: "safety.set", targetUid: mod.uid, kind: "mute" });
    const bobFeed = await data.getFeedPage(tenantId, bob, { limit: 100 });
    expect(bobFeed.posts.some((post) => post.authorUid === mod.uid)).toBe(false);
    const muted = await data.getPostThread(tenantId, ids.alicePost, bob);
    expect(muted.comments.some((comment) => comment.authorUid === mod.uid)).toBe(false);
    expect(muted.hiddenCount).toBeGreaterThan(0);
    expect((await data.getPostThread(tenantId, ids.threadPost, bob)).post.authorHidden).toBe("mute");
    expect((await data.getWorkspace(tenantId, bob)).safety.hidden).toEqual([{ uid: mod.uid, kind: "mute" }]);
    // Muting is private: the muted member's view is unchanged.
    expect((await data.getWorkspace(tenantId, mod)).safety.hidden).toEqual([]);

    await act(alice, { type: "safety.set", targetUid: bob.uid, kind: "block" });
    await expectFleetError(act(bob, { type: "comment.create", postId: ids.alicePost, body: "hey" }), 403);
    const blockedMention = (await act(bob, { type: "post.create", spaceId: ids.general, title: "Ping", body: "@alice-m @max hello" }) as { id: string }).id;
    expect((await col("posts").doc(blockedMention).get()).get("mentions")).toEqual([mod.uid]);
    expect((await data.getFeedPage(tenantId, alice, { limit: 100 })).posts.some((post) => post.authorUid === bob.uid)).toBe(false);
    // Blocking a moderator never stops moderation replies.
    await act(alice, { type: "safety.set", targetUid: mod.uid, kind: "block" });
    await act(mod, { type: "comment.create", postId: ids.alicePost, body: "Moderator note" });
    await act(alice, { type: "safety.set", targetUid: mod.uid, kind: null });
    await act(alice, { type: "safety.set", targetUid: bob.uid, kind: null });
    await act(bob, { type: "comment.create", postId: ids.alicePost, body: "Thanks for unblocking" });
    await act(bob, { type: "safety.set", targetUid: mod.uid, kind: null });
    expect((await data.getWorkspace(tenantId, bob)).safety.hidden).toEqual([]);

    // Posting limit: per member, server-side, in the same transaction as the write.
    const erin: User = { uid: "cm-erin", email: "erin@example.com", name: "Erin New" };
    await data.joinWithInvite(tenantId, inviteCode, erin);
    await expectFleetError(act(alice, { type: "settings.posting_limit", max: 3 }), 403);
    await act(owner, { type: "settings.posting_limit", max: 3 });
    expect((await data.getWorkspace(tenantId, erin)).safety.postingLimit).toEqual({ max: 3, windowMinutes: 10 });
    await act(erin, { type: "post.create", spaceId: ids.general, title: "One", body: "1" });
    await act(erin, { type: "comment.create", postId: ids.alicePost, body: "Two" });
    await act(erin, { type: "post.create", spaceId: ids.general, title: "Three", body: "3" });
    const limited = await act(erin, { type: "post.create", spaceId: ids.general, title: "Four", body: "4" }).then(() => null, (cause: unknown) => cause);
    expect(limited).toBeInstanceOf(FleetError);
    expect((limited as InstanceType<typeof FleetError>).status).toBe(429);
    expect((limited as Error).message).toMatch(/3 posts and replies per 10 minutes/);
    await expectFleetError(act(erin, { type: "comment.create", postId: ids.alicePost, body: "Five" }), 429);
    expect((await col("posts").where("authorUid", "==", erin.uid).get()).size).toBe(2);
    expect((await col("auditEvents").where("action", "==", "safety.rate_limited").get()).size).toBe(1);
    // Moderators are exempt.
    for (let index = 0; index < 4; index += 1) await act(mod, { type: "comment.create", postId: ids.threadPost, body: `Mod ${index}` });
    await act(owner, { type: "settings.posting_limit", max: 10 });
  });

  it("previews and imports a Circle export: members become pending invites, posts keep their spaces and dates", async () => {
    const membersCsv = [
      "Name,Email,Headline,Bio,Joined At,Member Tags",
      `Zara Quinn,ZARA@example.com,Designer,"Loves ""type"", grids",2024-03-01,"design, og"`,
      `Alice Again,${alice.email},,,2024-01-01,`,
      "Yuri Petrov,yuri@example.com,,,2024-02-01,",
      "Nameless,,,,,",
      "Bad Email,not-an-email,,,,",
      "Zara Dup,zara@example.com,,,,",
    ].join("\r\n");
    const postsCsv = [
      "Title,Body,Space,Author Email,Author Name,Created At",
      `Intro thread,"Hello from Circle\nsecond line",General,zara@example.com,Zara Quinn,2024-03-02T10:00:00Z`,
      `Big win,Shipped v1,Wins,${alice.email},Alice,2024-03-03T10:00:00Z`,
      "Mystery,Who wrote this,Wins,,,2024-03-04T10:00:00Z",
      ",,General,,,",
      "Undated,No date here,Wins,yuri@example.com,Yuri,",
    ].join("\n");
    await expectFleetError(data.runCircleImport(tenantId, mod, { membersCsv, postsCsv, commit: false }), 403);
    await expectFleetError(data.runCircleImport(tenantId, owner, { membersCsv: "", postsCsv: " ", commit: false }), 400);

    const preview = await data.runCircleImport(tenantId, owner, { membersCsv, postsCsv, commit: false });
    expect(preview.committed).toBe(false);
    expect(preview.report.members).toMatchObject({ total: 6, toInvite: 2, alreadyMembers: 1, alreadyInvited: 0 });
    expect(preview.report.members.skipped.map((entry) => entry.reason)).toEqual(["No email address", "Email address is not valid", "Duplicate email in this file"]);
    expect(preview.report.posts).toMatchObject({ total: 5, toImport: 4, alreadyImported: 0 });
    expect(preview.report.spaces).toEqual({ matched: [{ name: "General", spaceId: ids.general }], toCreate: ["Wins"] });
    expect(preview.report.authors).toEqual({ members: 1, invitees: 2, unknown: 1 });
    expect((await col("pendingInvites").get()).size).toBe(0);

    const committed = await data.runCircleImport(tenantId, owner, { membersCsv, postsCsv, commit: true });
    expect(committed.committed).toBe(true);
    const invites = (await col("pendingInvites").get()).docs.map((doc) => doc.data());
    expect(invites.map((invite) => invite.email).sort()).toEqual(["yuri@example.com", "zara@example.com"]);
    expect(invites.find((invite) => invite.email === "zara@example.com")).toMatchObject({ status: "pending", headline: "Designer", bio: 'Loves "type", grids', tags: ["design", "og"] });
    const wins = (await col("spaces").where("name", "==", "Wins").get()).docs[0];
    expect(wins.get("visibility")).toBe("private");
    const imported = (await col("posts").where("importedFrom", "==", "circle").get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }) as never as Post);
    expect(imported).toHaveLength(4);
    expect(imported.find((post) => post.title === "Intro thread")).toMatchObject({ spaceId: ids.general, createdAt: "2024-03-02T10:00:00.000Z", authorName: "Zara Quinn", body: "Hello from Circle\nsecond line" });
    expect(imported.find((post) => post.title === "Big win")?.authorUid).toBe(alice.uid);
    expect(JSON.stringify(imported)).not.toContain("zara@example.com");
    // Imported private-space posts stay hidden from members until an admin opens the space; pending emails stay with admins.
    const bobView = await data.getWorkspace(tenantId, bob);
    expect(bobView.migration).toBeNull();
    expect(JSON.stringify(bobView)).not.toContain("yuri@example.com");
    expect((await data.getFeedPage(tenantId, bob, { limit: 100 })).posts.map((post) => post.title)).not.toContain("Big win");
    expect((await data.getWorkspace(tenantId, owner)).migration?.pendingInvites).toHaveLength(2);

    // Idempotent: the same files again import nothing.
    const again = await data.runCircleImport(tenantId, owner, { membersCsv, postsCsv, commit: false });
    expect(again.report.members).toMatchObject({ toInvite: 0, alreadyInvited: 2 });
    expect(again.report.posts).toMatchObject({ toImport: 0, alreadyImported: 4 });
    await expectFleetError(data.runCircleImport(tenantId, owner, { membersCsv, postsCsv, commit: true }), 409);

    // Zara joins with the invite link: her invite is accepted, her profile seeded, her imported posts become hers.
    const zara: User = { uid: "cm-zara", email: "zara@example.com", name: "" };
    await data.joinWithInvite(tenantId, inviteCode, zara);
    expect((await col("pendingInvites").where("email", "==", "zara@example.com").get()).docs[0].get("status")).toBe("accepted");
    expect((await col("profiles").doc(zara.uid).get()).data()).toMatchObject({ displayName: "Zara Quinn", headline: "Designer" });
    expect((await col("posts").where("authorUid", "==", zara.uid).get()).docs.map((doc) => doc.get("title"))).toEqual(["Intro thread"]);
    expect(await auditActions()).toEqual(expect.arrayContaining(["import.circle.committed", "invite.accepted"]));
  });

  it("groups members into cohorts that open private spaces and pace course lessons from the cohort start", async () => {
    const startDay = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    await expectFleetError(act(bob, { type: "cohort.create", name: "Mine", startsAt: startDay }), 403);
    await expect(act(owner, { type: "cohort.create", name: "Bad", startsAt: "soon" })).rejects.toThrow("Pick a start date.");
    ids.cohort = (await act(owner, { type: "cohort.create", name: "Spring", startsAt: startDay }) as { id: string }).id;
    expect((await col("cohorts").doc(ids.cohort).get()).get("startsAt")).toBe(`${startDay}T00:00:00.000Z`);
    await expectFleetError(act(owner, { type: "cohort.members", cohortId: ids.cohort, memberUids: [bob.uid, dave.uid] }), 400);
    await act(owner, { type: "cohort.members", cohortId: ids.cohort, memberUids: [bob.uid, mod.uid] });

    await expectFleetError(act(owner, { type: "space.create", space: { name: "Ghost", kind: "discussion", visibility: "private", cohortIds: ["missing"] } }), 400);
    ids.lounge = (await act(owner, { type: "space.create", space: { name: "Cohort Lounge", kind: "discussion", visibility: "private", cohortIds: [ids.cohort] } }) as { id: string }).id;
    const bobView = await data.getWorkspace(tenantId, bob);
    expect(bobView.spaces.map((space) => space.name)).toContain("Cohort Lounge");
    expect(bobView.cohorts).toEqual([expect.objectContaining({ id: ids.cohort, name: "Spring", memberUids: [bob.uid] })]);
    expect((await data.getWorkspace(tenantId, alice)).spaces.map((space) => space.name)).not.toContain("Cohort Lounge");
    expect((await data.getWorkspace(tenantId, alice)).cohorts).toEqual([]);
    await expectFleetError(data.getFeedPage(tenantId, alice, { spaceId: ids.lounge }), 404);

    // Drip: lessons unlock N days after the member's cohort start; locked lessons arrive without content.
    ids.bootcamp = (await act(owner, { type: "course.create", spaceId: ids.lounge, title: "Bootcamp" }) as { id: string }).id;
    ids.day0 = (await act(owner, { type: "lesson.add", courseId: ids.bootcamp, title: "Welcome", body: "Start here" }) as { id: string }).id;
    ids.day3 = (await act(owner, { type: "lesson.add", courseId: ids.bootcamp, title: "Week one", body: "Do the thing", unlockDay: 3 }) as { id: string }).id;
    ids.day10 = (await act(owner, { type: "lesson.add", courseId: ids.bootcamp, title: "Demo day", body: "Secret finale", unlockDay: 10 }) as { id: string }).id;
    await expectFleetError(act(bob, { type: "course.drip", courseId: ids.bootcamp, dripByCohort: true }), 403);
    await act(owner, { type: "course.drip", courseId: ids.bootcamp, dripByCohort: true });
    const lessons = (await data.getWorkspace(tenantId, bob)).courses.find((course) => course.id === ids.bootcamp)!.lessons;
    expect(lessons.map((lesson) => lesson.access.unlocked)).toEqual([true, true, false]);
    expect(lessons[2]).toMatchObject({ body: "", access: { reason: "scheduled", unlocksAt: new Date(Date.parse(`${startDay}T00:00:00.000Z`) + 10 * 86_400_000).toISOString() } });
    expect(JSON.stringify(await data.getWorkspace(tenantId, bob))).not.toContain("Secret finale");
    expect((await data.getWorkspace(tenantId, owner)).courses.find((course) => course.id === ids.bootcamp)!.lessons[2].body).toBe("Secret finale");
    await act(bob, { type: "lesson.complete", courseId: ids.bootcamp, lessonId: ids.day3, completed: true });
    await expect(act(bob, { type: "lesson.complete", courseId: ids.bootcamp, lessonId: ids.day10, completed: true })).rejects.toThrow(/unlocks on/);

    await act(owner, { type: "lesson.schedule", courseId: ids.bootcamp, lessonId: ids.day10, unlockDay: 4 });
    await act(bob, { type: "lesson.complete", courseId: ids.bootcamp, lessonId: ids.day10, completed: true });
    // Moving the cohort start into the future re-paces everyone in it.
    await act(owner, { type: "cohort.update", cohortId: ids.cohort, name: "Spring", startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10) });
    expect((await data.getWorkspace(tenantId, bob)).courses.find((course) => course.id === ids.bootcamp)!.lessons.map((lesson) => lesson.access.unlocked)).toEqual([true, false, false]);

    // A member in no cohort sees only day-0 lessons of a dripped course.
    ids.openCourse = (await act(owner, { type: "course.create", spaceId: ids.general, title: "Open course" }) as { id: string }).id;
    await act(owner, { type: "lesson.add", courseId: ids.openCourse, title: "Intro", body: "Hi" });
    const later = (await act(owner, { type: "lesson.add", courseId: ids.openCourse, title: "Later", body: "Hidden", unlockDay: 2 }) as { id: string }).id;
    await act(owner, { type: "course.drip", courseId: ids.openCourse, dripByCohort: true });
    const aliceLessons = (await data.getWorkspace(tenantId, alice)).courses.find((course) => course.id === ids.openCourse)!.lessons;
    expect(aliceLessons.map((lesson) => lesson.access.reason)).toEqual(["open", "no_cohort"]);
    await expect(act(alice, { type: "lesson.complete", courseId: ids.openCourse, lessonId: later, completed: true })).rejects.toThrow(/join a cohort/);
    expect(await auditActions()).toEqual(expect.arrayContaining(["cohort.created", "cohort.updated", "cohort.members_changed", "course.drip_changed", "lesson.scheduled"]));
  });

  it("denies other roles, outsiders and other tenants", async () => {
    await expectFleetError(act(alice, { type: "space.create", space: { name: "Mine", kind: "discussion", visibility: "members" } }), 403);
    await expectFleetError(act(mod, { type: "member.role", uid: alice.uid, role: "moderator" }), 403);
    await expectFleetError(act(alice, { type: "invite.rotate" }), 403);
    await expectFleetError(data.getWorkspace(tenantId, outsider), 404);
    await expectFleetError(data.getPostThread(tenantId, ids.alicePost, outsider), 404);
    await expectFleetError(data.getWorkspace(tenantId, rival), 404);
    await expectFleetError(data.runAction(tenantId, rival, { type: "post.create", spaceId: ids.general, title: "x", body: "y", event: null }), 404);
    // The rival's own community is empty of Indie Makers content, and reading our post through it fails.
    const rivalView = await data.getWorkspace(rivalTenantId, rival);
    expect(rivalView.feed.posts).toEqual([]);
    expect(rivalView.members.map((member) => member.uid)).toEqual([rival.uid]);
    await expectFleetError(data.getPostThread(rivalTenantId, ids.alicePost, rival), 404);
    await expectFleetError(data.getAuditLog(tenantId, alice), 403);
    await expectFleetError(data.buildCommunityExport(tenantId, mod), 403);
    await expectFleetError(data.buildCommunityExport(tenantId, alice), 403);
    await expectFleetError(data.buildCommunityExport(tenantId, rival), 404);
  });

  it("appends an audit event for every mutation", async () => {
    await act(alice, { type: "profile.update", displayName: "Alice M.", headline: "Indie hacker", bio: "Builds things" });
    await act(alice, { type: "notifications.read" });
    const actions = new Set(await auditActions());
    for (const expected of [
      "tenant.created", "invite.created", "space.created", "space.reordered", "membership.joined_via_invite", "membership.role_changed",
      "invite.disabled", "invite.enabled", "invite.rotated", "membership.removed", "post.created", "event.created", "comment.created",
      "reaction.added", "reaction.removed", "bookmark.added", "moderation.post.pin", "moderation.post.close", "moderation.post.reopen",
      "moderation.post.remove", "moderation.post.restore", "moderation.comment.remove", "report.filed", "report.resolved",
      "appeal.filed", "appeal.upheld", "appeal.reinstated", "rsvp.set", "attendance.checked_in", "plan.created",
      "entitlement.granted", "entitlement.revoked", "course.created", "lesson.added", "lesson.completed",
      "course.certificate_issued", "profile.updated", "notifications.read", "profile.handle_chosen", "profile.handle_changed", "safety.muted", "safety.blocked", "safety.unblocked", "safety.unmuted", "safety.rate_limited", "settings.posting_limit_changed", "plan.updated", "plan.archived", "plan.unarchived",
    ]) {
      expect(actions, expected).toContain(expected);
    }
    const audit = await data.getAuditLog(tenantId, mod);
    expect(audit.length).toBeGreaterThan(0);
    // Moderators are not admins: they never see another member's email in the audit log.
    expect(JSON.stringify(audit)).not.toContain("alice.secret@example.com");
    expect(JSON.stringify(await data.getAuditLog(tenantId, owner))).toContain("@example.com");
  });

  it("exports every record, with the invite secret redacted", async () => {
    const exported = await data.buildCommunityExport(tenantId, owner);
    expect(exported.manifest).toMatchObject({ schema: "net.saasassin.workspace-export", product: "community", tenantId });
    for (const [name] of model.EXPORT_FILES) {
      const stored = (await col(name).get()).size;
      const file = exported.manifest.files.find((entry) => entry.path === `${name}.json`);
      // The export itself appends one audit event after reading.
      expect(file?.records, name).toBe(name === "auditEvents" ? stored - 1 : stored);
      expect((exported.data[name] as unknown[]).length).toBe(file?.records);
    }
    expect(exported.manifest.files.find((file) => file.path === "posts.json")?.records).toBeGreaterThan(50);
    const settings = exported.data.settings as Array<Record<string, unknown>>;
    expect(settings[0]).toMatchObject({ inviteCodeRedacted: true });
    expect(JSON.stringify(exported)).not.toContain(inviteCode);
    expect((await auditActions())).toContain("export.downloaded");
  });
});
