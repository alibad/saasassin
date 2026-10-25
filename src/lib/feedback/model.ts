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

export function groupRoadmap<T extends { status: PostStatus }>(posts: T[]) {
  return ROADMAP_COLUMNS.map((status) => ({ status, label: STATUS_LABELS[status], posts: posts.filter((post) => post.status === status) }));
}
