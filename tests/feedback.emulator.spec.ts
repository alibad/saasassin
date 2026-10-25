import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Golden path for SaaSassin Feedback against the Firestore emulator. Never runs against production.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("feedback.emulator.spec.ts only runs under the Firestore emulator (FIRESTORE_EMULATOR_HOST is not set).");
}
process.env.FIREBASE_PROJECT_ID = "demo-saasassin";

const app = initializeApp({ projectId: "demo-saasassin" }, "feedback-golden-path");
const db: Firestore = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => db,
  getAdminAuth: () => null,
  isFirebaseConfigured: () => true,
}));

const platform = await import("@/lib/fleet/platform/tenants");
const { FleetError } = await import("@/lib/fleet/platform/session");
const data = await import("@/lib/feedback/data");
const { toFiderInstances } = await import("@/lib/feedback/fider");
const { mapCannyCsv } = await import("@/lib/feedback/canny");

const owner = { uid: "fb-owner", email: "owner@example.com", name: "Olivia Owner" };
const viewer = { uid: "fb-viewer", email: "viewer@example.com", name: "Vic Viewer" };
const voterA = { uid: "fb-voter-a", email: "a@example.com", name: "Ana Voter" };
const voterB = { uid: "fb-voter-b", email: "b@example.com", name: "Bo Voter" };
const rival = { uid: "fb-rival", email: "rival@example.com", name: "Rita Rival" };

let tenantId = "";
let rivalTenantId = "";
let canonicalId = "";
let duplicateId = "";

async function expectFleetError(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (cause: unknown) => cause);
  expect(error).toBeInstanceOf(FleetError);
  expect((error as InstanceType<typeof FleetError>).status).toBe(status);
}

async function voteDocs(postId: string) {
  const snapshot = await db.collection(`products/feedback/tenants/${tenantId}/votes`).where("postId", "==", postId).get();
  return snapshot.docs.map((doc) => doc.data());
}

async function postData(postId: string) {
  return (await db.doc(`products/feedback/tenants/${tenantId}/posts/${postId}`).get()).data() ?? {};
}

beforeAll(async () => {
  tenantId = (await platform.createTenant("feedback", owner, "Acme Feedback")).id;
  rivalTenantId = (await platform.createTenant("feedback", rival, "Rival Feedback")).id;
  // A low-role teammate (addTenantMember needs Firebase Auth, so seed the membership directly).
  await db.doc(`products/feedback/tenants/${tenantId}/memberships/${viewer.uid}`).set({
    uid: viewer.uid, email: viewer.email, name: viewer.name, role: "viewer", status: "active",
  });
});

afterAll(async () => {
  await Promise.all(getApps().map((existing) => deleteApp(existing)));
});

