import { z } from "zod";

/**
 * SaaSassin Community domain model — pure logic only (no Firestore, no server-only),
 * so every rule here is unit-tested in tests/community-*.test.ts.
 */

export const COMMUNITY_SLUG = "community";
export const EXPORT_SCHEMA_VERSION = "1.0.0";

export const COMMUNITY_ROLES = ["owner", "admin", "moderator", "member"] as const;
export type CommunityRole = (typeof COMMUNITY_ROLES)[number] | (string & {});

export const MANAGER_ROLES: CommunityRole[] = ["owner", "admin"];
export const MODERATOR_ROLES: CommunityRole[] = ["owner", "admin", "moderator"];

export const SPACE_KINDS = ["discussion", "announcements", "events"] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];
export const SPACE_VISIBILITIES = ["members", "private"] as const;
export type SpaceVisibility = (typeof SPACE_VISIBILITIES)[number];

export const REACTION_TYPES = ["like", "celebrate", "insightful"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];
export const REACTION_LABELS: Record<ReactionType, string> = { like: "Like", celebrate: "Celebrate", insightful: "Insightful" };

export const RSVP_STATUSES = ["going", "maybe", "not_going"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export type Space = {
  id: string;
  name: string;
  description: string;
  kind: SpaceKind;
  visibility: SpaceVisibility;
  memberUids: string[];
  order: number;
  createdBy: string;
  createdAt: string;
};

export type CommunityEvent = { startsAt: string; endsAt: string | null; location: string };

export type Post = {
  id: string;
  spaceId: string;
  authorUid: string;
  authorName: string;
  title: string;
  body: string;
  event: CommunityEvent | null;
  pinned: boolean;
  commentsClosed: boolean;
  removed: boolean;
  removedReason: string | null;
  mentions: string[];
  reactionCounts: Partial<Record<ReactionType, number>>;
  commentCount: number;
  createdAt: string;
};

export type Comment = {
  id: string;
  postId: string;
  spaceId: string;
  authorUid: string;
  authorName: string;
  body: string;
  mentions: string[];
  removed: boolean;
  createdAt: string;
};

export type Profile = { uid: string; displayName: string; headline: string; bio: string; notificationsReadAt: string | null };

export type Member = { uid: string; email: string; name: string; role: CommunityRole; status: string };

export function isManager(role: CommunityRole) {
  return MANAGER_ROLES.includes(role);
}

export function isModerator(role: CommunityRole) {
  return MODERATOR_ROLES.includes(role);
}

/* ------------------------------------------------------------------ visibility */

/** Owners/admins see every space; "members" spaces are open to all members; private spaces need an explicit grant. */
export function canSeeSpace(space: Pick<Space, "visibility" | "memberUids">, viewer: { uid: string; role: CommunityRole }) {
  if (isManager(viewer.role)) return true;
  if (space.visibility === "members") return true;
  return space.memberUids.includes(viewer.uid);
}

/** Announcements are broadcast-only: moderators and managers post, members read and comment. */
export function canPostInSpace(space: Pick<Space, "kind" | "visibility" | "memberUids">, viewer: { uid: string; role: CommunityRole }) {
  if (!canSeeSpace(space, viewer)) return false;
  if (space.kind === "announcements") return isModerator(viewer.role);
  return true;
}

export function visibleSpaces<T extends Pick<Space, "visibility" | "memberUids" | "order" | "name">>(
  spaces: T[],
  viewer: { uid: string; role: CommunityRole },
) {
  return sortSpaces(spaces.filter((space) => canSeeSpace(space, viewer)));
}

export function sortSpaces<T extends Pick<Space, "order" | "name">>(spaces: T[]) {
  return [...spaces].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** Swap a space with its neighbour and renumber 0..n so the order never drifts. */
export function moveSpace<T extends Pick<Space, "id" | "order" | "name">>(spaces: T[], spaceId: string, direction: "up" | "down") {
  const sorted = sortSpaces(spaces);
  const index = sorted.findIndex((space) => space.id === spaceId);
  if (index < 0) return sorted.map((space, order) => ({ ...space, order }));
  const target = direction === "up" ? index - 1 : index + 1;
  if (target >= 0 && target < sorted.length) {
    [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
  }
  return sorted.map((space, order) => ({ ...space, order }));
}

/* ------------------------------------------------------------------ feed */

export type FeedOptions = { spaceId?: string; limit?: number; includeRemoved?: boolean };

/**
 * Server-side feed assembly: only posts from spaces the viewer can see, removed content
 * hidden unless the viewer moderates, newest first. In a single space, pinned posts lead.
 */
export function assembleFeed(
  posts: Post[],
  spaces: Space[],
  viewer: { uid: string; role: CommunityRole },
  options: FeedOptions = {},
) {
  const visible = new Set(spaces.filter((space) => canSeeSpace(space, viewer)).map((space) => space.id));
  const showRemoved = options.includeRemoved === true && isModerator(viewer.role);
  const filtered = posts.filter(
    (post) =>
      visible.has(post.spaceId) &&
      (!options.spaceId || post.spaceId === options.spaceId) &&
      (showRemoved || !post.removed),
  );
  filtered.sort((a, b) => {
    if (options.spaceId && a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  });
  return filtered.slice(0, options.limit ?? 100);
}

/** Never send a removed post's content to someone who cannot moderate it. */
export function redactPost(post: Post, role: CommunityRole): Post {
  if (!post.removed || isModerator(role)) return post;
  return { ...post, title: "Removed", body: "", mentions: [] };
}

export function searchPosts(posts: Post[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return posts
    .map((post) => {
      const title = post.title.toLowerCase();
      const body = post.body.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (!title.includes(term) && !body.includes(term)) return null;
        score += title.includes(term) ? 3 : 1;
      }
      return { post, score };
    })
    .filter((entry): entry is { post: Post; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score || b.post.createdAt.localeCompare(a.post.createdAt))
    .map((entry) => entry.post);
}

export function upcomingEvents(posts: Post[], now: Date) {
  const cutoff = now.toISOString();
  return posts
    .filter((post) => post.event && !post.removed && (post.event.endsAt ?? post.event.startsAt) >= cutoff)
    .sort((a, b) => (a.event!.startsAt).localeCompare(b.event!.startsAt));
}

/* ------------------------------------------------------------------ reactions + RSVPs */

/** Deterministic id: one reaction per user per type per post, so toggling is idempotent. */
export function reactionDocId(postId: string, uid: string, type: ReactionType) {
  return `${postId}__${uid}__${type}`;
}

export function rsvpDocId(postId: string, uid: string) {
  return `${postId}__${uid}`;
}

/** Pure toggle: returns the next state and the count delta to apply atomically. */
export function toggleReaction(exists: boolean, count: number | undefined) {
  const current = Math.max(0, count ?? 0);
  return exists
    ? { active: false, delta: -1, count: Math.max(0, current - 1) }
    : { active: true, delta: 1, count: current + 1 };
}

/* ------------------------------------------------------------------ reports */

export type Report = {
  id: string;
  postId: string;
  spaceId: string;
  postTitle: string;
  reporterUid: string;
  reporterName: string;
  reason: string;
  status: "open" | "dismissed" | "actioned";
  createdAt: string;
};

/** One report per member per post: re-reporting updates the reason instead of stacking duplicates. */
export function reportDocId(postId: string, uid: string) {
  return `${postId}__${uid}`;
}

/** The moderation queue: open reports in spaces the moderator can see, oldest first so nothing starves. */
export function moderationQueue(reports: Report[], spaces: Space[], viewer: { uid: string; role: CommunityRole }) {
  if (!isModerator(viewer.role)) return [];
  const visible = new Set(spaces.filter((space) => canSeeSpace(space, viewer)).map((space) => space.id));
  return reports
    .filter((report) => report.status === "open" && visible.has(report.spaceId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Who may remove whom: never the owner, never yourself, and only the owner removes admins. */
export function canRemoveMember(actor: { uid: string; role: CommunityRole }, target: { uid: string; role: CommunityRole }) {
  if (!isManager(actor.role) || actor.uid === target.uid || target.role === "owner") return false;
  if (target.role === "admin") return actor.role === "owner";
  return true;
}

export function summarizeRsvps(rsvps: { status: RsvpStatus }[]) {
  const summary: Record<RsvpStatus, number> = { going: 0, maybe: 0, not_going: 0 };
  for (const rsvp of rsvps) summary[rsvp.status] += 1;
  return summary;
}

/* ------------------------------------------------------------------ invites */

export const INVITE_CODE_PATTERN = /^[a-z0-9]{12,40}$/;

export function generateInviteCode(random: (size: number) => Uint8Array) {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(random(20), (byte) => alphabet[byte % alphabet.length]).join("");
}

export type InviteCheck = { ok: true } | { ok: false; reason: "malformed" | "disabled" | "mismatch" };

/** Validates a shareable invite code against the stored one, in constant time over equal lengths. */
export function validateInviteCode(stored: { inviteCode?: string | null; inviteEnabled?: boolean } | null, provided: string): InviteCheck {
  if (!INVITE_CODE_PATTERN.test(provided)) return { ok: false, reason: "malformed" };
  if (!stored?.inviteCode || stored.inviteEnabled === false) return { ok: false, reason: "disabled" };
  const expected = stored.inviteCode;
  if (expected.length !== provided.length) return { ok: false, reason: "mismatch" };
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  return diff === 0 ? { ok: true } : { ok: false, reason: "mismatch" };
}

export const INVITE_ERRORS: Record<Exclude<InviteCheck, { ok: true }>["reason"], string> = {
  malformed: "This invite link is not valid.",
  disabled: "Invites to this community are turned off.",
  mismatch: "This invite link has expired or was replaced.",
};

/* ------------------------------------------------------------------ mentions + notifications */

export function memberHandle(member: Pick<Member, "email" | "name">) {
  const local = member.email.split("@")[0] ?? "";
  return (local || member.name).toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

export function extractMentions(text: string, members: Pick<Member, "uid" | "email" | "name">[]) {
  const handles = new Set(Array.from(text.matchAll(/(?:^|\s)@([a-z0-9._-]{2,40})/gi), (match) => match[1].toLowerCase()));
  return members.filter((member) => handles.has(memberHandle(member))).map((member) => member.uid);
}

export type Notification = {
  id: string;
  kind: "reply" | "mention";
  postId: string;
  postTitle: string;
  actorName: string;
  excerpt: string;
  at: string;
  unread: boolean;
};

/** In-app inbox computed from visible content: replies to my posts and mentions of me. */
export function computeNotifications(input: {
  uid: string;
  posts: Post[];
  comments: Comment[];
  readAt: string | null;
  limit?: number;
}) {
  const postsById = new Map(input.posts.map((post) => [post.id, post]));
  const items: Notification[] = [];
  const excerpt = (text: string) => (text.length > 120 ? `${text.slice(0, 117)}...` : text);
  for (const post of input.posts) {
    if (post.removed || post.authorUid === input.uid || !post.mentions.includes(input.uid)) continue;
    items.push({ id: `post:${post.id}`, kind: "mention", postId: post.id, postTitle: post.title, actorName: post.authorName, excerpt: excerpt(post.body), at: post.createdAt, unread: false });
  }
  for (const comment of input.comments) {
    const post = postsById.get(comment.postId);
    if (!post || post.removed || comment.removed || comment.authorUid === input.uid) continue;
    const kind = comment.mentions.includes(input.uid) ? "mention" : post.authorUid === input.uid ? "reply" : null;
    if (!kind) continue;
    items.push({ id: `comment:${comment.id}`, kind, postId: post.id, postTitle: post.title, actorName: comment.authorName, excerpt: excerpt(comment.body), at: comment.createdAt, unread: false });
  }
  return items
    .map((item) => ({ ...item, unread: !input.readAt || item.at > input.readAt }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, input.limit ?? 50);
}

/* ------------------------------------------------------------------ input schemas */

const text = (label: string, max: number) => z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);

export const spaceInputSchema = z.object({
  name: text("Space name", 60),
  description: z.string().trim().max(280).default(""),
  kind: z.enum(SPACE_KINDS),
  visibility: z.enum(SPACE_VISIBILITIES),
  memberUids: z.array(z.string().min(1).max(128)).max(500).default([]),
});

export const eventInputSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true, message: "Pick a valid start time." }),
    endsAt: z.string().datetime({ offset: true }).nullable().default(null),
    location: z.string().trim().max(200).default(""),
  })
  .refine((event) => !event.endsAt || event.endsAt > event.startsAt, { message: "The event must end after it starts." });

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("space.create"), space: spaceInputSchema }),
  z.object({ type: z.literal("space.update"), spaceId: z.string().min(1), space: spaceInputSchema }),
  z.object({ type: z.literal("space.move"), spaceId: z.string().min(1), direction: z.enum(["up", "down"]) }),
  z.object({
    type: z.literal("post.create"),
    spaceId: z.string().min(1),
    title: text("Title", 160),
    body: text("Body", 10000),
    event: eventInputSchema.nullable().default(null),
  }),
  z.object({ type: z.literal("comment.create"), postId: z.string().min(1), body: text("Comment", 4000) }),
  z.object({ type: z.literal("reaction.toggle"), postId: z.string().min(1), reaction: z.enum(REACTION_TYPES) }),
  z.object({ type: z.literal("rsvp.set"), postId: z.string().min(1), status: z.enum(RSVP_STATUSES) }),
  z.object({
    type: z.literal("post.moderate"),
    postId: z.string().min(1),
    operation: z.enum(["pin", "unpin", "close", "reopen", "remove", "restore"]),
    reason: z.string().trim().max(280).default(""),
  }),
  z.object({ type: z.literal("comment.remove"), commentId: z.string().min(1), reason: z.string().trim().max(280).default("") }),
  z.object({
    type: z.literal("profile.update"),
    displayName: text("Display name", 80),
    headline: z.string().trim().max(120).default(""),
    bio: z.string().trim().max(1000).default(""),
  }),
  z.object({ type: z.literal("member.role"), uid: z.string().min(1), role: z.enum(["admin", "moderator", "member"]) }),
  z.object({ type: z.literal("member.remove"), uid: z.string().min(1) }),
  z.object({ type: z.literal("post.report"), postId: z.string().min(1), reason: text("Reason", 280) }),
  z.object({
    type: z.literal("report.resolve"),
    reportId: z.string().min(1),
    resolution: z.enum(["dismissed", "actioned"]),
    note: z.string().trim().max(280).default(""),
  }),
  z.object({ type: z.literal("invite.rotate") }),
  z.object({ type: z.literal("invite.toggle"), enabled: z.boolean() }),
  z.object({ type: z.literal("notifications.read") }),
]);

export type CommunityAction = z.infer<typeof actionSchema>;

export const joinSchema = z.object({
  tenantId: z.string().min(1).max(128),
  inviteCode: z.string().min(1).max(64),
});

export const memberInviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  role: z.enum(["admin", "moderator", "member"]),
});

/* ------------------------------------------------------------------ export */

export const EXPORT_FILES = [
  ["settings", "community.settings"],
  ["memberships", "community.membership"],
  ["profiles", "community.profile"],
  ["spaces", "community.space"],
  ["posts", "community.post"],
  ["comments", "community.comment"],
  ["reactions", "community.reaction"],
  ["rsvps", "community.rsvp"],
  ["reports", "community.report"],
  ["auditEvents", "community.audit-event"],
] as const;

export function exportSchemaName(schema: string) {
  return `net.saasassin.${schema}@${EXPORT_SCHEMA_VERSION}`;
}

/** The invite secret is a credential, not community history; exports never carry it. */
export function redactSettingsForExport(settings: Record<string, unknown>) {
  const rest = { ...settings };
  delete rest.inviteCode;
  return { ...rest, inviteCodeRedacted: Boolean(settings.inviteCode) };
}
