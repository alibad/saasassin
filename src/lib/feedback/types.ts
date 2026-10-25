import type { PostStatus } from "./model";

/** JSON-safe records as served to the browser and written to exports (timestamps are ISO strings). */

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
  author: { uid: string; name: string };
  voteCount: number;
  commentCount: number;
  response: { text: string; by: { uid: string; name: string }; at: string } | null;
  statusHistory: StatusEvent[];
  originalId: string | null;
  hidden: boolean;
  hiddenReason: string | null;
  createdAt: string | null;
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
  author: { uid: string; name: string };
  content: string;
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
  author: { uid: string; name: string };
};
