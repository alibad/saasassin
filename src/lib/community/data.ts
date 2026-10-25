import "server-only";

import { randomBytes } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import { FleetError, type FleetUser } from "@/lib/fleet/platform/session";
import {
  appendAuditEvent,
  auditPayload,
  db,
  listTenantMembers,
  requireTenantMember,
  tenantCollection,
  tenantRef,
} from "@/lib/fleet/platform/tenants";

import {
  COMMUNITY_SLUG,
  appealQueue,
  assembleFeed,
  bookmarkDocId,
  applyLessonCompletion,
  canAppeal,
  progressDocId,
  buildEventIcs,
  canPostInSpace,
  canRemoveMember,
  canSeeSpace,
  entitlementDocId,
  spaceGrantsFor,
  computeNotifications,
  extractMentions,
  generateInviteCode,
  INVITE_ERRORS,
  isManager,
  isModerator,
  moderationQueue,
  moveSpace,
  reactionDocId,
  reportDocId,
  redactPost,
  rsvpDocId,
  summarizeAttendance,
  summarizeRsvps,
  toggleReaction,
  validateInviteCode,
  visibleSpaces,
  type Appeal,
  type Comment,
  type Course,
  type CourseProgress,
  type Lesson,
  type CommunityAction,
  type CommunityRole,
  type Member,
  type Post,
  type Profile,
  type Report,
  type RsvpStatus,
  type EntitlementEvent,
  type Plan,
  type Space,
  type Viewer,
} from "./model";

const slug = COMMUNITY_SLUG;
const col = (tenantId: string, name: string) => tenantCollection(slug, tenantId, name);
const settingsDoc = (tenantId: string) => col(tenantId, "settings").doc("community");
const nowIso = () => new Date().toISOString();


export type CommunitySettings = { inviteCode: string | null; inviteEnabled: boolean; description: string };

async function readSettings(tenantId: string): Promise<CommunitySettings> {
  const snap = await settingsDoc(tenantId).get();
  return {
    inviteCode: (snap.get("inviteCode") as string | undefined) ?? null,
    inviteEnabled: snap.exists ? snap.get("inviteEnabled") !== false : true,
    description: String(snap.get("description") ?? ""),
  };
}

async function readSpaces(tenantId: string) {
  const snap = await col(tenantId, "spaces").get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Space);
}

async function readPosts(tenantId: string, limit = 300) {
  const snap = await col(tenantId, "posts").orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Post);
}

async function readPost(tenantId: string, postId: string) {
  const snap = await col(tenantId, "posts").doc(postId).get();
  if (!snap.exists) throw new FleetError("Post not found.", 404);
  return { id: snap.id, ...snap.data() } as Post;
}

async function readSpace(tenantId: string, spaceId: string) {
  const snap = await col(tenantId, "spaces").doc(spaceId).get();
  if (!snap.exists) throw new FleetError("Space not found.", 404);
  return { id: snap.id, ...snap.data() } as Space;
}

async function readProfiles(tenantId: string) {
  const snap = await col(tenantId, "profiles").get();
  return new Map(snap.docs.map((doc) => [doc.id, { uid: doc.id, ...doc.data() } as Profile]));
}

async function activeMembers(tenantId: string): Promise<Member[]> {
  return (await listTenantMembers(slug, tenantId)).filter((member) => member.status === "active");
}

async function readPlans(tenantId: string) {
  const snap = await col(tenantId, "plans").get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Plan);
}

async function activePlanIdsFor(tenantId: string, uid: string) {
  const snap = await col(tenantId, "entitlements").where("uid", "==", uid).get();
  return snap.docs.filter((doc) => doc.get("status") === "active").map((doc) => String(doc.get("planId")));
}

/** Resolves the viewer server-side, including private spaces unlocked by their active plan entitlements. */
async function loadViewer(tenantId: string, uid: string, role: CommunityRole): Promise<Viewer> {
  if (isManager(role)) return { uid, role };
  const [plans, planIds] = await Promise.all([readPlans(tenantId), activePlanIdsFor(tenantId, uid)]);
  const active = new Set(planIds.map((planId) => entitlementDocId(planId, uid)));
  return { uid, role, spaceGrants: spaceGrantsFor(uid, plans, active) };
}

/** The post must sit in a space the viewer can see; otherwise it does not exist for them. */
async function requireVisiblePost(tenantId: string, postId: string, viewer: Viewer) {
  const post = await readPost(tenantId, postId);
  const space = await readSpace(tenantId, post.spaceId);
  if (!canSeeSpace(space, viewer)) throw new FleetError("Post not found.", 404);
  if (post.removed && !isModerator(viewer.role)) throw new FleetError("This post was removed by a moderator.", 410);
  return { post, space };
}

/* ------------------------------------------------------------------ reads */

