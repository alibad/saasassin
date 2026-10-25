import { describe, expect, it } from "vitest";

import {
  actionSchema,
  appealQueue,
  applyLessonCompletion,
  assembleFeed,
  courseProgress,
  canAppeal,
  bookmarkDocId,
  buildEventIcs,
  canPostInSpace,
  canRemoveMember,
  canSeeSpace,
  computeNotifications,
  entitlementDocId,
  extractMentions,
  replayEntitlements,
  spaceGrantsFor,
  generateInviteCode,
  moderationQueue,
  moveSpace,
  reactionDocId,
  reportDocId,
  redactPost,
  redactSettingsForExport,
  searchPosts,
  summarizeAttendance,
  summarizeRsvps,
  toggleReaction,
  validateInviteCode,
  visibleSpaces,
  type Appeal,
  type Comment,
  type Post,
  type Report,
  type RsvpStatus,
  type Space,
} from "../src/lib/community/model";

const space = (id: string, overrides: Partial<Space> = {}): Space => ({
  id,
  name: id,
  description: "",
  kind: "discussion",
  visibility: "members",
  memberUids: [],
  order: 0,
  createdBy: "owner",
  createdAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const post = (id: string, spaceId: string, createdAt: string, overrides: Partial<Post> = {}): Post => ({
  id,
  spaceId,
  authorUid: "author",
  authorName: "Author",
  title: `Post ${id}`,
  body: "Body",
  event: null,
  pinned: false,
  commentsClosed: false,
  removed: false,
  removedReason: null,
  mentions: [],
  reactionCounts: {},
  commentCount: 0,
  createdAt,
  ...overrides,
});

const member = { uid: "m1", role: "member" };
const outsider = { uid: "m2", role: "member" };
const moderator = { uid: "mod", role: "moderator" };
const admin = { uid: "a1", role: "admin" };

describe("space visibility", () => {
  const privateSpace = space("vip", { visibility: "private", memberUids: ["m1"] });

  it("opens member spaces to every member and private spaces only to listed members", () => {
    expect(canSeeSpace(space("general"), outsider)).toBe(true);
    expect(canSeeSpace(privateSpace, member)).toBe(true);
    expect(canSeeSpace(privateSpace, outsider)).toBe(false);
  });

  it("lets owners and admins see every space but not unlisted moderators", () => {
    expect(canSeeSpace(privateSpace, admin)).toBe(true);
    expect(canSeeSpace(privateSpace, { uid: "x", role: "owner" })).toBe(true);
    expect(canSeeSpace(privateSpace, moderator)).toBe(false);
  });

  it("keeps announcements broadcast-only", () => {
    const announcements = space("news", { kind: "announcements" });
    expect(canPostInSpace(announcements, member)).toBe(false);
    expect(canPostInSpace(announcements, moderator)).toBe(true);
    expect(canPostInSpace(privateSpace, outsider)).toBe(false);
  });

  it("orders visible spaces and renumbers when moving", () => {
    const spaces = [space("b", { order: 1 }), space("a", { order: 0 }), privateSpace];
    expect(visibleSpaces(spaces, outsider).map((entry) => entry.id)).toEqual(["a", "b"]);
    const moved = moveSpace([space("a", { order: 0 }), space("b", { order: 1 }), space("c", { order: 2 })], "c", "up");
    expect(moved.map((entry) => [entry.id, entry.order])).toEqual([["a", 0], ["c", 1], ["b", 2]]);
    expect(moveSpace(moved, "a", "up").map((entry) => entry.id)).toEqual(["a", "c", "b"]);
  });
});

describe("plans and entitlements", () => {
  const vip = space("vip", { visibility: "private", memberUids: [] });
  const plans = [{ id: "gold", spaceIds: ["vip"] }, { id: "silver", spaceIds: [] }];

  it("replays the immutable log into the current grants, in time order", () => {
    const active = replayEntitlements([
      { id: "3", planId: "gold", uid: "m1", type: "revoked", at: "2026-10-03T00:00:00.000Z" },
      { id: "1", planId: "gold", uid: "m1", type: "granted", at: "2026-10-01T00:00:00.000Z" },
      { id: "2", planId: "gold", uid: "m2", type: "granted", at: "2026-10-02T00:00:00.000Z" },
      { id: "4", planId: "gold", uid: "m1", type: "granted", at: "2026-10-04T00:00:00.000Z" },
      { id: "5", planId: "silver", uid: "m2", type: "granted", at: "2026-10-04T00:00:00.000Z" },
      { id: "6", planId: "silver", uid: "m2", type: "revoked", at: "2026-10-05T00:00:00.000Z" },
    ]);
    expect([...active].sort()).toEqual([entitlementDocId("gold", "m1"), entitlementDocId("gold", "m2")]);
  });

  it("unlocks private spaces only through an active plan, and revoking removes access", () => {
    const granted = spaceGrantsFor("m1", plans, new Set([entitlementDocId("gold", "m1")]));
    expect(granted).toEqual(["vip"]);
    expect(canSeeSpace(vip, { uid: "m1", role: "member", spaceGrants: granted })).toBe(true);
    expect(canSeeSpace(vip, { uid: "m1", role: "member", spaceGrants: spaceGrantsFor("m1", plans, new Set()) })).toBe(false);
    expect(canSeeSpace({ ...vip, id: undefined }, { uid: "m1", role: "member", spaceGrants: ["vip"] })).toBe(false);
  });
});

describe("feed assembly", () => {
  const spaces = [space("general"), space("vip", { visibility: "private", memberUids: ["m1"] })];
  const posts = [
    post("p1", "general", "2026-10-01T10:00:00.000Z"),
    post("p2", "vip", "2026-10-02T10:00:00.000Z"),
    post("p3", "general", "2026-10-03T10:00:00.000Z", { removed: true }),
    post("p4", "general", "2026-09-01T10:00:00.000Z", { pinned: true }),
  ];

  it("filters to visible spaces, hides removed posts, newest first", () => {
    expect(assembleFeed(posts, spaces, member).map((entry) => entry.id)).toEqual(["p2", "p1", "p4"]);
    expect(assembleFeed(posts, spaces, outsider).map((entry) => entry.id)).toEqual(["p1", "p4"]);
  });

  it("only shows removed posts to moderators who ask for them", () => {
    expect(assembleFeed(posts, spaces, member, { includeRemoved: true }).some((entry) => entry.id === "p3")).toBe(false);
    expect(assembleFeed(posts, spaces, moderator, { includeRemoved: true }).some((entry) => entry.id === "p3")).toBe(true);
  });

  it("puts pinned posts first inside a single space and honours the limit", () => {
    expect(assembleFeed(posts, spaces, member, { spaceId: "general" }).map((entry) => entry.id)).toEqual(["p4", "p1"]);
    expect(assembleFeed(posts, spaces, member, { limit: 1 })).toHaveLength(1);
  });

  it("redacts removed content for non-moderators", () => {
    const removed = post("r", "general", "2026-10-01T00:00:00.000Z", { removed: true, body: "secret" });
    expect(redactPost(removed, "member").body).toBe("");
    expect(redactPost(removed, "moderator").body).toBe("secret");
  });

  it("searches titles above bodies and requires every term", () => {
    const corpus = [
      post("a", "general", "2026-10-01T00:00:00.000Z", { title: "Pricing update", body: "plans" }),
      post("b", "general", "2026-10-02T00:00:00.000Z", { title: "Hello", body: "new pricing plans" }),
    ];
    expect(searchPosts(corpus, "pricing").map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(searchPosts(corpus, "pricing hello").map((entry) => entry.id)).toEqual(["b"]);
    expect(searchPosts(corpus, "  ")).toEqual([]);
  });
});

describe("invite codes", () => {
  const code = "abcdefghjkmn2345";

  it("accepts the stored code only while invites are enabled", () => {
    expect(validateInviteCode({ inviteCode: code, inviteEnabled: true }, code)).toEqual({ ok: true });
    expect(validateInviteCode({ inviteCode: code, inviteEnabled: false }, code)).toEqual({ ok: false, reason: "disabled" });
    expect(validateInviteCode(null, code)).toEqual({ ok: false, reason: "disabled" });
  });

  it("rejects malformed and mismatched codes", () => {
    expect(validateInviteCode({ inviteCode: code }, "../etc")).toEqual({ ok: false, reason: "malformed" });
    expect(validateInviteCode({ inviteCode: code }, "abcdefghjkmn2346")).toEqual({ ok: false, reason: "mismatch" });
    expect(validateInviteCode({ inviteCode: code }, "abcdefghjkmn23456")).toEqual({ ok: false, reason: "mismatch" });
  });

  it("generates codes that satisfy the validator", () => {
    const generated = generateInviteCode((size) => Uint8Array.from({ length: size }, (_, index) => index * 37));
    expect(generated).toHaveLength(20);
    expect(validateInviteCode({ inviteCode: generated }, generated)).toEqual({ ok: true });
  });

  it("never exports the invite secret", () => {
    expect(redactSettingsForExport({ inviteCode: code, inviteEnabled: true })).toEqual({ inviteEnabled: true, inviteCodeRedacted: true });
  });
});

describe("reactions", () => {
  it("uses one deterministic document per user, post and type", () => {
    expect(reactionDocId("p1", "u1", "like")).toBe("p1__u1__like");
    expect(reactionDocId("p1", "u1", "like")).not.toBe(reactionDocId("p1", "u1", "celebrate"));
  });

  it("toggles on and off without going negative", () => {
    expect(toggleReaction(false, undefined)).toEqual({ active: true, delta: 1, count: 1 });
    expect(toggleReaction(true, 3)).toEqual({ active: false, delta: -1, count: 2 });
    expect(toggleReaction(true, 0)).toEqual({ active: false, delta: -1, count: 0 });
  });
});

describe("mentions and notifications", () => {
  const members = [
    { uid: "u1", email: "ada@example.com", name: "Ada" },
    { uid: "u2", email: "grace.h@example.com", name: "Grace" },
  ];

  it("resolves @handles from email local parts", () => {
    expect(extractMentions("Thanks @ada and @grace.h! email me@example.com", members)).toEqual(["u1", "u2"]);
    expect(extractMentions("no mentions here", members)).toEqual([]);
  });

  it("computes replies and mentions, skipping my own and removed content", () => {
    const posts = [
      post("mine", "general", "2026-10-01T00:00:00.000Z", { authorUid: "u1" }),
      post("other", "general", "2026-10-02T00:00:00.000Z", { authorUid: "u2", mentions: ["u1"] }),
      post("gone", "general", "2026-10-03T00:00:00.000Z", { authorUid: "u2", mentions: ["u1"], removed: true }),
    ];
    const comment = (id: string, postId: string, authorUid: string, createdAt: string, mentions: string[] = []): Comment => ({
      id, postId, spaceId: "general", authorUid, authorName: authorUid, body: "hi", mentions, removed: false, createdAt,
    });
    const items = computeNotifications({
      uid: "u1",
      posts,
      comments: [
        comment("c1", "mine", "u2", "2026-10-04T00:00:00.000Z"),
        comment("c2", "mine", "u1", "2026-10-05T00:00:00.000Z"),
        comment("c3", "other", "u2", "2026-10-06T00:00:00.000Z", ["u1"]),
        comment("c4", "other", "u2", "2026-10-07T00:00:00.000Z"),
      ],
      readAt: "2026-10-03T12:00:00.000Z",
    });
    expect(items.map((item) => [item.id, item.kind, item.unread])).toEqual([
      ["comment:c3", "mention", true],
      ["comment:c1", "reply", true],
      ["post:other", "mention", false],
    ]);
  });
});

describe("reports and member removal", () => {
  const spaces = [space("general"), space("vip", { visibility: "private", memberUids: ["m1"] })];
  const report = (id: string, spaceId: string, createdAt: string, status: Report["status"] = "open"): Report => ({
    id, postId: `p-${id}`, spaceId, postTitle: "t", reporterUid: "r", reporterName: "R", reason: "spam", status, createdAt,
  });

  it("dedupes reports per member per post", () => {
    expect(reportDocId("p1", "u1")).toBe("p1__u1");
  });

  it("queues only open reports in spaces the moderator can see, oldest first", () => {
    const reports = [
      report("b", "general", "2026-10-02T00:00:00.000Z"),
      report("a", "general", "2026-10-01T00:00:00.000Z"),
      report("c", "vip", "2026-10-01T00:00:00.000Z"),
      report("d", "general", "2026-09-01T00:00:00.000Z", "dismissed"),
    ];
    expect(moderationQueue(reports, spaces, moderator).map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(moderationQueue(reports, spaces, admin).map((entry) => entry.id)).toEqual(["a", "c", "b"]);
    expect(moderationQueue(reports, spaces, member)).toEqual([]);
  });

  it("never removes the owner or yourself, and only the owner removes admins", () => {
    const owner = { uid: "o", role: "owner" };
    expect(canRemoveMember(owner, member)).toBe(true);
    expect(canRemoveMember(owner, admin)).toBe(true);
    expect(canRemoveMember(admin, { uid: "a2", role: "admin" })).toBe(false);
    expect(canRemoveMember(admin, owner)).toBe(false);
    expect(canRemoveMember(admin, admin)).toBe(false);
    expect(canRemoveMember(moderator, member)).toBe(false);
  });
});

describe("appeals", () => {
  const spaces = [space("general"), space("vip", { visibility: "private", memberUids: ["m1"] })];
  const appeal = (id: string, spaceId: string, authorUid: string, createdAt: string, status: Appeal["status"] = "open"): Appeal => ({
    id, postId: id, spaceId, postTitle: "t", authorUid, authorName: authorUid, message: "please", removedReason: "spam", status, createdAt,
  });

  it("lets only the author of a removed post appeal, once per open appeal", () => {
    expect(canAppeal({ authorUid: "u1", removed: true }, "u1", null)).toBe(true);
    expect(canAppeal({ authorUid: "u1", removed: true }, "u2", null)).toBe(false);
    expect(canAppeal({ authorUid: "u1", removed: false }, "u1", null)).toBe(false);
    expect(canAppeal({ authorUid: "u1", removed: true }, "u1", { status: "open" })).toBe(false);
    expect(canAppeal({ authorUid: "u1", removed: true }, "u1", { status: "upheld" })).toBe(true);
  });

  it("queues open appeals in visible spaces and never shows a moderator their own", () => {
    const appeals = [
      appeal("b", "general", "m1", "2026-10-02T00:00:00.000Z"),
      appeal("a", "general", "mod", "2026-10-01T00:00:00.000Z"),
      appeal("c", "vip", "m1", "2026-10-01T00:00:00.000Z"),
      appeal("d", "general", "m1", "2026-09-01T00:00:00.000Z", "upheld"),
    ];
    expect(appealQueue(appeals, spaces, moderator).map((entry) => entry.id)).toEqual(["b"]);
    expect(appealQueue(appeals, spaces, admin).map((entry) => entry.id)).toEqual(["a", "c", "b"]);
    expect(appealQueue(appeals, spaces, member)).toEqual([]);
  });
});

describe("course progress and certificates", () => {
  const course = { id: "c1", lessons: [{ id: "l1", title: "One", body: "" }, { id: "l2", title: "Two", body: "" }] };

  it("counts only existing lessons and never double counts", () => {
    expect(courseProgress(course, ["l1", "l1", "gone"])).toEqual({ completed: 1, total: 2, percent: 50, done: false });
    expect(courseProgress({ lessons: [] }, [])).toEqual({ completed: 0, total: 0, percent: 0, done: false });
  });

  it("issues a certificate the first time every lesson is complete, and keeps it", () => {
    const first = applyLessonCompletion(course, null, { uid: "u1", lessonId: "l1", completed: true, now: "2026-10-26T00:00:00.000Z" });
    expect(first).toMatchObject({ completedLessonIds: ["l1"], certificateId: null, newlyCertified: false });
    const second = applyLessonCompletion(course, first, { uid: "u1", lessonId: "l2", completed: true, now: "2026-10-27T00:00:00.000Z" });
    expect(second).toMatchObject({ certificateId: "cert_c1_u1", completedAt: "2026-10-27T00:00:00.000Z", newlyCertified: true });
    const undo = applyLessonCompletion(course, second, { uid: "u1", lessonId: "l2", completed: false, now: "2026-10-28T00:00:00.000Z" });
    expect(undo).toMatchObject({ completedLessonIds: ["l1"], certificateId: "cert_c1_u1", completedAt: "2026-10-27T00:00:00.000Z", newlyCertified: false });
  });
});

describe("RSVPs and attendance", () => {
  it("counts RSVPs and ignores unknown statuses", () => {
    expect(summarizeRsvps([{ status: "going" }, { status: "maybe" }, { status: "going" }, { status: "bogus" as RsvpStatus }])).toEqual({ going: 2, maybe: 1, not_going: 0 });
  });

  it("defines show-up rate over members who said going, and counts walk-ins separately", () => {
    expect(
      summarizeAttendance([
        { status: "going", attended: true },
        { status: "going", attended: false },
        { status: "maybe", attended: true },
        { status: "not_going" },
      ]),
    ).toEqual({ going: 2, attended: 2, walkIns: 1, showUpRate: 0.5 });
    expect(summarizeAttendance([]).showUpRate).toBeNull();
  });
});

describe("event calendar files", () => {
  it("builds a valid one-event iCalendar with escaped text and a one-hour default", () => {
    const ics = buildEventIcs({
      id: "t1-p1",
      title: "AMA; pricing, plans",
      description: "Line one\nLine two",
      startsAt: "2026-11-01T18:00:00.000Z",
      endsAt: null,
      location: "Zoom",
      url: "https://community.saasassin.net/apps/community?c=t1",
      now: new Date("2026-10-26T00:00:00.000Z"),
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261101T180000Z");
    expect(ics).toContain("DTEND:20261101T190000Z");
    expect(ics).toContain("SUMMARY:AMA\\; pricing\\, plans");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
    expect(ics).toContain("LOCATION:Zoom");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("keeps bookmark ids one per member per post", () => {
    expect(bookmarkDocId("p1", "u1")).toBe("p1__u1");
  });
});

describe("action validation", () => {
  it("rejects events that end before they start", () => {
    const parsed = actionSchema.safeParse({
      type: "post.create",
      spaceId: "s",
      title: "Meetup",
      body: "Come",
      event: { startsAt: "2026-11-01T18:00:00.000Z", endsAt: "2026-11-01T17:00:00.000Z" },
    });
    expect(parsed.success).toBe(false);
  });

  it("never lets an invite or role change grant ownership", () => {
    expect(actionSchema.safeParse({ type: "member.role", uid: "u", role: "owner" }).success).toBe(false);
    expect(actionSchema.safeParse({ type: "member.role", uid: "u", role: "moderator" }).success).toBe(true);
  });
});
