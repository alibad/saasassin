/**
 * SaaSassin Feedback domain model.
 *
 * Shapes deliberately mirror Fider (github.com/getfider/fider) so a workspace can move
 * upstream: posts carry a per-workspace `number`, a `slug`, a `status`, an optional
 * staff `response`, and an `originalId` when marked as a duplicate. Fider's status
 * enum values are kept in FIDER_STATUS_CODES.
 *
 * Pure module: no Firebase, no server-only imports, safe for tests and client code.
 */

export const POST_STATUSES = ["open", "planned", "started", "completed", "declined", "duplicate"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Fider's `enum.PostStatus` integer values (open=0, started=1, completed=2, declined=3, planned=4, duplicate=5). */
export const FIDER_STATUS_CODES: Record<PostStatus, number> = {
  open: 0,
  started: 1,
  completed: 2,
  declined: 3,
  planned: 4,
  duplicate: 5,
};

export const STATUS_LABELS: Record<PostStatus, string> = {
  open: "Open",
  planned: "Planned",
  started: "Started",
  completed: "Completed",
  declined: "Declined",
  duplicate: "Duplicate",
};

export const ROADMAP_COLUMNS: PostStatus[] = ["planned", "started", "completed"];

/**
 * Allowed manual status changes. `duplicate` is never set by hand: it is only reached
 * through a merge, which also moves the votes. A merged post stays merged.
 */
const TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  open: ["planned", "started", "completed", "declined"],
  planned: ["open", "started", "completed", "declined"],
  started: ["open", "planned", "completed", "declined"],
  completed: ["open", "started"],
  declined: ["open"],
  duplicate: [],
};

export function allowedTransitions(from: PostStatus): PostStatus[] {
  return TRANSITIONS[from] ?? [];
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

export function checkTransition(from: PostStatus, to: PostStatus, note: string | undefined | null): TransitionCheck {
  if (from === to) return { ok: false, reason: `The post is already ${STATUS_LABELS[to].toLowerCase()}.` };
  if (to === "duplicate") return { ok: false, reason: "Use merge to mark a post as a duplicate so its votes move." };
  if (from === "duplicate") return { ok: false, reason: "Merged posts stay merged; reopen the canonical post instead." };
  if (!TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: `A ${STATUS_LABELS[from].toLowerCase()} post cannot move to ${STATUS_LABELS[to].toLowerCase()}.` };
  }
  if (to === "declined" && (note ?? "").trim().length < 3) {
    return { ok: false, reason: "Explain why the post is declined; voters will read the note." };
  }
  return { ok: true };
}

/** Voting is allowed while work is still possible; removing an existing vote is always allowed. */
export function canAddVote(status: PostStatus) {
  return status === "open" || status === "planned" || status === "started";
}

export type MergeCheck = { ok: true } | { ok: false; reason: string };

export function checkMerge(
  duplicate: { id: string; status: PostStatus; hidden?: boolean },
  canonical: { id: string; status: PostStatus; hidden?: boolean },
): MergeCheck {
  if (duplicate.id === canonical.id) return { ok: false, reason: "Choose a different post to merge into." };
  if (duplicate.status === "duplicate") return { ok: false, reason: "That post is already merged." };
  if (canonical.status === "duplicate") return { ok: false, reason: "Merge into the canonical post, not another duplicate." };
  if (canonical.hidden) return { ok: false, reason: "Unhide the canonical post before merging into it." };
  return { ok: true };
}

export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "post";
}

export function isPostStatus(value: unknown): value is PostStatus {
  return typeof value === "string" && (POST_STATUSES as readonly string[]).includes(value);
}

export type PostSort = "votes" | "newest" | "comments";

export type ListablePost = {
  id: string;
  number: number;
  title: string;
  description: string;
  status: PostStatus;
  tags: string[];
  voteCount: number;
  commentCount: number;
  createdAt: string | null;
};

export function sortPosts<T extends ListablePost>(posts: T[], sort: PostSort): T[] {
  const time = (post: T) => (post.createdAt ? Date.parse(post.createdAt) : 0);
  return [...posts].sort((a, b) => {
    if (sort === "newest") return time(b) - time(a) || b.number - a.number;
    if (sort === "comments") return b.commentCount - a.commentCount || b.voteCount - a.voteCount || time(b) - time(a);
    return b.voteCount - a.voteCount || time(b) - time(a) || b.number - a.number;
  });
}

export type PostFilter = {
  status?: PostStatus | "active" | "all";
  tag?: string | null;
  query?: string;
};