export async function getWorkspace(tenantId: string, user: FleetUser) {
  const { tenant, role } = await requireTenantMember(slug, tenantId, user);
  const viewer = await loadViewer(tenantId, user.uid, role);
  let settings = await readSettings(tenantId);
  if (isManager(role) && !settings.inviteCode) {
    const inviteCode = generateInviteCode((size) => randomBytes(size));
    await settingsDoc(tenantId).set({ inviteCode, inviteEnabled: true, updatedAt: nowIso() }, { merge: true });
    await appendAuditEvent(slug, tenantId, user, "invite.created", { type: "invite", id: "community" });
    settings = { ...settings, inviteCode, inviteEnabled: true };
  }
  const [spaces, posts, profiles, members, comments, rsvpSnap] = await Promise.all([
    readSpaces(tenantId),
    readPosts(tenantId),
    readProfiles(tenantId),
    activeMembers(tenantId),
    col(tenantId, "comments").orderBy("createdAt", "desc").limit(500).get(),
    col(tenantId, "rsvps").where("uid", "==", user.uid).get(),
  ]);
  const mySpaces = visibleSpaces(spaces, viewer);
  const feed = assembleFeed(posts, spaces, viewer, { includeRemoved: true, limit: 300 }).map((post) => redactPost(post, role));
  const visiblePostIds = new Set(feed.filter((post) => !post.removed).map((post) => post.id));
  const visibleComments = comments.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as Comment)
    .filter((comment) => visiblePostIds.has(comment.postId));
  const profile = profiles.get(user.uid);
  const [myReactionSnap, myBookmarkSnap] = await Promise.all([
    col(tenantId, "reactions").where("uid", "==", user.uid).get(),
    col(tenantId, "bookmarks").where("uid", "==", user.uid).get(),
  ]);
  const [reports, openAppeals, myAppealSnap] = await Promise.all([
    isModerator(role)
      ? col(tenantId, "reports").where("status", "==", "open").get().then((snap) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Report))
      : Promise.resolve([] as Report[]),
    isModerator(role)
      ? col(tenantId, "appeals").where("status", "==", "open").get().then((snap) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Appeal))
      : Promise.resolve([] as Appeal[]),
    col(tenantId, "appeals").where("authorUid", "==", user.uid).get(),
  ]);
  const [courseSnap, myProgressSnap] = await Promise.all([
    col(tenantId, "courses").get(),
    col(tenantId, "courseProgress").where("uid", "==", user.uid).get(),
  ]);
  const visibleCourseSpaceIds = new Set(mySpaces.map((space) => space.id));
  const courses = courseSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as Course)
    .filter((course) => visibleCourseSpaceIds.has(course.spaceId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const myProgress = Object.fromEntries(
    myProgressSnap.docs.map((doc) => [
      String(doc.get("courseId")),
      {
        completedLessonIds: (doc.get("completedLessonIds") ?? []) as string[],
        completedAt: (doc.get("completedAt") ?? null) as string | null,
        certificateId: (doc.get("certificateId") ?? null) as string | null,
      },
    ]),
  );
  const [plans, myPlanIds, entitlementSnap, historySnap] = await Promise.all([
    readPlans(tenantId),
    activePlanIdsFor(tenantId, user.uid),
    isManager(role) ? col(tenantId, "entitlements").where("status", "==", "active").get() : Promise.resolve(null),
    isManager(role) ? col(tenantId, "entitlementEvents").orderBy("at", "desc").limit(50).get() : Promise.resolve(null),
  ]);
  const mySpaceIds = new Set(mySpaces.map((space) => space.id));
  const activeEntitlements = entitlementSnap?.docs.map((doc) => ({ id: doc.id, planId: String(doc.get("planId")), uid: String(doc.get("uid")), source: String(doc.get("source") ?? "manual"), updatedAt: String(doc.get("updatedAt") ?? "") })) ?? [];
  const entitlementHistory = historySnap?.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as EntitlementEvent) ?? [];
  const myAppeals = new Map(myAppealSnap.docs.map((doc) => [String(doc.get("postId")), String(doc.get("status"))]));
  const visibleSpaceIds = new Set(mySpaces.map((space) => space.id));
  const myRemovedPosts = posts
    .filter((post) => post.removed && post.authorUid === user.uid && visibleSpaceIds.has(post.spaceId))
    .map((post) => ({ id: post.id, title: post.title, removedReason: post.removedReason, appealStatus: myAppeals.get(post.id) ?? null }));

  return {
    community: { id: tenantId, name: String(tenant.name ?? "Community"), description: settings.description },
    me: {
      uid: user.uid,
      email: user.email,
      role,
      profile: profile ?? { uid: user.uid, displayName: user.name || user.email.split("@")[0], headline: "", bio: "", notificationsReadAt: null },
    },
    invite: isManager(role) ? { code: settings.inviteCode, enabled: settings.inviteEnabled } : null,
    // Members learn only whether they themselves are on a private space's list, never who else is.
    spaces: mySpaces.map((space) => ({
      ...space,
      memberUids: isManager(role) ? space.memberUids : space.memberUids.filter((uid) => uid === user.uid),
      // Decided server-side so plan grants (which the browser never sees) count.
      canPost: canPostInSpace(space, viewer),
    })),
    reports: moderationQueue(reports, spaces, viewer),
    appeals: appealQueue(openAppeals, spaces, viewer),
    myRemovedPosts,
    plans: plans.map((plan) => ({ ...plan, spaceIds: isManager(role) ? plan.spaceIds : plan.spaceIds.filter((id) => mySpaceIds.has(id)) })),
    myPlanIds,
    courses,
    myProgress,
    access: isManager(role) ? { entitlements: activeEntitlements, history: entitlementHistory } : null,
    posts: feed,
    myReactions: myReactionSnap.docs.map((doc) => `${doc.get("postId")}:${doc.get("type")}`),
    myBookmarks: myBookmarkSnap.docs.map((doc) => String(doc.get("postId"))),
    myRsvps: Object.fromEntries(rsvpSnap.docs.map((doc) => [String(doc.get("postId")), String(doc.get("status"))])),
    members: members.map((member) => {
      const memberProfile = profiles.get(member.uid);
      return {
        uid: member.uid,
        role: member.role,
        email: isManager(role) ? member.email : "",
        handle: (member.email.split("@")[0] ?? "").toLowerCase(),
        displayName: memberProfile?.displayName || member.name || member.email.split("@")[0],
        headline: memberProfile?.headline ?? "",
        bio: memberProfile?.bio ?? "",
      };
    }),
    notifications: computeNotifications({
      uid: user.uid,
      posts: feed,
      comments: visibleComments,
      readAt: profile?.notificationsReadAt ?? null,
    }),
  };
}

