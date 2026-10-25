import "server-only";

import { FieldValue, type DocumentData, type DocumentSnapshot } from "firebase-admin/firestore";

import {
  appendAuditEvent,
  auditPayload,
  db,
  listAuditEvents,
  listTenantMembers,
  tenantCollection,
  tenantRef,
} from "@/lib/fleet/platform/tenants";
import { FleetError, type FleetUser } from "@/lib/fleet/platform/session";
import { toPortable } from "@/lib/fleet/platform/export";

import { canAddVote, checkMerge, checkTransition, isPostStatus, slugify, type PostStatus } from "./model";
import type { Board, ChangelogEntry, Comment, Post, StatusEvent, Tag, Vote } from "./types";
import { importedPostId, type CannyMapResult } from "./canny";
import { planVoteMerge, toggleVote, voteDocId } from "./votes";

export const PRODUCT = "feedback";

const col = (tenantId: string, name: string) => tenantCollection(PRODUCT, tenantId, name);

function iso(value: unknown): string | null {
  const portable = toPortable(value);
  return typeof portable === "string" ? portable : null;
}

function displayName(user: FleetUser) {
  return user.name || user.email.split("@")[0] || "Member";
}

export function toBoard(doc: DocumentSnapshot): Board {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    slug: String(data.slug ?? ""),
    name: String(data.name ?? "Untitled board"),
    description: String(data.description ?? ""),
    isPublic: data.isPublic !== false,
    createdAt: iso(data.createdAt),
  };
}

export function toPost(doc: DocumentSnapshot): Post {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    number: Number(data.number ?? 0),
    boardId: String(data.boardId ?? ""),
    title: String(data.title ?? ""),
    slug: String(data.slug ?? ""),
    description: String(data.description ?? ""),
    status: isPostStatus(data.status) ? data.status : "open",
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    author: { uid: String(data.author?.uid ?? ""), name: String(data.author?.name ?? "Anonymous") },
    voteCount: Number(data.voteCount ?? 0),
    commentCount: Number(data.commentCount ?? 0),
    response: data.response
      ? { text: String(data.response.text ?? ""), by: data.response.by, at: iso(data.response.at) ?? "" }
      : null,
    statusHistory: (Array.isArray(data.statusHistory) ? data.statusHistory : []) as StatusEvent[],
    originalId: data.originalId ? String(data.originalId) : null,
    hidden: data.hidden === true,
    hiddenReason: data.hiddenReason ? String(data.hiddenReason) : null,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  };
}

function toVote(doc: DocumentSnapshot): Vote {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    postId: String(data.postId ?? ""),
    uid: String(data.uid ?? ""),
    name: String(data.name ?? ""),
    email: String(data.email ?? ""),
    createdAt: iso(data.createdAt),
    movedFrom: data.movedFrom ? String(data.movedFrom) : null,
  };
}

function toComment(doc: DocumentSnapshot): Comment {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    postId: String(data.postId ?? ""),
    author: { uid: String(data.author?.uid ?? ""), name: String(data.author?.name ?? "Anonymous") },
    content: String(data.content ?? ""),
    internal: data.internal === true,
    hidden: data.hidden === true,
    hiddenReason: data.hiddenReason ? String(data.hiddenReason) : null,
    createdAt: iso(data.createdAt),
  };
}

function toTag(doc: DocumentSnapshot): Tag {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    slug: String(data.slug ?? ""),
    name: String(data.name ?? ""),
    color: String(data.color ?? "#27c7a6"),
    isPublic: data.isPublic !== false,
  };
}

function toChangelog(doc: DocumentSnapshot): ChangelogEntry {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    title: String(data.title ?? ""),
    body: String(data.body ?? ""),
    postIds: Array.isArray(data.postIds) ? data.postIds.map(String) : [],
    publishedAt: iso(data.publishedAt),
    author: { uid: String(data.author?.uid ?? ""), name: String(data.author?.name ?? "") },
  };
}

/* ------------------------------------------------------------------ public reads */

async function requireTenantExists(tenantId: string) {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(tenantId)) throw new FleetError("Feedback portal not found.", 404);
  const tenant = await tenantRef(PRODUCT, tenantId).get();
  if (!tenant.exists) throw new FleetError("Feedback portal not found.", 404);
  return { id: tenant.id, name: String(tenant.get("name") ?? "Feedback") };
}

