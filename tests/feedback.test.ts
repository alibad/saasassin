import { describe, expect, it } from "vitest";

import { mapCannyCsv } from "../src/lib/feedback/canny";
import { toFiderInstances } from "../src/lib/feedback/fider";
import {
  allowedTransitions,
  canAddVote,
  checkMerge,
  checkTransition,
  filterPosts,
  findSimilarPosts,
  groupRoadmap,
  slugify,
  sortPosts,
  type ListablePost,
} from "../src/lib/feedback/model";
import type { Post } from "../src/lib/feedback/types";
import { planVoteMerge, toggleVote, voteDocId } from "../src/lib/feedback/votes";

describe("feedback status state machine", () => {
  it("allows the normal open → planned → started → completed path", () => {
    expect(checkTransition("open", "planned", "")).toEqual({ ok: true });
    expect(checkTransition("planned", "started", "")).toEqual({ ok: true });
    expect(checkTransition("started", "completed", "Shipped in 2.3")).toEqual({ ok: true });
  });

  it("rejects no-op, manual duplicate, and leaving duplicate", () => {
    expect(checkTransition("open", "open", "").ok).toBe(false);
    expect(checkTransition("open", "duplicate", "").ok).toBe(false);
    expect(checkTransition("duplicate", "open", "").ok).toBe(false);
    expect(allowedTransitions("duplicate")).toEqual([]);
  });

  it("requires a note to decline and only reopens declined posts", () => {
    expect(checkTransition("open", "declined", "").ok).toBe(false);
    expect(checkTransition("open", "declined", "Out of scope")).toEqual({ ok: true });
    expect(checkTransition("declined", "planned", "").ok).toBe(false);
    expect(checkTransition("declined", "open", "")).toEqual({ ok: true });
    expect(checkTransition("completed", "declined", "nope").ok).toBe(false);
  });

  it("only accepts new votes while work is possible", () => {
    expect(canAddVote("open")).toBe(true);
    expect(canAddVote("started")).toBe(true);
    expect(canAddVote("completed")).toBe(false);
    expect(canAddVote("duplicate")).toBe(false);
  });

  it("validates merges", () => {
    expect(checkMerge({ id: "a", status: "open" }, { id: "a", status: "open" }).ok).toBe(false);
    expect(checkMerge({ id: "a", status: "duplicate" }, { id: "b", status: "open" }).ok).toBe(false);
    expect(checkMerge({ id: "a", status: "open" }, { id: "b", status: "duplicate" }).ok).toBe(false);
    expect(checkMerge({ id: "a", status: "open" }, { id: "b", status: "planned" })).toEqual({ ok: true });
  });
});

describe("feedback votes", () => {
  it("builds a deterministic vote id and rejects path characters", () => {
    expect(voteDocId("p1", "u1")).toBe("p1__u1");
    expect(voteDocId("p1", "u1")).toBe(voteDocId("p1", "u1"));
    expect(() => voteDocId("p/1", "u1")).toThrow();
  });

  it("toggles a vote on and off without going negative", () => {
    expect(toggleVote(false, 4, true)).toEqual({ op: "add", voted: true, voteCount: 5 });
    expect(toggleVote(true, 5, true)).toEqual({ op: "remove", voted: false, voteCount: 4 });
    expect(toggleVote(true, 0, false)).toEqual({ op: "remove", voted: false, voteCount: 0 });
    expect(toggleVote(false, 3, false)).toEqual({ error: "This post is closed for new votes." });
  });

  it("moves duplicate votes to the canonical post without double counting", () => {
    const plan = planVoteMerge(
      [{ uid: "a", name: "A" }, { uid: "b", name: "B" }, { uid: "c", name: "C" }, { uid: "a", name: "A" }],
      [{ uid: "b", name: "B" }, { uid: "d", name: "D" }],
    );
    expect(plan.moves.map((voter) => voter.uid)).toEqual(["a", "c"]);
    expect(plan.overlapping).toEqual(["b"]);
    expect(plan.removeFromDuplicate).toEqual(["a", "b", "c"]);
    expect(plan.canonicalVoteCount).toBe(4);
  });

  it("handles merging an unvoted duplicate", () => {
    const plan = planVoteMerge([], [{ uid: "x", name: "X" }]);
    expect(plan).toEqual({ moves: [], overlapping: [], removeFromDuplicate: [], canonicalVoteCount: 1 });
  });
});

