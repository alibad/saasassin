import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Runs the real server data layer against the Firestore emulator.
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
const app = initializeApp({ projectId: "demo-performance-golden-path" }, "lattice-golden-path");
const db: Firestore = getFirestore(app);

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => db,
  getAdminAuth: () => null,
  isFirebaseConfigured: () => true,
}));

const data = await import("@/lib/lattice/data");
const program = await import("@/lib/lattice/program-data");
const { verifyWorkspaceExport } = await import("@/lib/lattice/export");
const { linkInvitedMemberships } = await import("@/lib/lattice/member-links");

const owner = { uid: "owner", email: "owner@example.com", name: "Olivia Owner" };
const ana = { uid: "ana", email: "ana@example.com", name: "Ana Analyst" };
const bob = { uid: "bob", email: "bob@example.com", name: "Bob Builder" };

let organizationId = "";
let cycleId = "";

async function reviews() {
  const snapshot = await db.collection(`organizations/${organizationId}/reviewCycles/${cycleId}/reviews`).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as Record<string, unknown> & { id: string }));
}

async function move(targetState: Parameters<typeof program.transitionReviewCycle>[0]["targetState"], actor = owner) {
  return program.transitionReviewCycle({ actor, organizationId, cycleId, targetState, dryRun: false });
}

beforeAll(async () => {
  organizationId = await data.createOrganization(owner, "Acme Golden Path");
  const base = db.collection("organizations").doc(organizationId);
  for (const person of [ana, bob]) {
    await base.collection("members").doc(person.uid).set({
      authUid: person.uid,
      name: person.name,
      email: person.email,
      title: "Engineer",
      teamId: "team-eng",
      teamName: "Engineering",
      managerId: owner.uid,
      managerName: owner.name,
      roleId: "employee",
      status: "active",
    });
    await db.doc(`users/${person.uid}/memberships/${organizationId}`).set({ organizationId, organizationName: "Acme Golden Path", roleId: "employee" });
  }
  await base.collection("members").doc(owner.uid).set({ teamId: "team-lead", teamName: "Leadership" }, { merge: true });
  const templateId = await data.createReviewTemplate({
    actor: owner,
    organizationId,
    name: "Half-year",
    directions: ["self", "manager", "peer", "upward"],
    questions: [
      { id: "impact", prompt: "Impact", type: "text", required: true },
      { id: "rating", prompt: "Overall rating", type: "rating", required: true },
    ],
  });
  cycleId = await data.createReviewCycle({
    actor: owner,
    organizationId,
    name: "H2 2026",
    templateId,
    dueDate: "2026-01-01",
    peerNominationEnabled: true,
    calibrationEnabled: true,
  });
});

afterAll(async () => {
  await Promise.all(getApps().map((existing) => deleteApp(existing)));
});