async function findPublicBoard(tenantId: string, boardSlug: string) {
  const snapshot = await col(tenantId, "boards").where("slug", "==", boardSlug).limit(1).get();
  const doc = snapshot.docs[0];
  if (!doc || doc.get("isPublic") === false) throw new FleetError("Board not found.", 404);
  return toBoard(doc);
}

export type PublicPost = Omit<Post, "statusHistory" | "hiddenReason"> & { statusHistory: StatusEvent[] };

function publicPost(post: Post): PublicPost {
  const { hiddenReason: _hiddenReason, ...rest } = post;
  void _hiddenReason;
  return rest;
}

export async function loadPublicPortal(tenantId: string) {
  const tenant = await requireTenantExists(tenantId);
  const [boardSnap, postSnap, changelogSnap, tagSnap] = await Promise.all([
    col(tenantId, "boards").get(),
    col(tenantId, "posts").where("status", "in", ["planned", "started", "completed"]).get(),
    col(tenantId, "changelog").orderBy("publishedAt", "desc").limit(50).get(),
    col(tenantId, "tags").get(),
  ]);
  const boards = boardSnap.docs.map(toBoard).filter((board) => board.isPublic).sort((a, b) => a.name.localeCompare(b.name));
  const publicBoardIds = new Set(boards.map((board) => board.id));
  const posts = postSnap.docs
    .map(toPost)
    .filter((post) => !post.hidden && publicBoardIds.has(post.boardId))
    .sort((a, b) => b.voteCount - a.voteCount)
    .map(publicPost);
  const postTitles = new Map(posts.map((post) => [post.id, post]));
  const changelog = changelogSnap.docs.map(toChangelog).map((entry) => ({
    ...entry,
    posts: entry.postIds.flatMap((id) => {
      const post = postTitles.get(id);
      return post ? [{ id: post.id, number: post.number, title: post.title, boardId: post.boardId }] : [];
    }),
  }));
  const tags = tagSnap.docs.map(toTag).filter((tag) => tag.isPublic);
  return { tenant, boards, posts, changelog, tags };
}

export async function loadPublicBoard(tenantId: string, boardSlug: string, viewer: FleetUser | null) {
  const tenant = await requireTenantExists(tenantId);
  const board = await findPublicBoard(tenantId, boardSlug);
  const [postSnap, tagSnap, voteSnap] = await Promise.all([
    col(tenantId, "posts").where("boardId", "==", board.id).get(),
    col(tenantId, "tags").get(),
    viewer ? col(tenantId, "votes").where("uid", "==", viewer.uid).get() : Promise.resolve(null),
  ]);
  const posts = postSnap.docs.map(toPost).filter((post) => !post.hidden).map(publicPost);
  const tags = tagSnap.docs.map(toTag).filter((tag) => tag.isPublic);
  const publicTagIds = new Set(tags.map((tag) => tag.id));
  for (const post of posts) post.tags = post.tags.filter((tag) => publicTagIds.has(tag));
  const viewerVotes = voteSnap ? voteSnap.docs.map((doc) => String(doc.get("postId"))) : [];
  return {
    tenant,
    board,
    posts,
    tags,
    viewer: viewer ? { uid: viewer.uid, name: displayName(viewer), votes: viewerVotes } : null,
  };
}

async function requirePublicPost(tenantId: string, postId: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(postId)) throw new FleetError("Post not found.", 404);
  const doc = await col(tenantId, "posts").doc(postId).get();
  if (!doc.exists) throw new FleetError("Post not found.", 404);
  const post = toPost(doc);
  if (post.hidden) throw new FleetError("Post not found.", 404);
  const board = await col(tenantId, "boards").doc(post.boardId).get();
  if (!board.exists || board.get("isPublic") === false) throw new FleetError("Post not found.", 404);
  return post;
}