export async function getPostThread(tenantId: string, postId: string, user: FleetUser) {
  const { role } = await requireTenantMember(slug, tenantId, user);
  const viewer = await loadViewer(tenantId, user.uid, role);
  const { post } = await requireVisiblePost(tenantId, postId, viewer);
  const [commentSnap, rsvpSnap] = await Promise.all([
    col(tenantId, "comments").where("postId", "==", postId).get(),
    post.event ? col(tenantId, "rsvps").where("postId", "==", postId).get() : Promise.resolve(null),
  ]);
  const comments = commentSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as Comment)
    .filter((comment) => !comment.removed || isModerator(role))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rsvps =
    rsvpSnap?.docs.map((doc) => ({
      uid: String(doc.get("uid")),
      name: String(doc.get("name") ?? ""),
      status: doc.get("status") as RsvpStatus,
      attended: doc.get("attended") === true,
    })) ?? [];
  return {
    post,
    comments,
    rsvps: {
      summary: summarizeRsvps(rsvps),
      going: rsvps.filter((rsvp) => rsvp.status === "going").map((rsvp) => rsvp.name),
      attendance: isModerator(role) ? summarizeAttendance(rsvps) : null,
      // Check-in roster for moderators: every member, with their RSVP and attendance.
      roster: isModerator(role) && post.event
        ? (await activeMembers(tenantId)).map((member) => {
            const rsvp = rsvps.find((entry) => entry.uid === member.uid);
            return { uid: member.uid, name: rsvp?.name || member.name || member.email.split("@")[0], status: rsvp?.status ?? null, attended: rsvp?.attended ?? false };
          })
        : [],
    },
  };
}

export async function getEventCalendar(tenantId: string, postId: string, user: FleetUser, appUrl: string) {
  const { role } = await requireTenantMember(slug, tenantId, user);
  const { post } = await requireVisiblePost(tenantId, postId, await loadViewer(tenantId, user.uid, role));
  if (!post.event) throw new FleetError("Only events can be added to a calendar.", 400);
  return buildEventIcs({
    id: `${tenantId}-${post.id}`,
    title: post.title,
    description: post.body,
    startsAt: post.event.startsAt,
    endsAt: post.event.endsAt,
    location: post.event.location,
    url: appUrl,
    now: new Date(),
  });
}

/* ------------------------------------------------------------------ writes */

