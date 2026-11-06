import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { EntitlementEvent } from "@/lib/community/model";

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

const act = (user: User, action: unknown) => data.runAction(tenantId, user, model.actionSchema.parse(action));
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
    expect(aliceView.posts.map((post) => post.id)).not.toContain(ids.vipPost);
    expect(aliceView.posts.map((post) => post.id)).toEqual(expect.arrayContaining([ids.alicePost, ids.bobPost, ids.newsPost, ids.event]));
    await expectFleetError(data.getPostThread(tenantId, ids.vipPost, alice), 404);
    await expectFleetError(act(alice, { type: "comment.create", postId: ids.vipPost, body: "let me in" }), 404);
    await expectFleetError(act(alice, { type: "reaction.toggle", postId: ids.vipPost, reaction: "like" }), 404);
    const ownerView = await data.getWorkspace(tenantId, owner);
    expect(ownerView.posts.map((post) => post.id)).toContain(ids.vipPost);
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
    expect(bobView.posts.map((post) => post.id)).not.toContain(ids.bobPost);
    // Moderators still see it in the feed, marked removed.
    expect((await data.getWorkspace(tenantId, mod)).posts.find((post) => post.id === ids.bobPost)).toMatchObject({ removed: true, body: "Spam spam" });
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
    expect(aliceView.posts.map((post) => post.id)).toContain(ids.vipPost);
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
    expect(rivalView.posts).toEqual([]);
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
      "course.certificate_issued", "profile.updated", "notifications.read", "profile.handle_chosen", "profile.handle_changed",
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
    expect(exported.manifest.files.find((file) => file.path === "posts.json")?.records).toBe(7);
    const settings = exported.data.settings as Array<Record<string, unknown>>;
    expect(settings[0]).toMatchObject({ inviteCodeRedacted: true });
    expect(JSON.stringify(exported)).not.toContain(inviteCode);
    expect((await auditActions())).toContain("export.downloaded");
  });
});