describe("feedback board listing", () => {
  const base = (overrides: Partial<ListablePost>): ListablePost => ({
    id: "x", number: 1, title: "", description: "", status: "open", tags: [], voteCount: 0, commentCount: 0, createdAt: "2026-01-01T00:00:00.000Z", ...overrides,
  });
  const posts = [
    base({ id: "a", number: 1, title: "Dark mode", voteCount: 9, createdAt: "2026-01-01T00:00:00.000Z", tags: ["ui"] }),
    base({ id: "b", number: 2, title: "SSO", voteCount: 3, commentCount: 7, createdAt: "2026-03-01T00:00:00.000Z", status: "planned" }),
    base({ id: "c", number: 3, title: "CSV export", voteCount: 12, createdAt: "2026-02-01T00:00:00.000Z", status: "completed" }),
  ];

  it("sorts by votes, newest and comments", () => {
    expect(sortPosts(posts, "votes").map((post) => post.id)).toEqual(["c", "a", "b"]);
    expect(sortPosts(posts, "newest").map((post) => post.id)).toEqual(["b", "c", "a"]);
    expect(sortPosts(posts, "comments").map((post) => post.id)).toEqual(["b", "c", "a"]);
  });

  it("filters by active status, tag and search", () => {
    expect(filterPosts(posts, {}).map((post) => post.id)).toEqual(["a", "b"]);
    expect(filterPosts(posts, { status: "all" })).toHaveLength(3);
    expect(filterPosts(posts, { status: "completed" }).map((post) => post.id)).toEqual(["c"]);
    expect(filterPosts(posts, { status: "all", tag: "ui" }).map((post) => post.id)).toEqual(["a"]);
    expect(filterPosts(posts, { status: "all", query: "sso" }).map((post) => post.id)).toEqual(["b"]);
    expect(filterPosts(posts, { status: "all", query: "#3" }).map((post) => post.id)).toEqual(["c"]);
  });

  it("groups the public roadmap into planned, started and completed", () => {
    const groups = groupRoadmap(posts);
    expect(groups.map((group) => [group.status, group.posts.length])).toEqual([["planned", 1], ["started", 0], ["completed", 1]]);
  });

  it("finds likely duplicates by meaningful title words", () => {
    const candidates = [
      { id: "1", title: "Dark mode for the dashboard", status: "open" as const },
      { id: "2", title: "Export reports to CSV", status: "open" as const },
      { id: "3", title: "Dashboard dark theme", status: "duplicate" as const },
      { id: "4", title: "Add dark mode", status: "planned" as const },
    ];
    expect(findSimilarPosts("Please add a dark mode", candidates).map((post) => post.id)).toEqual(["4", "1"]);
    expect(findSimilarPosts("CSV exports", candidates).map((post) => post.id)).toEqual(["2"]);
    expect(findSimilarPosts("the a to", candidates)).toEqual([]);
    expect(findSimilarPosts("dark mode", candidates, { excludeId: "4" }).map((post) => post.id)).toEqual(["1"]);
  });

  it("slugifies titles", () => {
    expect(slugify("  Dark Mode for the Dashboard! ")).toBe("dark-mode-for-the-dashboard");
    expect(slugify("Ünïcödé café")).toBe("unicode-cafe");
    expect(slugify("!!!")).toBe("post");
  });
});