export async function runAction(tenantId: string, user: FleetUser, action: CommunityAction) {
  const { role } = await requireTenantMember(slug, tenantId, user);
  const viewer = await loadViewer(tenantId, user.uid, role);
  const requireManager = () => {
    if (!isManager(role)) throw new FleetError("Only owners and admins can do this.", 403);
  };
  const requireModerator = () => {
    if (!isModerator(role)) throw new FleetError("Only moderators can do this.", 403);
  };

  switch (action.type) {
    case "space.create": {
      requireManager();
      const spaces = await readSpaces(tenantId);
      const ref = col(tenantId, "spaces").doc();
      await ref.set({ ...action.space, order: spaces.length, createdBy: user.uid, createdAt: nowIso() });
      await appendAuditEvent(slug, tenantId, user, "space.created", { type: "space", id: ref.id }, { name: action.space.name, kind: action.space.kind, visibility: action.space.visibility });
      return { id: ref.id };
    }
    case "space.update": {
      requireManager();
      await readSpace(tenantId, action.spaceId);
      await col(tenantId, "spaces").doc(action.spaceId).set({ ...action.space, updatedAt: nowIso() }, { merge: true });
      await appendAuditEvent(slug, tenantId, user, "space.updated", { type: "space", id: action.spaceId }, { visibility: action.space.visibility, memberCount: action.space.memberUids.length });
      return { id: action.spaceId };
    }
    case "space.move": {
      requireManager();
      const reordered = moveSpace(await readSpaces(tenantId), action.spaceId, action.direction);
      const batch = db().batch();
      for (const space of reordered) batch.update(col(tenantId, "spaces").doc(space.id), { order: space.order });
      batch.set(col(tenantId, "auditEvents").doc(), auditPayload(user, "space.reordered", { type: "space", id: action.spaceId }, { direction: action.direction }));
      await batch.commit();
      return { id: action.spaceId };
    }
    case "post.create": {
      const space = await readSpace(tenantId, action.spaceId);
      if (!canSeeSpace(space, viewer)) throw new FleetError("Space not found.", 404);
      if (!canPostInSpace(space, viewer)) throw new FleetError("Only moderators can post announcements.", 403);
      if (space.kind === "events" && !action.event) throw new FleetError("Event spaces need a start time.", 400);
      const members = await activeMembers(tenantId);
      const profile = (await col(tenantId, "profiles").doc(user.uid).get()).get("displayName") as string | undefined;
      const ref = col(tenantId, "posts").doc();
      const post: Omit<Post, "id"> = {
        spaceId: space.id,
        authorUid: user.uid,
        authorName: profile || user.name || user.email.split("@")[0],
        title: action.title,
        body: action.body,
        event: space.kind === "events" ? action.event : null,
        pinned: false,
        commentsClosed: false,
        removed: false,
        removedReason: null,
        mentions: extractMentions(`${action.title} ${action.body}`, members).filter((uid) => uid !== user.uid),
        reactionCounts: {},
        commentCount: 0,
        createdAt: nowIso(),
      };
      await ref.set(post);
      await appendAuditEvent(slug, tenantId, user, post.event ? "event.created" : "post.created", { type: "post", id: ref.id }, { spaceId: space.id });
      return { id: ref.id };
    }
    case "comment.create": {
      const { post } = await requireVisiblePost(tenantId, action.postId, viewer);
      if (post.commentsClosed && !isModerator(role)) throw new FleetError("Comments are closed on this post.", 403);
      const members = await activeMembers(tenantId);
      const profile = (await col(tenantId, "profiles").doc(user.uid).get()).get("displayName") as string | undefined;
      const ref = col(tenantId, "comments").doc();
      const comment: Omit<Comment, "id"> = {
        postId: post.id,
        spaceId: post.spaceId,
        authorUid: user.uid,
        authorName: profile || user.name || user.email.split("@")[0],
        body: action.body,
        mentions: extractMentions(action.body, members).filter((uid) => uid !== user.uid),
        removed: false,
        createdAt: nowIso(),
      };
      const batch = db().batch();
      batch.set(ref, comment);
      batch.update(col(tenantId, "posts").doc(post.id), { commentCount: FieldValue.increment(1) });
      batch.set(col(tenantId, "auditEvents").doc(), auditPayload(user, "comment.created", { type: "comment", id: ref.id }, { postId: post.id }));
      await batch.commit();
      return { id: ref.id };
    }
    case "reaction.toggle": {
      await requireVisiblePost(tenantId, action.postId, viewer);
      const reactionRef = col(tenantId, "reactions").doc(reactionDocId(action.postId, user.uid, action.reaction));
      const postRef = col(tenantId, "posts").doc(action.postId);
      const result = await db().runTransaction(async (transaction) => {
        const [existing, postSnap] = await Promise.all([transaction.get(reactionRef), transaction.get(postRef)]);
        const counts = (postSnap.get("reactionCounts") ?? {}) as Record<string, number>;
        const next = toggleReaction(existing.exists, counts[action.reaction]);
        if (next.active) transaction.set(reactionRef, { postId: action.postId, uid: user.uid, type: action.reaction, createdAt: nowIso() });
        else transaction.delete(reactionRef);
        transaction.update(postRef, { [`reactionCounts.${action.reaction}`]: next.count });
        return next;
      });
      await appendAuditEvent(slug, tenantId, user, result.active ? "reaction.added" : "reaction.removed", { type: "post", id: action.postId }, { reaction: action.reaction });
      return result;
    }
    case "rsvp.set": {
      const { post } = await requireVisiblePost(tenantId, action.postId, viewer);
      if (!post.event) throw new FleetError("Only events take RSVPs.", 400);
      const profile = (await col(tenantId, "profiles").doc(user.uid).get()).get("displayName") as string | undefined;
      await col(tenantId, "rsvps").doc(rsvpDocId(post.id, user.uid)).set({
        postId: post.id,
        uid: user.uid,
        name: profile || user.name || user.email.split("@")[0],
        status: action.status,
        updatedAt: nowIso(),
      });
      await appendAuditEvent(slug, tenantId, user, "rsvp.set", { type: "post", id: post.id }, { status: action.status });
      return { status: action.status };
    }
    case "post.moderate": {
      requireModerator();
      const post = await readPost(tenantId, action.postId);
      const space = await readSpace(tenantId, post.spaceId);
      if (!canSeeSpace(space, viewer)) throw new FleetError("Post not found.", 404);
      const patch: Partial<Post> = {
        pin: { pinned: true },
        unpin: { pinned: false },
        close: { commentsClosed: true },
        reopen: { commentsClosed: false },
        remove: { removed: true, removedReason: action.reason || "Removed by a moderator", pinned: false },
        restore: { removed: false, removedReason: null },
      }[action.operation];
      await col(tenantId, "posts").doc(post.id).update(patch);
      await appendAuditEvent(slug, tenantId, user, `moderation.post.${action.operation}`, { type: "post", id: post.id }, { reason: action.reason, title: post.title });
      return { id: post.id };
    }
    case "comment.remove": {
      requireModerator();
      const snap = await col(tenantId, "comments").doc(action.commentId).get();
      if (!snap.exists) throw new FleetError("Comment not found.", 404);
      const space = await readSpace(tenantId, String(snap.get("spaceId")));
      if (!canSeeSpace(space, viewer)) throw new FleetError("Comment not found.", 404);
      await snap.ref.update({ removed: true, removedReason: action.reason || "Removed by a moderator" });
      await appendAuditEvent(slug, tenantId, user, "moderation.comment.remove", { type: "comment", id: snap.id }, { reason: action.reason, postId: snap.get("postId") });
      return { id: snap.id };
    }
    case "profile.update": {
      await col(tenantId, "profiles").doc(user.uid).set(
        { uid: user.uid, displayName: action.displayName, headline: action.headline, bio: action.bio, updatedAt: nowIso() },
        { merge: true },
      );
      await appendAuditEvent(slug, tenantId, user, "profile.updated", { type: "profile", id: user.uid });
      return { uid: user.uid };
    }
    case "member.role": {
      requireManager();
      const membership = await tenantRef(slug, tenantId).collection("memberships").doc(action.uid).get();
      if (!membership.exists || membership.get("status") !== "active") throw new FleetError("Member not found.", 404);
      if (membership.get("role") === "owner") throw new FleetError("The owner's role cannot be changed.", 403);
      if (action.role === "admin" && role !== "owner") throw new FleetError("Only the owner can appoint admins.", 403);
      const batch = db().batch();
      batch.update(membership.ref, { role: action.role });
      batch.set(userTenantIndex(action.uid, tenantId), { role: action.role }, { merge: true });
      batch.set(col(tenantId, "auditEvents").doc(), auditPayload(user, "membership.role_changed", { type: "membership", id: action.uid }, { from: membership.get("role"), to: action.role }));
      await batch.commit();
      return { uid: action.uid, role: action.role };
    }
    case "bookmark.toggle": {
      await requireVisiblePost(tenantId, action.postId, viewer);
      const ref = col(tenantId, "bookmarks").doc(bookmarkDocId(action.postId, user.uid));
      const existing = await ref.get();
      if (existing.exists) await ref.delete();
      else await ref.set({ postId: action.postId, uid: user.uid, createdAt: nowIso() });
      await appendAuditEvent(slug, tenantId, user, existing.exists ? "bookmark.removed" : "bookmark.added", { type: "post", id: action.postId });
      return { saved: !existing.exists };
    }
    case "course.create": {
      requireManager();
      const space = await readSpace(tenantId, action.spaceId);
      const ref = col(tenantId, "courses").doc();
      const course: Omit<Course, "id"> = { spaceId: space.id, title: action.title, description: action.description, lessons: [], createdAt: nowIso() };
      await ref.set(course);
      await appendAuditEvent(slug, tenantId, user, "course.created", { type: "course", id: ref.id }, { title: action.title, spaceId: space.id });
      return { id: ref.id };
    }
    case "lesson.add": {
      requireManager();
      const courseRef = col(tenantId, "courses").doc(action.courseId);
      const lessonId = col(tenantId, "courses").doc().id;
      await db().runTransaction(async (transaction) => {
        const snap = await transaction.get(courseRef);
        if (!snap.exists) throw new FleetError("Course not found.", 404);
        const lessons = (snap.get("lessons") ?? []) as Lesson[];
        if (lessons.length >= 100) throw new FleetError("A course can hold up to 100 lessons.", 400);
        transaction.update(courseRef, { lessons: [...lessons, { id: lessonId, title: action.title, body: action.body }] });
      });
      await appendAuditEvent(slug, tenantId, user, "lesson.added", { type: "course", id: action.courseId }, { lessonId, title: action.title });
      return { id: lessonId };
    }
    case "lesson.complete": {
      const courseSnap = await col(tenantId, "courses").doc(action.courseId).get();
      if (!courseSnap.exists) throw new FleetError("Course not found.", 404);
      const course = { id: courseSnap.id, ...courseSnap.data() } as Course;
      const space = await readSpace(tenantId, course.spaceId);
      if (!canSeeSpace(space, viewer)) throw new FleetError("Course not found.", 404);
      if (!course.lessons.some((lesson) => lesson.id === action.lessonId)) throw new FleetError("Lesson not found.", 404);
      const progressRef = col(tenantId, "courseProgress").doc(progressDocId(course.id, user.uid));
      const result = await db().runTransaction(async (transaction) => {
        const current = await transaction.get(progressRef);
        const next = applyLessonCompletion(course, current.exists ? (current.data() as CourseProgress) : null, {
          uid: user.uid,
          lessonId: action.lessonId,
          completed: action.completed,
          now: nowIso(),
        });
        transaction.set(progressRef, {
          courseId: course.id,
          uid: user.uid,
          completedLessonIds: next.completedLessonIds,
          completedAt: next.completedAt,
          certificateId: next.certificateId,
          updatedAt: nowIso(),
        });
        return next;
      });
      await appendAuditEvent(slug, tenantId, user, action.completed ? "lesson.completed" : "lesson.uncompleted", { type: "course", id: course.id }, { lessonId: action.lessonId });
      if (result.newlyCertified) {
        await appendAuditEvent(slug, tenantId, user, "course.certificate_issued", { type: "course", id: course.id }, { certificateId: result.certificateId });
      }
      return { certificateId: result.certificateId };
    }
    case "plan.create": {
      requireManager();
      const spaces = await readSpaces(tenantId);
      const known = new Set(spaces.map((space) => space.id));
      if (action.spaceIds.some((id) => !known.has(id))) throw new FleetError("A selected space no longer exists.", 400);
      const ref = col(tenantId, "plans").doc();
      const plan: Omit<Plan, "id"> = { name: action.name, description: action.description, priceLabel: action.priceLabel, spaceIds: action.spaceIds, createdAt: nowIso() };
      await ref.set(plan);
      await appendAuditEvent(slug, tenantId, user, "plan.created", { type: "plan", id: ref.id }, { name: action.name, spaceIds: action.spaceIds });
      return { id: ref.id };
    }
    case "entitlement.grant":
    case "entitlement.revoke": {
      requireManager();
      const granting = action.type === "entitlement.grant";
      const [planSnap, membership] = await Promise.all([
        col(tenantId, "plans").doc(action.planId).get(),
        tenantRef(slug, tenantId).collection("memberships").doc(action.uid).get(),
      ]);
      if (!planSnap.exists) throw new FleetError("Plan not found.", 404);
      if (!membership.exists || membership.get("status") !== "active") throw new FleetError("Member not found.", 404);
      const entitlementRef = col(tenantId, "entitlements").doc(entitlementDocId(action.planId, action.uid));
      const at = nowIso();
      // Entitlement state and its immutable event are written together; the event log alone can rebuild the state.
      return db().runTransaction(async (transaction) => {
        const current = await transaction.get(entitlementRef);
        const isActive = current.exists && current.get("status") === "active";
        if (granting === isActive) return { changed: false, status: isActive ? "active" : "revoked" };
        transaction.set(entitlementRef, { planId: action.planId, uid: action.uid, status: granting ? "active" : "revoked", source: "manual", updatedAt: at });
        const event: Omit<EntitlementEvent, "id"> = { planId: action.planId, uid: action.uid, type: granting ? "granted" : "revoked", source: "manual", reason: action.reason, actorUid: user.uid, at };
        transaction.create(col(tenantId, "entitlementEvents").doc(), event);
        transaction.create(
          col(tenantId, "auditEvents").doc(),
          auditPayload(user, granting ? "entitlement.granted" : "entitlement.revoked", { type: "entitlement", id: entitlementRef.id }, { planId: action.planId, member: action.uid, reason: action.reason }),
        );
        return { changed: true, status: granting ? "active" : "revoked" };
      });
    }
    case "attendance.set": {
      requireModerator();
      const { post } = await requireVisiblePost(tenantId, action.postId, viewer);
      if (!post.event) throw new FleetError("Only events track attendance.", 400);
      const membership = await tenantRef(slug, tenantId).collection("memberships").doc(action.uid).get();
      if (!membership.exists || membership.get("status") !== "active") throw new FleetError("Member not found.", 404);
      const ref = col(tenantId, "rsvps").doc(rsvpDocId(post.id, action.uid));
      const existing = await ref.get();
      await ref.set(
        {
          postId: post.id,
          uid: action.uid,
          name: existing.get("name") ?? (membership.get("name") || String(membership.get("email") ?? "").split("@")[0]),
          // A walk-in without an RSVP is recorded as going so RSVP totals stay consistent.
          status: existing.get("status") ?? "going",
          attended: action.attended,
          attendanceMarkedBy: user.uid,
          attendanceMarkedAt: nowIso(),
        },
        { merge: true },
      );
      await appendAuditEvent(slug, tenantId, user, action.attended ? "attendance.checked_in" : "attendance.cleared", { type: "post", id: post.id }, { member: action.uid });
      return { attended: action.attended };
    }
    case "post.appeal": {
      const post = await readPost(tenantId, action.postId);
      const space = await readSpace(tenantId, post.spaceId);
      if (!canSeeSpace(space, viewer)) throw new FleetError("Post not found.", 404);
      const ref = col(tenantId, "appeals").doc(post.id);
      const existing = await ref.get();
      if (!canAppeal(post, user.uid, existing.exists ? { status: existing.get("status") as Appeal["status"] } : null)) {
        throw new FleetError("Only the author of a removed post can appeal, once per removal.", 403);
      }
      const profile = (await col(tenantId, "profiles").doc(user.uid).get()).get("displayName") as string | undefined;
      const appeal: Omit<Appeal, "id"> = {
        postId: post.id,
        spaceId: post.spaceId,
        postTitle: post.title,
        authorUid: user.uid,
        authorName: profile || user.name || user.email.split("@")[0],
        message: action.message,
        removedReason: post.removedReason,
        status: "open",
        createdAt: nowIso(),
      };
      await ref.set(appeal);
      await appendAuditEvent(slug, tenantId, user, "appeal.filed", { type: "post", id: post.id }, { message: action.message });
      return { id: ref.id };
    }
    case "appeal.resolve": {
      requireModerator();
      const appealSnap = await col(tenantId, "appeals").doc(action.appealId).get();
      if (!appealSnap.exists) throw new FleetError("Appeal not found.", 404);
      const appeal = { id: appealSnap.id, ...appealSnap.data() } as Appeal;
      const space = await readSpace(tenantId, appeal.spaceId);
      if (!canSeeSpace(space, viewer)) throw new FleetError("Appeal not found.", 404);
      if (appeal.status !== "open") throw new FleetError("This appeal was already decided.", 409);
      if (appeal.authorUid === user.uid) throw new FleetError("Another moderator must decide your own appeal.", 403);
      const batch = db().batch();
      batch.update(appealSnap.ref, { status: action.decision, decidedBy: user.uid, decidedAt: nowIso(), decisionNote: action.note });
      if (action.decision === "reinstated") {
        batch.update(col(tenantId, "posts").doc(appeal.postId), { removed: false, removedReason: null });
      }
      batch.set(col(tenantId, "auditEvents").doc(), auditPayload(user, `appeal.${action.decision}`, { type: "post", id: appeal.postId }, { note: action.note, appealId: appeal.id }));
      await batch.commit();
      return { id: appeal.id, status: action.decision };
    }
    case "member.remove": {
      requireManager();
      const membership = await tenantRef(slug, tenantId).collection("memberships").doc(action.uid).get();
      if (!membership.exists || membership.get("status") !== "active") throw new FleetError("Member not found.", 404);
      if (!canRemoveMember(viewer, { uid: action.uid, role: String(membership.get("role")) })) {
        throw new FleetError("You cannot remove this member.", 403);
      }
      const batch = db().batch();
      batch.update(membership.ref, { status: "removed", removedAt: nowIso(), removedBy: user.uid });
      batch.delete(userTenantIndex(action.uid, tenantId));
      batch.set(col(tenantId, "auditEvents").doc(), auditPayload(user, "membership.removed", { type: "membership", id: action.uid }, { role: membership.get("role") }));
      await batch.commit();
      return { uid: action.uid };
    }
    case "post.report": {
      const { post } = await requireVisiblePost(tenantId, action.postId, viewer);
      if (post.authorUid === user.uid) throw new FleetError("You cannot report your own post.", 400);
      const profile = (await col(tenantId, "profiles").doc(user.uid).get()).get("displayName") as string | undefined;
      const ref = col(tenantId, "reports").doc(reportDocId(post.id, user.uid));
      const report: Omit<Report, "id"> = {
        postId: post.id,
        spaceId: post.spaceId,
        postTitle: post.title,
        reporterUid: user.uid,
        reporterName: profile || user.name || user.email.split("@")[0],
        reason: action.reason,
        status: "open",
        createdAt: nowIso(),
      };
      await ref.set(report);
      await appendAuditEvent(slug, tenantId, user, "report.filed", { type: "post", id: post.id }, { reason: action.reason });
      return { id: ref.id };
    }
    case "report.resolve": {
      requireModerator();
      const reportSnap = await col(tenantId, "reports").doc(action.reportId).get();
      if (!reportSnap.exists) throw new FleetError("Report not found.", 404);
      const report = { id: reportSnap.id, ...reportSnap.data() } as Report;
      const space = await readSpace(tenantId, report.spaceId);
      if (!canSeeSpace(space, viewer)) throw new FleetError("Report not found.", 404);
      if (report.status !== "open") throw new FleetError("This report was already resolved.", 409);
      const batch = db().batch();
      batch.update(reportSnap.ref, { status: action.resolution, resolvedBy: user.uid, resolvedAt: nowIso(), resolutionNote: action.note });
      if (action.resolution === "actioned") {
        batch.update(col(tenantId, "posts").doc(report.postId), {
          removed: true,
          removedReason: action.note || `Reported: ${report.reason}`,
          pinned: false,
        });
        batch.set(
          col(tenantId, "auditEvents").doc(),
          auditPayload(user, "moderation.post.remove", { type: "post", id: report.postId }, { reason: action.note || report.reason, reportId: report.id }),
        );
      }
      batch.set(col(tenantId, "auditEvents").doc(), auditPayload(user, "report.resolved", { type: "report", id: report.id }, { resolution: action.resolution, note: action.note }));
      await batch.commit();
      return { id: report.id, status: action.resolution };
    }
    case "invite.rotate": {
      requireManager();
      const inviteCode = generateInviteCode((size) => randomBytes(size));
      await settingsDoc(tenantId).set({ inviteCode, inviteEnabled: true, updatedAt: nowIso() }, { merge: true });
      await appendAuditEvent(slug, tenantId, user, "invite.rotated", { type: "invite", id: "community" });
      return { code: inviteCode };
    }
    case "invite.toggle": {
      requireManager();
      await settingsDoc(tenantId).set({ inviteEnabled: action.enabled, updatedAt: nowIso() }, { merge: true });
      await appendAuditEvent(slug, tenantId, user, action.enabled ? "invite.enabled" : "invite.disabled", { type: "invite", id: "community" });
      return { enabled: action.enabled };
    }
    case "notifications.read": {
      await col(tenantId, "profiles").doc(user.uid).set({ uid: user.uid, notificationsReadAt: nowIso() }, { merge: true });
      return { ok: true };
    }
  }
}