/** "active" (the board default) hides closed posts: completed, declined and duplicates. */
export function filterPosts<T extends ListablePost>(posts: T[], filter: PostFilter): T[] {
  const query = (filter.query ?? "").trim().toLowerCase();
  const status = filter.status ?? "active";
  return posts.filter((post) => {
    if (status === "active" && !["open", "planned", "started"].includes(post.status)) return false;
    if (status !== "active" && status !== "all" && post.status !== status) return false;
    if (filter.tag && !post.tags.includes(filter.tag)) return false;
    if (query && !`${post.title} ${post.description} #${post.number}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

const STOP_WORDS = new Set(["a", "an", "the", "to", "for", "of", "and", "or", "in", "on", "with", "be", "is", "it", "add", "please", "support", "allow", "can", "we", "i", "my", "should"]);

function tokens(text: string) {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .map((word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word))
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
  );
}

/**
 * Likely duplicates by title word overlap (Jaccard on meaningful words), best first.
 * Used to steer posters toward voting on an existing idea and admins toward the right merge target.
 */
export function findSimilarPosts<T extends { id: string; title: string; status: PostStatus }>(
  title: string,
  posts: T[],
  options: { limit?: number; threshold?: number; excludeId?: string } = {},
): (T & { score: number })[] {
  const query = tokens(title);
  if (query.size === 0) return [];
  return posts
    .filter((post) => post.id !== options.excludeId && post.status !== "duplicate")
    .map((post) => {
      const other = tokens(post.title);
      let shared = 0;
      for (const word of query) if (other.has(word)) shared += 1;
      const union = query.size + other.size - shared;
      return { ...post, score: union ? shared / union : 0 };
    })
    .filter((post) => post.score >= (options.threshold ?? 0.25))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 5);
}

export function checkUnmerge(post: { status: PostStatus; originalId: string | null; hasMergeRecord: boolean }): MergeCheck {
  if (post.status !== "duplicate" || !post.originalId) return { ok: false, reason: "Only merged posts can be unmerged." };
  if (!post.hasMergeRecord) return { ok: false, reason: "This merge predates merge records and cannot be reversed automatically." };
  return { ok: true };
}

/** Votes per post broken down by the voter's customer segment (from tenant voter profiles). */
export function segmentVoteCounts(
  votes: { postId: string; uid: string }[],
  profiles: { uid: string; segment: string; company: string }[],
) {
  const byUid = new Map(profiles.map((profile) => [profile.uid, profile]));
  const result = new Map<string, { segments: Record<string, number>; companies: string[] }>();
  for (const vote of votes) {
    const profile = byUid.get(vote.uid);
    const entry = result.get(vote.postId) ?? { segments: {}, companies: [] };
    const segment = profile?.segment || "Unsegmented";
    entry.segments[segment] = (entry.segments[segment] ?? 0) + 1;
    if (profile?.company && !entry.companies.includes(profile.company)) entry.companies.push(profile.company);
    result.set(vote.postId, entry);
  }
  for (const entry of result.values()) entry.companies.sort();
  return result;
}

export type InitiativeLike = { id: string; name: string; kind: "initiative" | "release"; targetDate: string | null; isPublic: boolean };

/** Groups roadmap posts under initiatives/releases with shipped progress; posts without one are returned separately. */
export function groupByInitiative<T extends { id: string; status: PostStatus; initiativeId: string | null }, I extends InitiativeLike>(posts: T[], initiatives: I[]) {
  const groups = initiatives.map((initiative) => {
    const items = posts.filter((post) => post.initiativeId === initiative.id && post.status !== "duplicate");
    const done = items.filter((post) => post.status === "completed").length;
    return { initiative, posts: items, done, total: items.length, progress: items.length ? Math.round((done / items.length) * 100) : 0 };
  });
  const known = new Set(initiatives.map((initiative) => initiative.id));
  return {
    groups: groups.sort((a, b) => (a.initiative.targetDate ?? "9999").localeCompare(b.initiative.targetDate ?? "9999") || a.initiative.name.localeCompare(b.initiative.name)),
    ungrouped: posts.filter((post) => !post.initiativeId || !known.has(post.initiativeId)),
  };
}

export function groupRoadmap<T extends { status: PostStatus }>(posts: T[]) {
  return ROADMAP_COLUMNS.map((status) => ({ status, label: STATUS_LABELS[status], posts: posts.filter((post) => post.status === status) }));
}