describe("performance golden path", () => {
  it("launches with self, manager and upward assignments", async () => {
    await move("peer_nomination");
    const all = await reviews();
    const keys = all.map((review) => `${review.subjectId}:${review.reviewerId}:${review.direction}`).sort();
    expect(keys).toEqual([
      "ana:ana:self", "ana:owner:manager", "bob:bob:self", "bob:owner:manager",
      "owner:ana:upward", "owner:bob:upward", "owner:owner:self",
    ]);
  });

  it("requires a decision on every nomination before writing opens", async () => {
    const nominated = await program.nominatePeers({ actor: ana, organizationId, cycleId, subjectId: "ana", peerIds: ["bob"] });
    expect(nominated.state).toBe("pending");
    await expect(program.nominatePeers({ actor: bob, organizationId, cycleId, subjectId: "ana", peerIds: ["owner"] })).rejects.toThrow(/Only the employee/);
    const blocked = await move("review_writing");
    expect(blocked.canTransition).toBe(false);
    await expect(program.decideNomination({ actor: bob, organizationId, cycleId, nominationId: "ana__bob", decision: "approved" })).rejects.toThrow(/manager/);
    await program.decideNomination({ actor: owner, organizationId, cycleId, nominationId: "ana__bob", decision: "approved" });
    const opened = await move("review_writing");
    expect(opened.canTransition).toBe(true);
    const peer = (await reviews()).filter((review) => review.direction === "peer");
    expect(peer.map((review) => `${review.subjectId}:${review.reviewerId}`)).toEqual(["ana:bob"]);
  });

  it("reminds outstanding reviewers and escalates overdue ones", async () => {
    const result = await program.sendCycleReminders({ actor: owner, organizationId, cycleId });
    expect(result).toEqual({ reminders: 3, escalations: 2 });
    await expect(program.sendCycleReminders({ actor: ana, organizationId, cycleId })).rejects.toThrow(/Missing permission/);
    const inbox = await db.collection(`organizations/${organizationId}/notifications`).where("recipientId", "==", "owner").get();
    expect(inbox.docs.map((document) => document.data().kind).sort()).toEqual(["escalation", "escalation", "reminder"]);
  });

  it("submits every review, calibrates, and releases anonymized packets", async () => {
    const actors = new Map([["owner", owner], ["ana", ana], ["bob", bob]]);
    for (const review of await reviews()) {
      await data.saveReview({
        actor: actors.get(String(review.reviewerId))!,
        organizationId,
        cycleId,
        reviewId: review.id,
        answers: { impact: `Evidence from ${review.reviewerId}`, rating: review.direction === "peer" ? 5 : 4 },
        submit: true,
      });
    }
    await move("calibration");
    await expect(program.saveCalibration({ actor: ana, organizationId, cycleId, subjectId: "ana", rating: 5, note: "" })).rejects.toThrow(/Missing permission/);
    await program.saveCalibration({ actor: owner, organizationId, cycleId, subjectId: "ana", rating: 4, note: "Consistent with peers" });
    const release = await move("acknowledgement");
    expect(release.warnings.join(" ")).toMatch(/no calibrated rating/);
    const packet = (await db.doc(`organizations/${organizationId}/reviewCycles/${cycleId}/packets/ana`).get()).data()!;
    expect(packet.state).toBe("released");
    expect(packet.content.calibratedRating).toBe(4);
    expect(packet.content.sections.map((section: { reviewerLabel: string }) => section.reviewerLabel)).toEqual([
      "Self review", "Manager · Olivia Owner", "Peer 1",
    ]);
    expect(JSON.stringify(packet.content)).not.toContain("Bob Builder");
    expect(JSON.stringify(packet.content)).not.toContain("reviewerId");
    expect(JSON.stringify(packet.content)).not.toContain("Consistent with peers");
  });

  it("acknowledges, safely reopens, and keeps history across a phase reopen", async () => {
    await program.acknowledgePacket({ actor: ana, organizationId, cycleId, comment: "Thanks" });
    await expect(program.acknowledgePacket({ actor: ana, organizationId, cycleId, comment: "" })).rejects.toThrow(/not waiting/);
    await program.reopenPacket({ actor: owner, organizationId, cycleId, subjectId: "ana", reason: "Rating corrected" });
    const reopened = (await db.doc(`organizations/${organizationId}/reviewCycles/${cycleId}/packets/ana`).get()).data()!;
    expect(reopened.state).toBe("released");
    expect(reopened.history).toHaveLength(1);
    expect(reopened.history[0].acknowledgementComment).toBe("Thanks");

    const before = await reviews();
    await move("calibration");
    expect((await db.doc(`organizations/${organizationId}/reviewCycles/${cycleId}/packets/ana`).get()).data()!.state).toBe("withdrawn");
    await move("acknowledgement");
    const after = await reviews();
    expect(after).toHaveLength(before.length);
    expect(after.every((review) => review.state === "submitted")).toBe(true);
    await program.acknowledgePacket({ actor: ana, organizationId, cycleId, comment: "" });
    const close = await move("closed");
    expect(close.warnings.join(" ")).toMatch(/not been acknowledged/);
  });

  it("runs goals, feedback and one-to-ones with relationship-aware access", async () => {
    const goalId = await program.createGoal({ actor: ana, organizationId, ownerId: null, title: "Ship onboarding", description: "", dueDate: "2026-12-31", visibility: "manager" });
    await expect(program.checkInGoal({ actor: bob, organizationId, goalId, progress: 90, status: "done", note: "" })).rejects.toThrow(/owner or their manager/);
    await program.checkInGoal({ actor: owner, organizationId, goalId, progress: 40, status: "at_risk", note: "Blocked on design" });
    await program.giveFeedback({ actor: bob, organizationId, recipientId: "ana", kind: "praise", body: "Great pairing session", visibility: "private" });
    await expect(program.giveFeedback({ actor: bob, organizationId, recipientId: "bob", kind: "praise", body: "Me!", visibility: "public" })).rejects.toThrow(/someone else/);
    const meetingId = await program.createOneOnOne({ actor: ana, organizationId, counterpartId: "owner", scheduledFor: "2026-11-02" });
    await expect(program.createOneOnOne({ actor: ana, organizationId, counterpartId: "bob", scheduledFor: "2026-11-02" })).rejects.toThrow(/their manager/);
    await program.updateOneOnOne({ actor: ana, organizationId, meetingId, operation: { type: "add_agenda_item", text: "Career growth" } });
    await expect(program.updateOneOnOne({ actor: bob, organizationId, meetingId, operation: { type: "save_notes", sharedNotes: "x" } })).rejects.toThrow(/participants/);
    await program.updateOneOnOne({ actor: owner, organizationId, meetingId, operation: { type: "complete" } });

    const ownerView = await program.getProgramSnapshot(owner, await data.getWorkspaceSnapshot(owner, organizationId));
    const bobView = await program.getProgramSnapshot(bob, await data.getWorkspaceSnapshot(bob, organizationId));
    const anaView = await program.getProgramSnapshot(ana, await data.getWorkspaceSnapshot(ana, organizationId));
    // manager-only goal: visible to the owner (manager) and Ana, hidden from peer Bob
    expect(ownerView.goals.map((goal) => goal.id)).toContain(goalId);
    expect(bobView.goals.map((goal) => goal.id)).not.toContain(goalId);
    // private feedback: author and recipient only, not the manager
    expect(anaView.feedback).toHaveLength(1);
    expect(bobView.feedback).toHaveLength(1);
    expect(ownerView.feedback).toHaveLength(0);
    // one-to-ones: participants only
    expect(anaView.oneOnOnes[0].agenda[0].text).toBe("Career growth");
    expect(bobView.oneOnOnes).toHaveLength(0);
    // packets: employees see their own; calibrators see all
    expect(anaView.packets.map((packet) => packet.subjectId)).toEqual(["ana"]);
    expect(ownerView.packets).toHaveLength(3);
    expect(anaView.calibration).toHaveLength(0);
    expect(ownerView.calibration.find((row) => row.subjectId === "ana")?.rating).toBe(4);
    expect(ownerView.reportInput?.reviews).toHaveLength(8);
    expect(anaView.reportInput).toBeNull();
  });

  it("exports a complete, verifiable workspace and audits every step", async () => {
    await expect(program.exportWorkspace({ actor: ana, organizationId })).rejects.toThrow(/Missing permission/);
    const payload = await program.exportWorkspace({ actor: owner, organizationId });
    expect(verifyWorkspaceExport(payload)).toEqual([]);
    const counts = Object.fromEntries(payload.manifest.files.map((file) => [file.path, file.records]));
    expect(counts["reviews.json"]).toBe(8);
    expect(counts["packets.json"]).toBe(3);
    expect(counts["nominations.json"]).toBe(1);
    expect(counts["goals.json"]).toBe(1);
    expect(counts["feedback.json"]).toBe(1);
    expect(counts["one-on-ones.json"]).toBe(1);
    const audit = await db.collection(`organizations/${organizationId}/auditEvents`).get();
    const types = new Set(audit.docs.map((document) => document.data().eventType));
    for (const type of [
      "review_nomination.created", "review_nomination.approved", "review_cycle.reminders_sent",
      "review_calibration.saved", "review_packet.acknowledged", "review_packet.reopened",
      "review_cycle.reopened", "goal.created", "goal.checked_in", "feedback.given",
      "one_on_one.scheduled", "one_on_one.completed", "workspace.exported",
    ]) {
      expect(types).toContain(type);
    }
    const feedbackAudit = audit.docs.find((document) => document.data().eventType === "feedback.given")!.data();
    expect(JSON.stringify(feedbackAudit)).not.toContain("Great pairing session");
  });
});