export async function loadPublicPost(tenantId: string, postId: string) {
  await requireTenantExists(tenantId);
  const post = await requirePublicPost(tenantId, postId);
  const commentSnap = await col(tenantId, "comments").where("postId", "==", postId).get();
  const comments = commentSnap.docs
    .map(toComment)
    .filter((comment) => !comment.hidden && !comment.internal)
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
    .map(({ hiddenReason: _reason, internal: _internal, ...comment }) => { void _reason; void _internal; return comment; });
  let original: { id: string; number: number; title: string } | null = null;
  if (post.originalId) {
    const doc = await col(tenantId, "posts").doc(post.originalId).get();
    if (doc.exists && doc.get("hidden") !== true) original = { id: doc.id, number: Number(doc.get("number")), title: String(doc.get("title")) };
  }
  return { post: publicPost(post), comments, original };
}

/* --------------------------------------------------------- signed-in participation */

export async function createPost(tenantId: string, boardSlug: string, user: FleetUser, input: { title: string; description: string }) {
  await requireTenantExists(tenantId);
  const board = await findPublicBoard(tenantId, boardSlug);
  const counter = col(tenantId, "counters").doc("posts");
  const postRef = col(tenantId, "posts").doc();
  const name = displayName(user);
  const number = await db().runTransaction(async (tx) => {
    const current = await tx.get(counter);
    const next = Number(current.get("value") ?? 0) + 1;
    const now = FieldValue.serverTimestamp();
    tx.set(counter, { value: next }, { merge: true });
    tx.set(postRef, {
      number: next,
      boardId: board.id,
      title: input.title,
      slug: slugify(input.title),
      description: input.description,
      status: "open",
      tags: [],
      author: { uid: user.uid, name },
      voteCount: 1,
      commentCount: 0,
      response: null,
      statusHistory: [],
      originalId: null,
      hidden: false,
      createdAt: now,
      updatedAt: now,
    });
    // Like Fider, the author automatically supports their own post.
    tx.set(col(tenantId, "votes").doc(voteDocId(postRef.id, user.uid)), {
      postId: postRef.id, uid: user.uid, name, email: user.email, createdAt: now,
    });
    tx.set(col(tenantId, "auditEvents").doc(), auditPayload(user, "post.created", { type: "post", id: postRef.id }, { number: next, boardId: board.id, title: input.title }));
    return next;
  });
  return { id: postRef.id, number };
}

export async function toggleVoteForUser(tenantId: string, postId: string, user: FleetUser) {
  await requireTenantExists(tenantId);
  await requirePublicPost(tenantId, postId);
  const postRef = col(tenantId, "posts").doc(postId);
  const voteRef = col(tenantId, "votes").doc(voteDocId(postId, user.uid));
  return db().runTransaction(async (tx) => {
    const [post, vote] = await Promise.all([tx.get(postRef), tx.get(voteRef)]);
    if (!post.exists || post.get("hidden") === true) throw new FleetError("Post not found.", 404);
    const status = isPostStatus(post.get("status")) ? (post.get("status") as PostStatus) : "open";
    const outcome = toggleVote(vote.exists, Number(post.get("voteCount") ?? 0), canAddVote(status));
    if ("error" in outcome) throw new FleetError(outcome.error, 409);
    if (outcome.op === "add") {
      tx.set(voteRef, { postId, uid: user.uid, name: displayName(user), email: user.email, createdAt: FieldValue.serverTimestamp() });
    } else {
      tx.delete(voteRef);
    }
    tx.update(postRef, { voteCount: outcome.voteCount });
    tx.set(col(tenantId, "auditEvents").doc(), auditPayload(user, outcome.op === "add" ? "vote.added" : "vote.removed", { type: "post", id: postId }, { voteCount: outcome.voteCount }));
    return { voted: outcome.voted, voteCount: outcome.voteCount };
  });
}