/* ------------------------------------------------------------------ invites + join */

function userTenantIndex(uid: string, tenantId: string) {
  return db().collection("products").doc(slug).collection("users").doc(uid).collection("tenants").doc(tenantId);
}

/** Server-side invite preview: only reveals the community name for a valid code. */
export async function previewInvite(tenantId: string, inviteCode: string) {
  const tenant = await tenantRef(slug, tenantId).get().catch(() => null);
  if (!tenant?.exists) return { ok: false as const, error: INVITE_ERRORS.mismatch };
  const check = validateInviteCode(await readSettings(tenantId), inviteCode);
  if (!check.ok) return { ok: false as const, error: INVITE_ERRORS[check.reason] };
  return { ok: true as const, name: String(tenant.get("name") ?? "Community") };
}

export async function joinWithInvite(tenantId: string, inviteCode: string, user: FleetUser) {
  const tenant = await tenantRef(slug, tenantId).get();
  if (!tenant.exists) throw new FleetError(INVITE_ERRORS.mismatch, 404);
  const check = validateInviteCode(await readSettings(tenantId), inviteCode);
  if (!check.ok) throw new FleetError(INVITE_ERRORS[check.reason], check.reason === "disabled" ? 403 : 404);

  const membershipRef = tenant.ref.collection("memberships").doc(user.uid);
  const existing = await membershipRef.get();
  if (existing.exists && existing.get("status") === "active") return { tenantId, alreadyMember: true };
  if (existing.exists && existing.get("status") === "removed") throw new FleetError("You were removed from this community.", 403);

  const now = FieldValue.serverTimestamp();
  const batch = db().batch();
  batch.set(membershipRef, { uid: user.uid, email: user.email, name: user.name, role: "member", status: "active", joinedAt: now, joinedVia: "invite" });
  batch.set(userTenantIndex(user.uid, tenantId), { name: tenant.get("name"), role: "member", joinedAt: now });
  batch.set(tenant.ref.collection("auditEvents").doc(), auditPayload(user, "membership.joined_via_invite", { type: "membership", id: user.uid }, { role: "member" }));
  await batch.commit();
  return { tenantId, alreadyMember: false };
}

/* ------------------------------------------------------------------ export */

export async function readAllForExport(tenantId: string) {
  const names = ["settings", "memberships", "profiles", "spaces", "posts", "comments", "reactions", "rsvps", "reports", "bookmarks", "appeals", "courses", "courseProgress", "plans", "entitlements", "entitlementEvents", "auditEvents"] as const;
  const snaps = await Promise.all(names.map((name) => tenantRef(slug, tenantId).collection(name).get()));
  return Object.fromEntries(names.map((name, index) => [name, snaps[index].docs.map((doc) => ({ id: doc.id, ...doc.data() }))])) as Record<
    (typeof names)[number],
    Array<Record<string, unknown> & { id: string }>
  >;
}