describe("Fider mapping", () => {
  const post = (overrides: Partial<Post>): Post => ({
    id: "p1", number: 1, boardId: "b1", title: "Dark mode", slug: "dark-mode", description: "Please", status: "open", tags: [],
    author: { uid: "u1", name: "Ana" }, voteCount: 1, commentCount: 0, response: null, statusHistory: [], originalId: null,
    hidden: false, hiddenReason: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null, ...overrides,
  });

  it("maps a board to Fider tables with status codes, duplicates and tags", () => {
    const result = toFiderInstances({
      boards: [{ id: "b1", slug: "ideas", name: "Ideas", description: "", isPublic: true, createdAt: null }],
      posts: [
        post({ id: "p1", number: 1, tags: ["t1"], status: "planned", response: { text: "Soon", by: { uid: "admin", name: "Ad" }, at: "2026-02-01T00:00:00.000Z" } }),
        post({ id: "p2", number: 2, author: { uid: "u2", name: "Bo" }, status: "duplicate", originalId: "p1" }),
      ],
      votes: [
        { id: "p1__u1", postId: "p1", uid: "u1", name: "Ana", email: "ana@example.com", createdAt: null },
        { id: "p1__u2", postId: "p1", uid: "u2", name: "Bo", email: "", createdAt: null },
      ],
      comments: [
        { id: "c1", postId: "p1", author: { uid: "u2", name: "Bo" }, content: "+1", hidden: false, hiddenReason: null, createdAt: null },
        { id: "c2", postId: "p1", author: { uid: "admin", name: "Ad" }, content: "Big customer asks", internal: true, hidden: false, hiddenReason: null, createdAt: null },
      ],
      tags: [{ id: "t1", slug: "ui", name: "UI", color: "#27c7a6", isPublic: true }],
      members: [{ uid: "admin", email: "admin@example.com", name: "Ad", role: "owner" }],
    });
    expect(result.instances).toHaveLength(1);
    const { tables, skipped } = result.instances[0];
    expect(tables.posts.map((row) => [row.number, row.status, row.original_id])).toEqual([[1, 4, null], [2, 5, 1]]);
    const admin = tables.users.find((user) => user.external_ref === "admin")!;
    expect(admin.role).toBe(3);
    expect(tables.posts[0].response_user_id).toBe(admin.id);
    expect(tables.post_votes).toHaveLength(2);
    expect(tables.tags[0]).toEqual({ id: 1, name: "UI", slug: "ui", color: "27c7a6", is_public: true });
    expect(tables.post_tags).toEqual([{ post_id: 1, tag_id: 1 }]);
    expect(tables.comments).toHaveLength(1);
    expect(tables.comments[0].post_id).toBe(1);
    expect(skipped.map((entry) => entry.type)).toEqual(["comment.internal"]);
    expect(tables.users.find((user) => user.external_ref === "u1")!.email).toBe("ana@example.com");
  });

  it("is deterministic across runs", () => {
    const input = {
      boards: [{ id: "b1", slug: "ideas", name: "Ideas", description: "", isPublic: true, createdAt: null }],
      posts: [post({})], votes: [], comments: [], tags: [], members: [],
    };
    expect(JSON.stringify(toFiderInstances(input))).toBe(JSON.stringify(toFiderInstances(input)));
  });
});

describe("Canny CSV mapper", () => {
  it("maps statuses, votes, tags, boards and dates", () => {
    const csv = [
      "Board,Title,Details,Status,Author Name,Author Email,Votes,Created At,Tags,URL",
      'Feature Requests,Dark mode,"Night, please",in progress,Ana,ANA@example.com,"1,204",2025-05-01T10:00:00Z,"ui, theme",https://acme.canny.io/p/dark-mode',
      "Feature Requests,SSO,,complete,Bo,,3,2025-06-01,,https://acme.canny.io/p/sso",
      "Bugs,Crash on save,,closed,Cy,cy@example.com,0,,,https://acme.canny.io/p/crash",
    ].join("\n");
    const result = mapCannyCsv(csv);
    expect(result.problems).toEqual([]);
    expect(result.posts.map((post) => [post.title, post.status, post.voteCount])).toEqual([
      ["Dark mode", "started", 1204],
      ["SSO", "completed", 3],
      ["Crash on save", "declined", 0],
    ]);
    expect(result.posts[0].tags).toEqual(["ui", "theme"]);
    expect(result.posts[0].authorEmail).toBe("ana@example.com");
    expect(result.posts[0].createdAt).toBe("2025-05-01T10:00:00.000Z");
    expect(result.boards).toEqual([
      { slug: "feature-requests", name: "Feature Requests", posts: 2 },
      { slug: "bugs", name: "Bugs", posts: 1 },
    ]);
  });

  it("reports problems instead of guessing silently", () => {
    const csv = [
      "board,title,status,votes,created_at,url",
      "Ideas,,open,1,,https://x/p/1",
      "Ideas,Thing,mystery,abc,not a date,https://x/p/2",
      "Ideas,Thing,open,1,,https://x/p/2",
      "Ideas,Old,merged,2,,https://x/p/3",
    ].join("\n");
    const result = mapCannyCsv(csv);
    expect(result.posts.map((post) => post.title)).toEqual(["Thing", "Old"]);
    expect(result.posts[0].status).toBe("open");
    const messages = result.problems.map((problem) => `${problem.line}:${problem.message.split(" ")[0]}`);
    expect(messages).toEqual(["2:Missing", "3:Unknown", "3:Vote", "3:Date", "4:Duplicate", "5:Merged"]);
  });

  it("rejects files without a title column", () => {
    const result = mapCannyCsv("name,email\nAna,ana@example.com");
    expect(result.posts).toEqual([]);
    expect(result.problems[0].message).toMatch(/Title/);
    expect(result.unmappedHeaders).toEqual(["name"]);
  });
});
