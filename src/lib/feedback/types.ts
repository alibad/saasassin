import type { PostStatus } from "./model";

/** JSON-safe records as served to the browser and written to exports (timestamps are ISO strings). */

/**
 * Someone shown next to a post, comment or update. Public payloads blank the uid and add a
 * photo URL that never contains it, plus `team` when the person belongs to the workspace.
 */
export type PersonRef = { uid: string; name: string; photoURL?: string | null; team?: boolean };

/** Display data for people in the team views, keyed by uid (photos are served to the team only). */
export type PersonView = { name: string; title: string; photoURL: string | null };

export type Board = {
  id: string;
  slug: string;
  name: string;
  description: string;
  isPublic: boolean;
  createdAt: string | null;
};

export type StatusEvent = {
  from: PostStatus;
  to: PostStatus;
  note: string;
  by: { uid: string; name: string };
  at: string;
};

export type Post = {
  id: string;
  number: number;
  boardId: string;
  title: string;
  slug: string;
  description: string;
  status: PostStatus;
  tags: string[];
  author: PersonRef;
  voteCount: number;
  commentCount: number;
  response: { text: string; by: PersonRef; at: string } | null;
  statusHistory: StatusEvent[];
  originalId: string | null;
  hasMergeRecord: boolean;
  owner: { uid: string; name: string } | null;
  initiativeId: string | null;
  hidden: boolean;
  hiddenReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type Initiative = {
  id: string;
  name: string;
  description: string;
  kind: "initiative" | "release";
  targetDate: string | null;
  isPublic: boolean;
  createdAt: string | null;
};

/** A voter's customer context inside one workspace (set by the team). */
export type VoterProfile = {
  uid: string;
  name: string;
  email: string;
  company: string;
  segment: string;
  updatedAt: string | null;
};

export type Vote = {
  id: string;
  postId: string;
  uid: string;
  name: string;
  email: string;
  createdAt: string | null;
  movedFrom?: string | null;
};

export type Comment = {
  id: string;
  postId: string;
  author: PersonRef;
  content: string;
  /** Team-only note: never served on public surfaces and not exported to Fider (which has no equivalent). */
  internal?: boolean;
  hidden: boolean;
  hiddenReason: string | null;
  createdAt: string | null;
};

export type Tag = {
  id: string;
  slug: string;
  name: string;
  color: string;
  isPublic: boolean;
};

export type ChangelogEntry = {
  id: string;
  title: string;
  body: string;
  postIds: string[];
  publishedAt: string | null;
  author: PersonRef;
};