describe("feedback golden path (Firestore emulator)", () => {
  it("enforces membership and roles server-side", async () => {
    await expect(platform.requireTenantMember("feedback", tenantId, owner, platform.PRIVILEGED_ROLES)).resolves.toMatchObject({ role: "owner" });
    await expectFleetError(platform.requireTenantMember("feedback", tenantId, viewer, platform.PRIVILEGED_ROLES), 403);
    await expectFleetError(platform.requireTenantMember("feedback", tenantId, voterA), 404);
    await expectFleetError(platform.requireTenantMember("feedback", tenantId, rival), 404);
  });

  it("creates boards and denies public reads of private boards", async () => {
    await data.createBoard(tenantId, owner, { name: "Ideas", description: "Tell us", isPublic: true });
    await data.createBoard(tenantId, owner, { name: "Internal roadmap", description: "", isPublic: false });
    await expectFleetError(data.createBoard(tenantId, owner, { name: "Ideas", description: "", isPublic: true }), 409);

    const board = await data.loadPublicBoard(tenantId, "ideas", null);
    expect(board.board).toMatchObject({ name: "Ideas", isPublic: true });
    expect(board.viewer).toBeNull();
    await expectFleetError(data.loadPublicBoard(tenantId, "internal-roadmap", null), 404);
    await expectFleetError(data.loadPublicBoard(tenantId, "missing", null), 404);
    // Tenant isolation: the rival tenant cannot reach Acme's board by slug.
    await expectFleetError(data.loadPublicBoard(rivalTenantId, "ideas", null), 404);
    await expectFleetError(data.loadPublicPortal("not-a-tenant-id"), 404);
  });

  it("lets signed-in users post with an automatic first vote and sequential numbers", async () => {
    canonicalId = (await data.createPost(tenantId, "ideas", voterA, { title: "Dark mode", description: "Night owls" })).id;
    duplicateId = (await data.createPost(tenantId, "ideas", voterB, { title: "Add a dark theme", description: "" })).id;
    expect((await postData(canonicalId)).number).toBe(1);
    expect((await postData(duplicateId)).number).toBe(2);
    expect((await postData(canonicalId)).voteCount).toBe(1);
    await expectFleetError(data.createPost(tenantId, "internal-roadmap", voterA, { title: "Sneaky post", description: "" }), 404);
  });

  it("toggles votes transactionally with one vote per person", async () => {
    expect(await data.toggleVoteForUser(tenantId, canonicalId, voterB)).toEqual({ voted: true, voteCount: 2 });
    expect(await data.toggleVoteForUser(tenantId, canonicalId, voterB)).toEqual({ voted: false, voteCount: 1 });

    // A double click: two concurrent toggles from the same person must leave count == vote docs.
    await Promise.all([
      data.toggleVoteForUser(tenantId, canonicalId, voterB),
      data.toggleVoteForUser(tenantId, canonicalId, voterB),
    ]);
    const votes = await voteDocs(canonicalId);
    expect(votes.filter((vote) => vote.uid === voterB.uid).length).toBeLessThanOrEqual(1);
    expect((await postData(canonicalId)).voteCount).toBe(votes.length);

    // Settle on a known state: voterB votes on the canonical post.
    if (!votes.some((vote) => vote.uid === voterB.uid)) await data.toggleVoteForUser(tenantId, canonicalId, voterB);
    expect((await postData(canonicalId)).voteCount).toBe(2);

    const board = await data.loadPublicBoard(tenantId, "ideas", voterB);
    expect(board.viewer?.votes.sort()).toEqual([canonicalId, duplicateId].sort());
  });

  it("records comments and hides moderated ones from the public", async () => {
    await data.addComment(tenantId, canonicalId, voterB, "Please, my eyes");
    const { id: spamId } = await data.addComment(tenantId, canonicalId, voterA, "BUY CHEAP WATCHES");
    await data.addInternalNote(tenantId, owner, canonicalId, "Three enterprise asks");
    expect((await postData(canonicalId)).commentCount).toBe(2);

    await data.moderate(tenantId, owner, { kind: "comment", id: spamId, hidden: true, reason: "spam" });
    const detail = await data.loadPublicPost(tenantId, canonicalId);
    expect(detail.comments.map((comment) => comment.content)).toEqual(["Please, my eyes"]);
    expect(detail.post.commentCount).toBe(1);
    expect(detail.post.author.uid).toBe("");
    expect((await data.listComments(tenantId, canonicalId))).toHaveLength(3);
  });

  it("changes status through the state machine with notes", async () => {
    await expectFleetError(data.changeStatus(tenantId, owner, canonicalId, "duplicate", ""), 409);
    await expectFleetError(data.changeStatus(tenantId, owner, canonicalId, "declined", ""), 409);
    expect(await data.changeStatus(tenantId, owner, canonicalId, "planned", "Next quarter")).toEqual({ from: "open", to: "planned" });
    const post = await postData(canonicalId);
    expect(post.status).toBe("planned");
    expect(post.response.text).toBe("Next quarter");
    expect(post.statusHistory).toHaveLength(1);
  });

  it("merges a duplicate and moves votes without double counting", async () => {
    // Duplicate voters: voterB (author) and voterA; canonical voters: voterA (author) and voterB → both overlap.
    await data.toggleVoteForUser(tenantId, duplicateId, voterA);
    const outsider = { uid: "fb-voter-c", email: "c@example.com", name: "Cy Voter" };
    await data.toggleVoteForUser(tenantId, duplicateId, outsider);
    expect((await postData(duplicateId)).voteCount).toBe(3);

    const result = await data.mergePosts(tenantId, owner, duplicateId, canonicalId, "");
    expect(result).toEqual({ moved: 1, overlapping: 2, canonicalVoteCount: 3 });
    const duplicate = await postData(duplicateId);
    expect(duplicate).toMatchObject({ status: "duplicate", originalId: canonicalId, voteCount: 0 });
    expect(await voteDocs(duplicateId)).toHaveLength(0);
    const canonicalVotes = await voteDocs(canonicalId);
    expect(canonicalVotes.map((vote) => vote.uid).sort()).toEqual([outsider.uid, voterA.uid, voterB.uid].sort());
    expect((await postData(canonicalId)).voteCount).toBe(3);

    await expectFleetError(data.mergePosts(tenantId, owner, duplicateId, canonicalId, ""), 409);
    await expectFleetError(data.toggleVoteForUser(tenantId, duplicateId, outsider), 409);
    const publicDuplicate = await data.loadPublicPost(tenantId, duplicateId);
    expect(publicDuplicate.original).toMatchObject({ id: canonicalId, number: 1 });
  });

  it("tags posts, completes them and publishes a linked changelog", async () => {
    const { id: tagId } = await data.createTag(tenantId, owner, { name: "UI", color: "#27c7a6", isPublic: true });
    await data.setPostTags(tenantId, owner, canonicalId, [tagId, "unknown-tag"]);
    expect((await postData(canonicalId)).tags).toEqual([tagId]);

    await expectFleetError(data.createChangelogEntry(tenantId, owner, { title: "Too early", body: "", postIds: [canonicalId] }), 409);
    await data.changeStatus(tenantId, owner, canonicalId, "started", "");
    await data.changeStatus(tenantId, owner, canonicalId, "completed", "Shipped in 2.0");
    await data.createChangelogEntry(tenantId, owner, { title: "Release 2.0", body: "Dark mode is here", postIds: [canonicalId] });

    const portal = await data.loadPublicPortal(tenantId);
    expect(portal.boards.map((board) => board.slug)).toEqual(["ideas"]);
    expect(portal.posts.map((post) => [post.id, post.status])).toEqual([[canonicalId, "completed"]]);
    expect(portal.changelog[0]).toMatchObject({ title: "Release 2.0", posts: [{ id: canonicalId, number: 1 }] });
    expect(portal.tags.map((tag) => tag.name)).toEqual(["UI"]);
  });

  it("hides spam posts from public boards", async () => {
    const { id: spamPostId } = await data.createPost(tenantId, "ideas", voterA, { title: "Cheap watches here", description: "" });
    await data.moderate(tenantId, owner, { kind: "post", id: spamPostId, hidden: true, reason: "spam" });
    const board = await data.loadPublicBoard(tenantId, "ideas", null);
    expect(board.posts.map((post) => post.id)).not.toContain(spamPostId);
    await expectFleetError(data.loadPublicPost(tenantId, spamPostId), 404);
    await expectFleetError(data.toggleVoteForUser(tenantId, spamPostId, voterB), 404);
  });

  it("imports a Canny CSV idempotently into a private board", async () => {
    const csv = [
      "Board,Title,Details,Status,Author Name,Author Email,Votes,Created At,Tags,URL",
      "Bugs,Crash on save,,in progress,Cy,cy@example.com,7,2025-05-01,ui,https://acme.canny.io/p/crash",
      "Bugs,Slow search,,open,Di,,2,,,https://acme.canny.io/p/slow",
    ].join("\n");
    const first = await data.commitCannyImport(tenantId, owner, mapCannyCsv(csv));
    expect(first).toEqual({ created: 2, skippedExisting: 0, createdBoards: 1, createdTags: 0 });
    const second = await data.commitCannyImport(tenantId, owner, mapCannyCsv(csv));
    expect(second).toEqual({ created: 0, skippedExisting: 2, createdBoards: 0, createdTags: 0 });
    await expectFleetError(data.loadPublicBoard(tenantId, "bugs", null), 404);
    const snapshot = await data.loadAdminSnapshot(tenantId);
    const crash = snapshot.posts.find((post) => post.title === "Crash on save");
    expect(crash).toMatchObject({ status: "started", voteCount: 7 });
  });

  it("keeps tenants isolated, appends audit events and exports every record", async () => {
    const rivalSnapshot = await data.loadAdminSnapshot(rivalTenantId);
    expect(rivalSnapshot.posts).toHaveLength(0);
    expect(rivalSnapshot.boards).toHaveLength(0);

    const audit = await platform.listAuditEvents("feedback", tenantId, 200);
    const actions = new Set(audit.map((event) => event.action));
    for (const action of ["tenant.created", "board.created", "post.created", "vote.added", "vote.removed", "comment.created", "comment.hidden", "post.status_changed", "post.merged", "post.tagged", "changelog.published", "post.hidden", "import.canny_committed", "note.created"]) {
      expect(actions, action).toContain(action);
    }

    const records = await data.loadAllRecords(tenantId);
    const counts = Object.fromEntries(
      await Promise.all(data.EXPORT_COLLECTIONS.map(async (name) => [name, (await db.collection(`products/feedback/tenants/${tenantId}/${name}`).count().get()).data().count] as const)),
    );
    for (const name of data.EXPORT_COLLECTIONS) expect(records[name].length, name).toBe(counts[name]);
    expect(records.posts.length).toBe(5);
    expect(records.boards.length).toBe(3);

    const typed = await data.loadTypedRecords(tenantId);
    const members = await platform.listTenantMembers("feedback", tenantId);
    const fider = toFiderInstances({ ...typed, members });
    const ideas = fider.instances.find((instance) => instance.board.slug === "ideas")!;
    expect(ideas.tables.posts.map((post) => [post.number, post.status, post.original_id])).toEqual([[1, 2, null], [2, 5, 1], [3, 0, null]]);
    expect(ideas.tables.post_votes.filter((vote) => vote.post_id === 1)).toHaveLength(3);
    expect(ideas.skipped.map((entry) => entry.type)).toContain("comment.internal");
  });
});
