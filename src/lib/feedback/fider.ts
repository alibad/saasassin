import { FIDER_STATUS_CODES } from "./model";
import type { Board, Comment, Post, Tag, Vote } from "./types";

/**
 * Maps a SaaSassin Feedback workspace onto Fider's relational shape so it can be
 * loaded upstream. Fider hosts exactly one board per site, so each board becomes one
 * Fider "instance" with its own users/posts/post_votes/comments/tags/post_tags tables
 * using Fider's column names and integer status codes. Integer ids are assigned
 * deterministically (stable across repeated exports of the same data).
 */

export const FIDER_MAPPING_VERSION = "1.0.0";

export type FiderUser = { id: number; name: string; email: string; role: number; external_ref: string };
export type FiderPost = {
  id: number;
  number: number;
  title: string;
  slug: string;
  description: string;
  status: number;
  user_id: number;
  created_at: string | null;
  response: string | null;
  response_user_id: number | null;
  response_date: string | null;
  original_id: number | null;
};
export type FiderInstance = {
  board: { id: string; slug: string; name: string };
  tables: {
    users: FiderUser[];
    posts: FiderPost[];
    post_votes: { post_id: number; user_id: number; created_at: string | null }[];
    comments: { id: number; post_id: number; user_id: number; content: string; created_at: string | null }[];
    tags: { id: number; name: string; slug: string; color: string; is_public: boolean }[];
    post_tags: { post_id: number; tag_id: number }[];
  };
  skipped: { type: string; id: string; reason: string }[];
};

/** Fider roles: 1 visitor, 2 collaborator, 3 administrator. */
const FIDER_ROLE: Record<string, number> = { owner: 3, admin: 3, member: 2, viewer: 1 };

export function toFiderInstances(input: {
  boards: Board[];
  posts: Post[];
  votes: Vote[];
  comments: Comment[];
  tags: Tag[];
  members: { uid: string; email: string; name: string; role: string }[];
}): { schema: string; version: string; instances: FiderInstance[] } {
  const tagsSorted = [...input.tags].sort((a, b) => a.slug.localeCompare(b.slug));
  const instances = [...input.boards]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((board) => {
      const posts = input.posts.filter((post) => post.boardId === board.id).sort((a, b) => a.number - b.number);
      const postIds = new Set(posts.map((post) => post.id));
      const votes = input.votes.filter((vote) => postIds.has(vote.postId));
      const comments = input.comments.filter((comment) => postIds.has(comment.postId));
      const skipped: FiderInstance["skipped"] = [];

      // Users: staff members first, then every author/voter/commenter seen on this board.
      const userIndex = new Map<string, FiderUser>();
      const addUser = (uid: string, name: string, email: string, role: number) => {
        const existing = userIndex.get(uid);
        if (existing) {
          if (!existing.email && email) existing.email = email;
          if (role > existing.role) existing.role = role;
          return existing.id;
        }
        const user: FiderUser = { id: 0, name: name || "Anonymous", email, role, external_ref: uid };
        userIndex.set(uid, user);
        return 0;
      };
      for (const member of input.members) addUser(member.uid, member.name || member.email, member.email, FIDER_ROLE[member.role] ?? 1);
      for (const post of posts) addUser(post.author.uid, post.author.name, "", 1);
      for (const vote of votes) addUser(vote.uid, vote.name, vote.email, 1);
      for (const comment of comments) addUser(comment.author.uid, comment.author.name, "", 1);
      const users = [...userIndex.values()].sort((a, b) => a.external_ref.localeCompare(b.external_ref));
      users.forEach((user, index) => { user.id = index + 1; });
      const userId = (uid: string) => userIndex.get(uid)?.id ?? 0;

      const postId = new Map(posts.map((post, index) => [post.id, index + 1]));
      const tagId = new Map(tagsSorted.map((tag, index) => [tag.id, index + 1]));

      const fiderPosts: FiderPost[] = posts.map((post) => {
        let originalId: number | null = null;
        if (post.originalId) {
          originalId = postId.get(post.originalId) ?? null;
          if (originalId === null) skipped.push({ type: "post.original", id: post.id, reason: "Canonical post lives on another board; Fider cannot link across sites." });
        }
        return {
          id: postId.get(post.id)!,
          number: post.number,
          title: post.title,
          slug: post.slug,
          description: post.description,
          status: FIDER_STATUS_CODES[post.status],
          user_id: userId(post.author.uid),
          created_at: post.createdAt,
          response: post.response?.text ?? null,
          response_user_id: post.response ? userId(post.response.by.uid) || null : null,
          response_date: post.response?.at ?? null,
          original_id: originalId,
        };
      });

      const seenVotes = new Set<string>();
      const post_votes = votes
        .filter((vote) => {
          const key = `${vote.postId}:${vote.uid}`;
          if (seenVotes.has(key)) return false;
          seenVotes.add(key);
          return true;
        })
        .map((vote) => ({ post_id: postId.get(vote.postId)!, user_id: userId(vote.uid), created_at: vote.createdAt }))
        .sort((a, b) => a.post_id - b.post_id || a.user_id - b.user_id);

      const fiderComments = [...comments]
        .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id))
        .map((comment, index) => ({
          id: index + 1,
          post_id: postId.get(comment.postId)!,
          user_id: userId(comment.author.uid),
          content: comment.content,
          created_at: comment.createdAt,
        }));

      const post_tags = posts.flatMap((post) =>
        post.tags.flatMap((tag) => {
          const id = tagId.get(tag);
          if (!id) {
            skipped.push({ type: "post_tag", id: `${post.id}:${tag}`, reason: "Tag no longer exists." });
            return [];
          }
          return [{ post_id: postId.get(post.id)!, tag_id: id }];
        }),
      );

      for (const post of posts.filter((entry) => entry.hidden)) {
        skipped.push({ type: "post.hidden", id: post.id, reason: "Hidden by moderation; exported with its status so it can be deleted upstream if desired." });
      }

      return {
        board: { id: board.id, slug: board.slug, name: board.name },
        tables: {
          users,
          posts: fiderPosts,
          post_votes,
          comments: fiderComments,
          tags: tagsSorted.map((tag) => ({ id: tagId.get(tag.id)!, name: tag.name, slug: tag.slug, color: tag.color.replace(/^#/, ""), is_public: tag.isPublic })),
          post_tags,
        },
        skipped,
      };
    });

  return { schema: "net.saasassin.feedback.fider-mapping", version: FIDER_MAPPING_VERSION, instances };
}