export async function addComment(tenantId: string, postId: string, user: FleetUser, content: string) {
  await requireTenantExists(tenantId);
  const post = await requirePublicPost(tenantId, postId);
  if (post.status === "duplicate") throw new FleetError("This post was merged; comment on the original instead.", 409);
  const commentRef = col(tenantId, "comments").doc();
  const batch = db().batch();
  batch.set(commentRef, {
    postId, author: { uid: user.uid, name: displayName(user) }, content, hidden: false, createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(col(tenantId, "posts").doc(postId), { commentCount: FieldValue.increment(1) });
  batch.set(col(tenantId, "auditEvents").doc(), auditPayload(user, "comment.created", { type: "comment", id: commentRef.id }, { postId }));
  await batch.commit();
  return { id: commentRef.id };
}

/* ------------------------------------------------------------------ team (admin) */

export async function loadAdminSnapshot(tenantId: string) {
  const [boards, posts, tags, changelog, members, audit] = await Promise.all([
    col(tenantId, "boards").get(),
    col(tenantId, "posts").get(),
    col(tenantId, "tags").get(),
    col(tenantId, "changelog").orderBy("publishedAt", "desc").get(),
    listTenantMembers(PRODUCT, tenantId),
    listAuditEvents(PRODUCT, tenantId, 100),
  ]);
  return {
    boards: boards.docs.map(toBoard).sort((a, b) => a.name.localeCompare(b.name)),
    posts: posts.docs.map(toPost).sort((a, b) => b.number - a.number),
    tags: tags.docs.map(toTag).sort((a, b) => a.name.localeCompare(b.name)),
    changelog: changelog.docs.map(toChangelog),
    members: members.filter((member) => member.status === "active"),
    audit,
  };
}

export async function createBoard(tenantId: string, user: FleetUser, input: { name: string; slug?: string; description: string; isPublic: boolean }) {
  const slug = slugify(input.slug || input.name);
  const existing = await col(tenantId, "boards").where("slug", "==", slug).limit(1).get();
  if (!existing.empty) throw new FleetError("A board with that address already exists.", 409);
  const ref = await col(tenantId, "boards").add({ ...input, slug, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid });
  await appendAuditEvent(PRODUCT, tenantId, user, "board.created", { type: "board", id: ref.id }, { slug, isPublic: input.isPublic });
  return { id: ref.id, slug };
}

export async function updateBoard(tenantId: string, user: FleetUser, boardId: string, input: { name?: string; description?: string; isPublic?: boolean }) {
  const ref = col(tenantId, "boards").doc(boardId);
  if (!(await ref.get()).exists) throw new FleetError("Board not found.", 404);
  await ref.update({ ...input, updatedAt: FieldValue.serverTimestamp() });
  await appendAuditEvent(PRODUCT, tenantId, user, "board.updated", { type: "board", id: boardId }, input);
}

export async function changeStatus(tenantId: string, user: FleetUser, postId: string, to: PostStatus, note: string) {
  const ref = col(tenantId, "posts").doc(postId);
  return db().runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new FleetError("Post not found.", 404);
    const post = toPost(doc);
    const check = checkTransition(post.status, to, note);
    if (!check.ok) throw new FleetError(check.reason, 409);
    const at = new Date().toISOString();
    const by = { uid: user.uid, name: displayName(user) };
    const event: StatusEvent = { from: post.status, to, note, by, at };
    tx.update(ref, {
      status: to,
      response: note ? { text: note, by, at } : post.response,
      statusHistory: FieldValue.arrayUnion(event),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(col(tenantId, "auditEvents").doc(), auditPayload(user, "post.status_changed", { type: "post", id: postId }, { from: post.status, to, note }));
    return { from: post.status, to };
  });
}

export async function mergePosts(tenantId: string, user: FleetUser, duplicateId: string, canonicalId: string, note: string) {
  const dupRef = col(tenantId, "posts").doc(duplicateId);
  const canRef = col(tenantId, "posts").doc(canonicalId);
  const votes = col(tenantId, "votes");
  return db().runTransaction(async (tx) => {
    const [dupDoc, canDoc, dupVotes, canVotes] = await Promise.all([
      tx.get(dupRef),
      tx.get(canRef),
      tx.get(votes.where("postId", "==", duplicateId)),
      tx.get(votes.where("postId", "==", canonicalId)),
    ]);
    if (!dupDoc.exists || !canDoc.exists) throw new FleetError("Post not found.", 404);
    const duplicate = toPost(dupDoc);
    const canonical = toPost(canDoc);
    const check = checkMerge(duplicate, canonical);
    if (!check.ok) throw new FleetError(check.reason, 409);
    const plan = planVoteMerge(dupVotes.docs.map(toVote), canVotes.docs.map(toVote));
    const votesByUid = new Map(dupVotes.docs.map((doc) => [String(doc.get("uid")), doc]));
    for (const voter of plan.moves) {
      const original = votesByUid.get(voter.uid);
      tx.set(votes.doc(voteDocId(canonicalId, voter.uid)), {
        postId: canonicalId,
        uid: voter.uid,
        name: voter.name,
        email: original?.get("email") ?? "",
        createdAt: original?.get("createdAt") ?? FieldValue.serverTimestamp(),
        movedFrom: duplicateId,
      });
    }
    for (const doc of dupVotes.docs) tx.delete(doc.ref);
    const at = new Date().toISOString();
    const by = { uid: user.uid, name: displayName(user) };
    const text = note || `Merged into #${canonical.number} ${canonical.title}`;
    tx.update(dupRef, {
      status: "duplicate",
      originalId: canonicalId,
      voteCount: 0,
      response: { text, by, at },
      statusHistory: FieldValue.arrayUnion({ from: duplicate.status, to: "duplicate", note: text, by, at }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    // Imported (Canny) vote counts have no voter identities; carry them over as a separate tally.
    const importedVotes = Number(canDoc.get("importedVotes") ?? 0) + Number(dupDoc.get("importedVotes") ?? 0);
    tx.update(canRef, { voteCount: plan.canonicalVoteCount + importedVotes, importedVotes, updatedAt: FieldValue.serverTimestamp() });
    tx.set(col(tenantId, "auditEvents").doc(), auditPayload(user, "post.merged", { type: "post", id: duplicateId }, {
      canonicalId, movedVotes: plan.moves.length, overlappingVotes: plan.overlapping.length, canonicalVoteCount: plan.canonicalVoteCount,
    }));
    return { moved: plan.moves.length, overlapping: plan.overlapping.length, canonicalVoteCount: plan.canonicalVoteCount };
  });
}

export async function setPostTags(tenantId: string, user: FleetUser, postId: string, tagIds: string[]) {
  const [post, tagSnap] = await Promise.all([col(tenantId, "posts").doc(postId).get(), col(tenantId, "tags").get()]);
  if (!post.exists) throw new FleetError("Post not found.", 404);
  const known = new Set(tagSnap.docs.map((doc) => doc.id));
  const tags = [...new Set(tagIds)].filter((id) => known.has(id));
  await post.ref.update({ tags, updatedAt: FieldValue.serverTimestamp() });
  await appendAuditEvent(PRODUCT, tenantId, user, "post.tagged", { type: "post", id: postId }, { tags });
  return { tags };
}

export async function moderate(tenantId: string, user: FleetUser, input: { kind: "post" | "comment"; id: string; hidden: boolean; reason: string }) {
  const ref = col(tenantId, input.kind === "post" ? "posts" : "comments").doc(input.id);
  const doc = await ref.get();
  if (!doc.exists) throw new FleetError("Not found.", 404);
  const batch = db().batch();
  batch.update(ref, { hidden: input.hidden, hiddenReason: input.hidden ? input.reason : null, moderatedAt: FieldValue.serverTimestamp(), moderatedBy: user.uid });
  if (input.kind === "comment" && doc.get("internal") !== true && (doc.get("hidden") === true) !== input.hidden) {
    batch.update(col(tenantId, "posts").doc(String(doc.get("postId"))), { commentCount: FieldValue.increment(input.hidden ? -1 : 1) });
  }
  batch.set(col(tenantId, "auditEvents").doc(), auditPayload(user, input.hidden ? `${input.kind}.hidden` : `${input.kind}.restored`, { type: input.kind, id: input.id }, { reason: input.reason }));
  await batch.commit();
}

/** Staff edit of a post's wording (typos, clarity). The previous wording is kept in the audit event. */
export async function editPost(tenantId: string, user: FleetUser, postId: string, input: { title: string; description: string }) {
  const ref = col(tenantId, "posts").doc(postId);
  const doc = await ref.get();
  if (!doc.exists) throw new FleetError("Post not found.", 404);
  await ref.update({ title: input.title, slug: slugify(input.title), description: input.description, updatedAt: FieldValue.serverTimestamp() });
  await appendAuditEvent(PRODUCT, tenantId, user, "post.edited", { type: "post", id: postId }, {
    previous: { title: String(doc.get("title") ?? ""), description: String(doc.get("description") ?? "") },
  });
  return { ok: true };
}

/** Team-only note on a post; does not change the public comment count. */
export async function addInternalNote(tenantId: string, user: FleetUser, postId: string, content: string) {
  const post = await col(tenantId, "posts").doc(postId).get();
  if (!post.exists) throw new FleetError("Post not found.", 404);
  const ref = col(tenantId, "comments").doc();
  await ref.set({ postId, author: { uid: user.uid, name: displayName(user) }, content, internal: true, hidden: false, createdAt: FieldValue.serverTimestamp() });
  await appendAuditEvent(PRODUCT, tenantId, user, "note.created", { type: "comment", id: ref.id }, { postId });
  return { id: ref.id };
}

export async function listComments(tenantId: string, postId: string) {
  const snapshot = await col(tenantId, "comments").where("postId", "==", postId).get();
  return snapshot.docs.map(toComment).sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

export async function listVoters(tenantId: string, postId: string) {
  const snapshot = await col(tenantId, "votes").where("postId", "==", postId).get();
  return snapshot.docs.map(toVote).sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

export async function createTag(tenantId: string, user: FleetUser, input: { name: string; color: string; isPublic: boolean }) {
  const slug = slugify(input.name);
  const existing = await col(tenantId, "tags").where("slug", "==", slug).limit(1).get();
  if (!existing.empty) throw new FleetError("A tag with that name already exists.", 409);
  const ref = await col(tenantId, "tags").add({ ...input, slug, createdAt: FieldValue.serverTimestamp() });
  await appendAuditEvent(PRODUCT, tenantId, user, "tag.created", { type: "tag", id: ref.id }, { slug });
  return { id: ref.id, slug };
}

export async function createChangelogEntry(tenantId: string, user: FleetUser, input: { title: string; body: string; postIds: string[] }) {
  const postIds = [...new Set(input.postIds)];
  const posts = await Promise.all(postIds.map((id) => col(tenantId, "posts").doc(id).get()));
  for (const post of posts) {
    if (!post.exists) throw new FleetError("A linked post no longer exists.", 404);
    if (post.get("status") !== "completed") throw new FleetError(`#${post.get("number")} is not completed yet; only shipped work belongs in the changelog.`, 409);
  }
  const ref = await col(tenantId, "changelog").add({
    ...input, postIds, author: { uid: user.uid, name: displayName(user) }, publishedAt: FieldValue.serverTimestamp(),
  });
  await appendAuditEvent(PRODUCT, tenantId, user, "changelog.published", { type: "changelog", id: ref.id }, { postIds });
  return { id: ref.id };
}

/* ------------------------------------------------------------------- Canny import */

/**
 * Applies a previewed Canny mapping. Idempotent: each row gets a deterministic post id from
 * its Canny source key, so re-running the same file skips rows already imported. Canny's
 * export carries vote counts but not voter identities; those are kept as `importedVotes`.
 * New boards and tags are created private so nothing is published by an import.
 */
export async function commitCannyImport(tenantId: string, user: FleetUser, mapping: CannyMapResult) {
  const [boardSnap, tagSnap] = await Promise.all([col(tenantId, "boards").get(), col(tenantId, "tags").get()]);
  const boardsBySlug = new Map(boardSnap.docs.map((doc) => [String(doc.get("slug")), doc.id]));
  const tagsBySlug = new Map(tagSnap.docs.map((doc) => [String(doc.get("slug")), doc.id]));
  const now = FieldValue.serverTimestamp();
  let createdBoards = 0;
  let createdTags = 0;

  for (const board of mapping.boards) {
    if (boardsBySlug.has(board.slug)) continue;
    const ref = col(tenantId, "boards").doc();
    await ref.set({ name: board.name, slug: board.slug, description: "Imported from Canny", isPublic: false, createdAt: now, createdBy: user.uid });
    boardsBySlug.set(board.slug, ref.id);
    createdBoards += 1;
  }
  for (const name of new Set(mapping.posts.flatMap((post) => post.tags))) {
    const slug = slugify(name);
    if (tagsBySlug.has(slug)) continue;
    const ref = col(tenantId, "tags").doc();
    await ref.set({ name, slug, color: "#7a7a72", isPublic: false, createdAt: now });
    tagsBySlug.set(slug, ref.id);
    createdTags += 1;
  }

  const existing = new Set<string>();
  const ids = mapping.posts.map((post) => importedPostId(post.sourceKey));
  for (let index = 0; index < ids.length; index += 100) {
    const refs = ids.slice(index, index + 100).map((id) => col(tenantId, "posts").doc(id));
    const docs = await db().getAll(...refs);
    for (const doc of docs) if (doc.exists) existing.add(doc.id);
  }
  const fresh = mapping.posts.filter((post) => !existing.has(importedPostId(post.sourceKey)));
  const counter = col(tenantId, "counters").doc("posts");
  const start = await db().runTransaction(async (tx) => {
    const current = Number((await tx.get(counter)).get("value") ?? 0);
    tx.set(counter, { value: current + fresh.length }, { merge: true });
    return current;
  });

  for (let index = 0; index < fresh.length; index += 400) {
    const batch = db().batch();
    fresh.slice(index, index + 400).forEach((post, offset) => {
      batch.set(col(tenantId, "posts").doc(importedPostId(post.sourceKey)), {
        number: start + index + offset + 1,
        boardId: boardsBySlug.get(post.boardSlug) ?? "",
        title: post.title,
        slug: slugify(post.title),
        description: post.description,
        status: post.status,
        tags: post.tags.map((tag) => tagsBySlug.get(slugify(tag))).filter(Boolean),
        author: { uid: `canny:${post.authorEmail || slugify(post.authorName)}`, name: post.authorName },
        voteCount: post.voteCount,
        importedVotes: post.voteCount,
        commentCount: 0,
        response: null,
        statusHistory: [],
        originalId: null,
        hidden: false,
        provenance: { source: "canny", sourceKey: post.sourceKey, sourceUrl: post.sourceUrl, cannyStatus: post.cannyStatus, authorEmail: post.authorEmail, line: post.line },
        createdAt: post.createdAt ? new Date(post.createdAt) : now,
        updatedAt: now,
      });
    });
    await batch.commit();
  }

  const skippedExisting = mapping.posts.length - fresh.length;
  const importRef = col(tenantId, "imports").doc();
  await importRef.set({
    source: "canny",
    createdAt: now,
    by: { uid: user.uid, email: user.email },
    rows: mapping.posts.length,
    created: fresh.length,
    skippedExisting,
    createdBoards,
    createdTags,
    problems: mapping.problems.slice(0, 200),
  });
  await appendAuditEvent(PRODUCT, tenantId, user, "import.canny_committed", { type: "import", id: importRef.id }, {
    created: fresh.length, skippedExisting, createdBoards, createdTags, problems: mapping.problems.length,
  });
  return { created: fresh.length, skippedExisting, createdBoards, createdTags };
}

/* ------------------------------------------------------------------- export */

export const EXPORT_COLLECTIONS = ["boards", "posts", "votes", "comments", "tags", "changelog", "imports"] as const;

export async function loadAllRecords(tenantId: string) {
  const entries = await Promise.all(
    EXPORT_COLLECTIONS.map(async (name) => {
      const snapshot = await col(tenantId, name).get();
      return [name, snapshot.docs.map((doc) => ({ id: doc.id, ...(toPortable(doc.data()) as DocumentData) }))] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as Record<(typeof EXPORT_COLLECTIONS)[number], DocumentData[]>;
}

export async function loadTypedRecords(tenantId: string) {
  const [boards, posts, votes, comments, tags] = await Promise.all([
    col(tenantId, "boards").get(),
    col(tenantId, "posts").get(),
    col(tenantId, "votes").get(),
    col(tenantId, "comments").get(),
    col(tenantId, "tags").get(),
  ]);
  return {
    boards: boards.docs.map(toBoard),
    posts: posts.docs.map(toPost),
    votes: votes.docs.map(toVote),
    comments: comments.docs.map(toComment),
    tags: tags.docs.map(toTag),
  };
}
