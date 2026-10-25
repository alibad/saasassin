import { describe, expect, it } from "vitest";

import {
  actionSchema,
  assembleFeed,
  canPostInSpace,
  canRemoveMember,
  canSeeSpace,
  computeNotifications,
  extractMentions,
  generateInviteCode,
  moderationQueue,
  moveSpace,
  reactionDocId,
  reportDocId,
  redactPost,
  redactSettingsForExport,
  searchPosts,
  toggleReaction,
  validateInviteCode,
  visibleSpaces,
  type Comment,
  type Post,
  type Report,
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
