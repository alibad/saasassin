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
import type { Board, ChangelogEntry, Comment, Initiative, Post, StatusEvent, Tag, Vote, VoterProfile } from "./types";
import { randomBytes } from "node:crypto";

import { importedPostId, type CannyMapResult } from "./canny";
import { classifyDelivery, SIGNATURE_HEADER, signatureHeader, validateWebhookUrl, WEBHOOK_EVENTS, type WebhookEvent } from "./webhooks";
import { planUnmerge, planVoteMerge, toggleVote, voteDocId, type MergeRecord } from "./votes";

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
    hasMergeRecord: Boolean(data.mergeRecord?.canonicalId),
    owner: data.owner?.uid ? { uid: String(data.owner.uid), name: String(data.owner.name ?? "") } : null,
    initiativeId: data.initiativeId ? String(data.initiativeId) : null,
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

function toInitiative(doc: DocumentSnapshot): Initiative {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    name: String(data.name ?? ""),
    description: String(data.description ?? ""),
    kind: data.kind === "release" ? "release" : "initiative",
    targetDate: data.targetDate ? String(data.targetDate) : null,
    isPublic: data.isPublic !== false,
    createdAt: iso(data.createdAt),
  };
}

function toProfile(doc: DocumentSnapshot): VoterProfile {
  const data = doc.data() ?? {};
  return {
    uid: doc.id,
    name: String(data.name ?? ""),
    email: String(data.email ?? ""),
    company: String(data.company ?? ""),
    segment: String(data.segment ?? ""),
    updatedAt: iso(data.updatedAt),
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

/** Public payloads carry display names only; account uids stay server-side. */
const anonymize = (person: { uid: string; name: string } | undefined) => ({ uid: "", name: person?.name ?? "Team" });

function publicPost(post: Post): PublicPost {
  const { hiddenReason: _hiddenReason, ...rest } = post;
  void _hiddenReason;
  return {
    ...rest,
    author: anonymize(rest.author),
    owner: rest.owner ? anonymize(rest.owner) : null,
    response: rest.response ? { ...rest.response, by: anonymize(rest.response.by) } : null,
    statusHistory: rest.statusHistory.map((event) => ({ ...event, by: anonymize(event.by) })),
  };
}

export async function loadPublicPortal(tenantId: string) {
  const tenant = await requireTenantExists(tenantId);
  const [boardSnap, postSnap, changelogSnap, tagSnap, initiativeSnap] = await Promise.all([
    col(tenantId, "boards").get(),
    col(tenantId, "posts").where("status", "in", ["planned", "started", "completed"]).get(),
    col(tenantId, "changelog").orderBy("publishedAt", "desc").limit(50).get(),
    col(tenantId, "tags").get(),
    col(tenantId, "initiatives").get(),
  ]);
  const initiatives = initiativeSnap.docs.map(toInitiative).filter((initiative) => initiative.isPublic);
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
  const publicInitiativeIds = new Set(initiatives.map((initiative) => initiative.id));
  for (const post of posts) if (post.initiativeId && !publicInitiativeIds.has(post.initiativeId)) post.initiativeId = null;
  return { tenant, boards, posts, changelog, tags, initiatives };
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
    .map(({ hiddenReason: _reason, internal: _internal, ...comment }) => {
      void _reason;
      void _internal;
      return { ...comment, author: anonymize(comment.author) };
    });
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
  const [boards, posts, tags, changelog, members, audit, votes, profiles, initiatives] = await Promise.all([
    col(tenantId, "boards").get(),
    col(tenantId, "posts").get(),
    col(tenantId, "tags").get(),
    col(tenantId, "changelog").orderBy("publishedAt", "desc").get(),
    listTenantMembers(PRODUCT, tenantId),
    listAuditEvents(PRODUCT, tenantId, 100),
    col(tenantId, "votes").get(),
    col(tenantId, "profiles").get(),
    col(tenantId, "initiatives").get(),
  ]);
  return {
    votes: votes.docs.map((doc) => ({ postId: String(doc.get("postId")), uid: String(doc.get("uid")) })),
    profiles: profiles.docs.map(toProfile),
    initiatives: initiatives.docs.map(toInitiative),
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
    const overlap = new Set(plan.overlapping);
    const portableVoter = (vote: Vote) => ({ uid: vote.uid, name: vote.name, email: vote.email, createdAt: vote.createdAt });
    const mergeRecord: MergeRecord = {
      canonicalId,
      previousStatus: duplicate.status,
      moved: plan.moves.map((voter) => portableVoter(dupVotes.docs.map(toVote).find((vote) => vote.uid === voter.uid)!)),
      overlapping: dupVotes.docs.map(toVote).filter((vote) => overlap.has(vote.uid)).map(portableVoter),
      duplicateImportedVotes: Number(dupDoc.get("importedVotes") ?? 0),
      at,
    };
    tx.update(dupRef, {
      status: "duplicate",
      originalId: canonicalId,
      mergeRecord,
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

/**
 * Reverses a merge using the record stored at merge time: moved votes come back (unless the
 * voter has since removed them), voters who had voted on both get their duplicate vote back,
 * imported Canny totals return, and the post regains its pre-merge status.
 */
export async function unmergePost(tenantId: string, user: FleetUser, duplicateId: string) {
  const dupRef = col(tenantId, "posts").doc(duplicateId);
  const votes = col(tenantId, "votes");
  return db().runTransaction(async (tx) => {
    const dupDoc = await tx.get(dupRef);
    if (!dupDoc.exists) throw new FleetError("Post not found.", 404);
    const record = dupDoc.get("mergeRecord") as MergeRecord | undefined;
    if (dupDoc.get("status") !== "duplicate" || !record?.canonicalId) throw new FleetError("Only merged posts can be unmerged.", 409);
    const canRef = col(tenantId, "posts").doc(record.canonicalId);
    const [canDoc, canVotes] = await Promise.all([tx.get(canRef), tx.get(votes.where("postId", "==", record.canonicalId))]);
    const plan = planUnmerge(record, duplicateId, canVotes.docs.map(toVote));
    for (const uid of plan.removeFromCanonical) tx.delete(votes.doc(voteDocId(record.canonicalId, uid)));
    for (const voter of plan.restoreToDuplicate) {
      tx.set(votes.doc(voteDocId(duplicateId, voter.uid)), {
        postId: duplicateId,
        uid: voter.uid,
        name: voter.name,
        email: voter.email ?? "",
        createdAt: voter.createdAt ? new Date(voter.createdAt) : FieldValue.serverTimestamp(),
      });
    }
    const previous = isPostStatus(record.previousStatus) && record.previousStatus !== "duplicate" ? record.previousStatus : "open";
    const at = new Date().toISOString();
    const by = { uid: user.uid, name: displayName(user) };
    const canonicalNumber = canDoc.exists ? Number(canDoc.get("number")) : null;
    const text = canonicalNumber ? `Unmerged from #${canonicalNumber}` : "Unmerged";
    tx.update(dupRef, {
      status: previous,
      originalId: null,
      mergeRecord: FieldValue.delete(),
      voteCount: plan.restoreToDuplicate.length + record.duplicateImportedVotes,
      importedVotes: record.duplicateImportedVotes,
      response: { text, by, at },
      statusHistory: FieldValue.arrayUnion({ from: "duplicate", to: previous, note: text, by, at }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (canDoc.exists) {
      const canonicalImported = Math.max(0, Number(canDoc.get("importedVotes") ?? 0) - record.duplicateImportedVotes);
      tx.update(canRef, {
        voteCount: canVotes.size - plan.removeFromCanonical.length + canonicalImported,
        importedVotes: canonicalImported,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(col(tenantId, "auditEvents").doc(), auditPayload(user, "post.unmerged", { type: "post", id: duplicateId }, {
      canonicalId: record.canonicalId, restoredVotes: plan.restoreToDuplicate.length, droppedSinceMerge: plan.droppedSinceMerge.length, restoredStatus: previous,
    }));
    return { restoredVotes: plan.restoreToDuplicate.length, droppedSinceMerge: plan.droppedSinceMerge.length, status: previous };
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

/** Assigns a post to an active workspace member (or clears the owner). */
export async function assignPost(tenantId: string, user: FleetUser, postId: string, ownerUid: string | null) {
  const ref = col(tenantId, "posts").doc(postId);
  if (!(await ref.get()).exists) throw new FleetError("Post not found.", 404);
  let owner: { uid: string; name: string } | null = null;
  if (ownerUid) {
    const membership = await tenantRef(PRODUCT, tenantId).collection("memberships").doc(ownerUid).get();
    if (!membership.exists || membership.get("status") !== "active") throw new FleetError("Owners must be active workspace members.", 400);
    owner = { uid: ownerUid, name: String(membership.get("name") || membership.get("email") || "Member") };
  }
  await ref.update({ owner, updatedAt: FieldValue.serverTimestamp() });
  await appendAuditEvent(PRODUCT, tenantId, user, "post.assigned", { type: "post", id: postId }, { ownerUid });
  return { owner };
}

export async function setPostInitiative(tenantId: string, user: FleetUser, postId: string, initiativeId: string | null) {
  const ref = col(tenantId, "posts").doc(postId);
  if (!(await ref.get()).exists) throw new FleetError("Post not found.", 404);
  if (initiativeId && !(await col(tenantId, "initiatives").doc(initiativeId).get()).exists) throw new FleetError("Initiative not found.", 404);
  await ref.update({ initiativeId, updatedAt: FieldValue.serverTimestamp() });
  await appendAuditEvent(PRODUCT, tenantId, user, "post.initiative_set", { type: "post", id: postId }, { initiativeId });
  return { initiativeId };
}

export async function createInitiative(tenantId: string, user: FleetUser, input: { name: string; description: string; kind: "initiative" | "release"; targetDate: string | null; isPublic: boolean }) {
  const ref = await col(tenantId, "initiatives").add({ ...input, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid });
  await appendAuditEvent(PRODUCT, tenantId, user, "initiative.created", { type: "initiative", id: ref.id }, { kind: input.kind, name: input.name });
  return { id: ref.id };
}

/** Team-maintained customer context for a voter (company, segment), used to weigh demand. */
export async function upsertProfile(tenantId: string, user: FleetUser, uid: string, input: { company: string; segment: string }) {
  const vote = await col(tenantId, "votes").where("uid", "==", uid).limit(1).get();
  const known = vote.docs[0];
  const ref = col(tenantId, "profiles").doc(uid);
  const existing = await ref.get();
  if (!known && !existing.exists) throw new FleetError("Profiles can only be set for people who have voted here.", 404);
  await ref.set({
    uid,
    name: known?.get("name") ?? existing.get("name") ?? "",
    email: known?.get("email") ?? existing.get("email") ?? "",
    company: input.company,
    segment: input.segment,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
  }, { merge: true });
  await appendAuditEvent(PRODUCT, tenantId, user, "profile.updated", { type: "profile", id: uid }, input);
  return { uid };
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

/* ------------------------------------------------------------------- webhooks */

export type WebhookSummary = { id: string; url: string; events: WebhookEvent[]; active: boolean; secretHint: string; createdAt: string | null };

function toWebhook(doc: DocumentSnapshot): WebhookSummary {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    url: String(data.url ?? ""),
    events: (Array.isArray(data.events) ? data.events : []).filter((event: string) => (WEBHOOK_EVENTS as readonly string[]).includes(event)),
    active: data.active !== false,
    secretHint: `…${String(data.secret ?? "").slice(-4)}`,
    createdAt: iso(data.createdAt),
  };
}

/** Creates a webhook and returns its signing secret once; later reads only show a hint. */
export async function createWebhook(tenantId: string, user: FleetUser, input: { url: string; events: WebhookEvent[] }) {
  const check = validateWebhookUrl(input.url);
  if (!check.ok) throw new FleetError(check.reason, 400);
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const ref = await col(tenantId, "webhooks").add({ url: check.url, events: input.events, active: true, secret, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid });
  await appendAuditEvent(PRODUCT, tenantId, user, "webhook.created", { type: "webhook", id: ref.id }, { url: check.url, events: input.events });
  return { id: ref.id, secret };
}

export async function setWebhookActive(tenantId: string, user: FleetUser, webhookId: string, active: boolean) {
  const ref = col(tenantId, "webhooks").doc(webhookId);
  if (!(await ref.get()).exists) throw new FleetError("Webhook not found.", 404);
  await ref.update({ active });
  await appendAuditEvent(PRODUCT, tenantId, user, active ? "webhook.enabled" : "webhook.disabled", { type: "webhook", id: webhookId });
}

export async function listWebhooks(tenantId: string) {
  const [hooks, deliveries] = await Promise.all([
    col(tenantId, "webhooks").get(),
    col(tenantId, "webhookDeliveries").orderBy("attemptedAt", "desc").limit(50).get(),
  ]);
  return {
    webhooks: hooks.docs.map(toWebhook),
    deliveries: deliveries.docs.map((doc) => ({ id: doc.id, ...(toPortable(doc.data()) as Record<string, unknown>) }) as { id: string; status?: string; error?: string; httpStatus?: number | null } & Record<string, unknown>),
  };
}

type Fetcher = (url: string, init: RequestInit) => Promise<{ status: number }>;

/**
 * Sends a signed event to every active webhook subscribed to it and records each attempt in the
 * delivery log. Never throws: a failing endpoint must not break posting or status changes.
 */
export async function dispatchWebhooks(
  tenantId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
  options: { fetcher?: Fetcher; onlyWebhookId?: string } = {},
) {
  const fetcher = options.fetcher ?? fetch;
  try {
    const hooks = await col(tenantId, "webhooks").where("active", "==", true).get();
    const targets = hooks.docs.filter((doc) => (doc.get("events") ?? []).includes(event) && (!options.onlyWebhookId || doc.id === options.onlyWebhookId));
    return await Promise.all(targets.map(async (doc) => {
      const eventId = randomBytes(12).toString("hex");
      const body = JSON.stringify({ id: eventId, type: event, tenantId, createdAt: new Date().toISOString(), data: payload });
      const timestamp = Math.floor(Date.now() / 1000);
      const started = Date.now();
      let result: { httpStatus?: number; error?: string };
      try {
        const response = await fetcher(String(doc.get("url")), {
          method: "POST",
          redirect: "manual",
          signal: AbortSignal.timeout(5000),
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "SaaSassin-Feedback-Webhooks/1",
            [SIGNATURE_HEADER]: signatureHeader(String(doc.get("secret")), timestamp, body),
          },
          body,
        });
        result = { httpStatus: response.status };
      } catch (error) {
        result = { error: (error as Error).name === "TimeoutError" ? "Timed out after 5s." : `Network error: ${(error as Error).message}` };
      }
      const outcome = classifyDelivery(result);
      await col(tenantId, "webhookDeliveries").add({
        webhookId: doc.id, url: doc.get("url"), event, eventId, ...outcome, durationMs: Date.now() - started, attemptedAt: FieldValue.serverTimestamp(),
      });
      return { webhookId: doc.id, ...outcome };
    }));
  } catch (error) {
    console.error("Feedback webhook dispatch failed", error);
    return [];
  }
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

export const EXPORT_COLLECTIONS = ["boards", "posts", "votes", "comments", "tags", "changelog", "imports", "initiatives", "profiles", "webhooks", "webhookDeliveries"] as const;

export async function loadAllRecords(tenantId: string) {
  const entries = await Promise.all(
    EXPORT_COLLECTIONS.map(async (name) => {
      const snapshot = await col(tenantId, name).get();
      return [name, snapshot.docs.map((doc) => { const record: DocumentData = { id: doc.id, ...(toPortable(doc.data()) as DocumentData) }; if (name === "webhooks") record.secret = "[redacted]"; return record; })] as const;
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