describe("imported member linking", () => {
  it("links an imported employee on verified sign-in and resolves their member id", async () => {
    const csv = "name,email,title,team,manager_email,role\nSam Rivera,Sam.Imported@example.com,Designer,Product,owner@example.com,employee\n";
    await data.importEmployees({ actor: owner, organizationId, csv, dryRun: false });
    const imported = (await db.collection(`organizations/${organizationId}/members`).where("email", "==", "sam.imported@example.com").get()).docs[0];
    expect(imported.id).not.toBe("sam-uid");
    expect(imported.data().status).toBe("invited");

    const unverified = { uid: "sam-uid", email: "sam.imported@example.com", name: "Sam", emailVerified: false };
    expect(await linkInvitedMemberships(unverified)).toEqual({ linked: 0 });
    await expect(data.authorizeOrganization(unverified, organizationId, "reviews.read")).rejects.toThrow(/do not belong/);

    const verified = { ...unverified, emailVerified: true };
    expect(await linkInvitedMemberships(verified)).toEqual({ linked: 1 });
    expect(await linkInvitedMemberships(verified)).toEqual({ linked: 0 });
    const { member } = await data.authorizeOrganization(verified, organizationId, "reviews.read");
    expect(member.id).toBe(imported.id);
    expect(member.status).toBe("active");
    expect((await db.doc(`organizations/${organizationId}/memberLinks/sam-uid`).get()).data()?.memberId).toBe(imported.id);
    const snapshot = await data.getWorkspaceSnapshot(verified, organizationId);
    expect(snapshot.currentMember?.id).toBe(imported.id);

    // A different account with the same (claimed) email cannot take the record over.
    const intruder = { uid: "intruder-uid", email: "sam.imported@example.com", name: "X", emailVerified: true };
    expect(await linkInvitedMemberships(intruder)).toEqual({ linked: 0 });
    await expect(data.authorizeOrganization(intruder, organizationId, "reviews.read")).rejects.toThrow(/do not belong/);
  });
});
