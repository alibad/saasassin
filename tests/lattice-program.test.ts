import { describe, expect, it } from "vitest";

import {
  buildWorkspaceExport,
  EXPORT_FILES,
  EXPORT_MANIFEST_SCHEMA,
  verifyWorkspaceExport,
} from "../src/lib/lattice/export";
import { effectiveRolePermissions } from "../src/lib/lattice/permissions";
import {
  assemblePacket,
  buildReport,
  buildTimeline,
  deadlineStatus,
  duePhase,
  EMPTY_SCHEDULE,
  generateAssignments,
  planReminders,
  ratingDistribution,
  summarizeRatings,
  validateNomination,
  validateSchedule,
  type AssignmentMember,
  type ReviewForSummary,
} from "../src/lib/lattice/program";
import { previewCycleTransition } from "../src/lib/lattice/state-machine";

const members: AssignmentMember[] = [
  { id: "ceo", name: "Cee", managerId: null, teamId: "lead", active: true },
  { id: "mgr", name: "Mo", managerId: "ceo", teamId: "eng", active: true },
  { id: "ana", name: "Ana", managerId: "mgr", teamId: "eng", active: true },
  { id: "bob", name: "Bob", managerId: "mgr", teamId: "eng", active: true },
  { id: "cat", name: "Cat", managerId: "mgr", teamId: "eng", active: false },
];

describe("generateAssignments", () => {
  it("creates self, manager and upward reviews at launch for active members", () => {
    const seeds = generateAssignments({
      phase: "launch",
      members,
      directions: ["self", "manager", "upward"],
      peerNominationEnabled: true,
    });
    const keys = seeds.map((seed) => `${seed.subjectId}:${seed.reviewerId}:${seed.direction}`).sort();
    expect(keys).toContain("ana:ana:self");
    expect(keys).toContain("ana:mgr:manager");
    expect(keys).toContain("mgr:ana:upward");
    expect(keys).toContain("ceo:mgr:upward");
    // inactive members never review, but are still reviewed by their manager
    expect(keys).not.toContain("cat:cat:self");
    expect(keys).not.toContain("mgr:cat:upward");
    expect(keys).toContain("cat:mgr:manager");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("auto-assigns teammates as peers only when nomination is disabled", () => {
    const auto = generateAssignments({ phase: "launch", members, directions: ["peer"], peerNominationEnabled: false });
    expect(auto.filter((seed) => seed.subjectId === "ana").map((seed) => seed.reviewerId)).toEqual(["bob"]);
    expect(auto.every((seed) => seed.subjectId !== seed.reviewerId)).toBe(true);
    const nominated = generateAssignments({ phase: "launch", members, directions: ["peer"], peerNominationEnabled: true });
    expect(nominated).toEqual([]);
  });

  it("turns approved nominations into peer reviews and skips invalid ones", () => {
    const seeds = generateAssignments({
      phase: "peer",
      members,
      directions: ["self", "peer"],
      peerNominationEnabled: true,
      approvedNominations: [
        { subjectId: "ana", peerId: "bob" },
        { subjectId: "ana", peerId: "ana" },
        { subjectId: "ana", peerId: "cat" },
        { subjectId: "ana", peerId: "bob" },
      ],
    });
    expect(seeds).toEqual([{ subjectId: "ana", reviewerId: "bob", direction: "peer" }]);
  });
});

describe("validateNomination", () => {
  it("rejects self, unknown and inactive peers", () => {
    expect(validateNomination({ subjectId: "ana", peerIds: ["bob", "bob"], members }).errors).toEqual([]);
    expect(validateNomination({ subjectId: "ana", peerIds: ["ana"], members }).errors[0]).toMatch(/themselves/);
    expect(validateNomination({ subjectId: "ana", peerIds: ["zed"], members }).errors[0]).toMatch(/belong/);
    expect(validateNomination({ subjectId: "ana", peerIds: ["cat"], members }).errors[0]).toMatch(/not joined/);
    expect(validateNomination({ subjectId: "ana", peerIds: [], members }).errors[0]).toMatch(/at least one/);
  });
});

describe("deadlines and reminders", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");

  it("classifies deadlines", () => {
    expect(deadlineStatus(null, now, false)).toBe("none");
    expect(deadlineStatus("2026-10-30", now, false)).toBe("on_track");
    expect(deadlineStatus("2026-10-22", now, false)).toBe("due_soon");
    expect(deadlineStatus("2026-10-20", now, false)).toBe("due_soon");
    expect(deadlineStatus("2026-10-19", now, false)).toBe("overdue");
    expect(deadlineStatus("2026-10-19", now, true)).toBe("done");
  });

  it("reminds outstanding reviewers and escalates overdue ones to their manager", () => {
    const reviews = [
      { id: "r1", reviewerId: "ana", state: "draft" },
      { id: "r2", reviewerId: "ana", state: "draft" },
      { id: "r3", reviewerId: "bob", state: "submitted" },
    ];
    expect(planReminders({ reviews, members, dueDate: "2026-10-30", now })).toEqual([
      { recipientId: "ana", kind: "reminder", reviewIds: ["r1", "r2"], aboutReviewerId: "ana" },
    ]);
    expect(planReminders({ reviews, members, dueDate: "2026-10-01", now })).toEqual([
      { recipientId: "ana", kind: "reminder", reviewIds: ["r1", "r2"], aboutReviewerId: "ana" },
      { recipientId: "mgr", kind: "escalation", reviewIds: ["r1", "r2"], aboutReviewerId: "ana" },
    ]);
  });
});

const questions = [
  { id: "q1", prompt: "Impact", type: "text" as const },
  { id: "q2", prompt: "Rating", type: "rating" as const },
];
const reviews: ReviewForSummary[] = [
  { id: "a-self", subjectId: "ana", reviewerId: "ana", direction: "self", state: "submitted", answers: { q1: "Shipped", q2: 4 } },
  { id: "a-mgr", subjectId: "ana", reviewerId: "mgr", direction: "manager", state: "submitted", answers: { q1: "Strong", q2: 3 } },
  { id: "a-peer-2", subjectId: "ana", reviewerId: "bob", direction: "peer", state: "submitted", answers: { q1: "Helpful", q2: 5 } },
  { id: "a-peer-draft", subjectId: "ana", reviewerId: "ceo", direction: "peer", state: "draft", answers: { q2: 1 } },
];

describe("calibration and packets", () => {
  it("summarizes only submitted ratings", () => {
    const [summary] = summarizeRatings(reviews, questions);
    expect(summary.average).toBe(4);
    expect(summary.byDirection).toEqual({ self: 4, manager: 3, peer: 5 });
    expect(summary.submittedReviews).toBe(3);
    expect(summary.totalReviews).toBe(4);
  });

  it("counts a 1-5 distribution and ignores invalid ratings", () => {
    expect(ratingDistribution([1, 3, 3, 5, null, 7])).toEqual({ 1: 1, 2: 0, 3: 2, 4: 0, 5: 1 });
  });

  it("anonymizes peer and upward authors in packets", () => {
    const packet = assemblePacket({
      subjectId: "ana",
      reviews,
      questions,
      memberNames: new Map([["mgr", "Mo"], ["bob", "Bob"]]),
      calibratedRating: 4,
      anonymityThreshold: 1,
    });
    expect(packet.sections.map((section) => section.reviewerLabel)).toEqual(["Self review", "Manager · Mo", "Peer 1"]);
    expect(JSON.stringify(packet)).not.toContain("Bob");
    expect(packet.calibratedRating).toBe(4);
  });
});

describe("anonymity thresholds", () => {
  const peers: ReviewForSummary[] = ["p1", "p2", "p3"].map((id, index) => ({
    id, subjectId: "ana", reviewerId: `peer-${index}`, direction: "peer", state: "submitted", answers: { q1: `Peer note ${index}`, q2: 3 },
  }));
  const names = new Map<string, string>();

  it("withholds peer feedback below the default threshold of 3 and explains why", () => {
    const packet = assemblePacket({ subjectId: "ana", reviews: [...reviews, peers[0]], questions, memberNames: names, calibratedRating: null });
    const peer = packet.sections.find((section) => section.direction === "peer")!;
    expect(packet.anonymityThreshold).toBe(3);
    expect(peer.withheld).toBe(true);
    expect(peer.answers).toEqual([]);
    expect(peer.note).toMatch(/2 peer responses were received; at least 3 are required/);
    expect(JSON.stringify(packet)).not.toContain("Helpful");
    expect(JSON.stringify(packet)).not.toContain("Peer note");
  });

  it("shares anonymized peer feedback once the threshold is met", () => {
    const packet = assemblePacket({ subjectId: "ana", reviews: peers, questions, memberNames: names, calibratedRating: null });
    expect(packet.sections.map((section) => section.reviewerLabel)).toEqual(["Peer 1", "Peer 2", "Peer 3"]);
    expect(packet.sections.every((section) => !section.withheld)).toBe(true);
  });

  it("applies the threshold to upward feedback independently and respects a custom value", () => {
    const upward: ReviewForSummary[] = [
      { id: "u1", subjectId: "mgr", reviewerId: "ana", direction: "upward", state: "submitted", answers: { q1: "Clear" } },
      { id: "u2", subjectId: "mgr", reviewerId: "bob", direction: "upward", state: "submitted", answers: { q1: "Kind" } },
    ];
    expect(assemblePacket({ subjectId: "mgr", reviews: upward, questions, memberNames: names, calibratedRating: null }).sections[0].withheld).toBe(true);
    const relaxed = assemblePacket({ subjectId: "mgr", reviews: upward, questions, memberNames: names, calibratedRating: null, anonymityThreshold: 2 });
    expect(relaxed.sections.map((section) => section.reviewerLabel)).toEqual(["Direct report 1", "Direct report 2"]);
  });
});

describe("timeline and reporting", () => {
  it("merges evidence newest first for one employee", () => {
    const timeline = buildTimeline("ana", {
      goals: [{ id: "g1", ownerId: "ana", title: "Ship", createdAt: "2026-01-01T00:00:00.000Z", checkIns: [{ at: "2026-02-01T00:00:00.000Z", progress: 50, status: "at_risk", note: "" }] }],
      feedback: [{ id: "f1", recipientId: "ana", authorName: "Bob", kind: "praise", body: "Great", createdAt: "2026-03-01T00:00:00.000Z" }, { id: "f2", recipientId: "bob", authorName: "Ana", kind: "praise", body: "x", createdAt: "2026-03-02T00:00:00.000Z" }],
      reviews: [{ id: "r1", subjectId: "ana", direction: "self", cycleName: "H1", submittedAt: "2026-04-01T00:00:00.000Z" }],
      packets: [{ cycleId: "c1", cycleName: "H1", subjectId: "ana", releasedAt: "2026-05-01T00:00:00.000Z", acknowledgedAt: "2026-05-02T00:00:00.000Z" }],
      oneOnOnes: [{ id: "o1", managerId: "mgr", reportId: "ana", scheduledFor: "2026-06-01T00:00:00.000Z", status: "scheduled", counterpartName: "Mo" }],
    });
    expect(timeline.map((entry) => entry.kind)).toEqual([
      "one_on_one", "acknowledgement", "packet", "review", "feedback", "goal_check_in", "goal",
    ]);
  });

  it("filters reports by cycle and team", () => {
    const input = {
      members: [
        { id: "ana", teamId: "eng", teamName: "Engineering" },
        { id: "zoe", teamId: "ops", teamName: "Operations" },
      ],
      reviews: [
        { cycleId: "c1", subjectId: "ana", direction: "self" as const, state: "submitted" },
        { cycleId: "c1", subjectId: "ana", direction: "manager" as const, state: "draft" },
        { cycleId: "c2", subjectId: "zoe", direction: "self" as const, state: "submitted" },
      ],
      goals: [{ ownerId: "ana", status: "on_track" as const }, { ownerId: "zoe", status: "done" as const }],
      feedback: [{ recipientId: "ana", kind: "praise" }],
      calibrations: [{ cycleId: "c1", subjectId: "ana", rating: 4 }],
      packets: [{ cycleId: "c1", subjectId: "ana", state: "acknowledged" }],
    };
    const all = buildReport(input, { cycleId: null, teamId: null });
    expect(all.reviews).toEqual({ total: 3, submitted: 2, completion: 67 });
    const eng = buildReport(input, { cycleId: null, teamId: "eng" });
    expect(eng.reviews.total).toBe(2);
    expect(eng.goals.on_track).toBe(1);
    expect(eng.goals.done).toBe(0);
    const c2 = buildReport(input, { cycleId: "c2", teamId: null });
    expect(c2.reviews.total).toBe(1);
    expect(c2.packets.released).toBe(0);
    expect(all.calibration[4]).toBe(1);
  });
});

describe("transition preview blockers", () => {
  const config = { peerNominationEnabled: true, calibrationEnabled: true };
  it("blocks closing peer nomination while decisions are pending", () => {
    const preview = previewCycleTransition({ from: "peer_nomination", to: "review_writing", config, assignedReviews: 0, submittedReviews: 0, pendingNominations: 2 });
    expect(preview.canTransition).toBe(false);
    expect(preview.blockers[0]).toMatch(/2 peer nominations/);
  });
  it("warns but allows release with uncalibrated subjects and close with unacknowledged packets", () => {
    const release = previewCycleTransition({ from: "calibration", to: "acknowledgement", config, assignedReviews: 2, submittedReviews: 2, uncalibratedSubjects: 1 });
    expect(release.canTransition).toBe(true);
    expect(release.warnings.join(" ")).toMatch(/no calibrated rating/);
    const close = previewCycleTransition({ from: "acknowledgement", to: "closed", config, assignedReviews: 2, submittedReviews: 2, unacknowledgedPackets: 3 });
    expect(close.canTransition).toBe(true);
    expect(close.warnings.join(" ")).toMatch(/not been acknowledged/);
  });
  it("warns that reopening calibration withdraws packets", () => {
    const reopen = previewCycleTransition({ from: "acknowledgement", to: "calibration", config, assignedReviews: 2, submittedReviews: 2 });
    expect(reopen.direction).toBe("reverse");
    expect(reopen.warnings.join(" ")).toMatch(/withdrawn/);
  });
});

describe("built-in role permissions", () => {
  it("adds new capabilities to built-in roles but never to custom roles", () => {
    expect(effectiveRolePermissions("owner", true, ["audit.read"])).toContain("workspace.export");
    expect(effectiveRolePermissions("custom", false, ["audit.read", "bogus"])).toEqual(["audit.read"]);
    expect(effectiveRolePermissions("employee", true, [])).not.toContain("reviews.calibrate");
  });
});

describe("workspace export contract", () => {
  const payload = buildWorkspaceExport({
    tenantId: "org-1",
    exportedAt: "2026-10-26T00:00:00.000Z",
    collections: {
      members: [{ id: "b", name: "B", email: "b@example.com" }, { id: "a", name: "A", email: "a@example.com" }],
      goals: [{ id: "g1", ownerId: "a", title: "Ship", progress: 10 }],
    },
  });

  it("uses the shared manifest envelope and lists every Performance file", () => {
    expect(payload.manifest.schema).toBe(EXPORT_MANIFEST_SCHEMA);
    expect(payload.manifest.version).toBe("1.0.0");
    expect(payload.manifest.product).toBe("performance");
    expect(payload.manifest.tenantId).toBe("org-1");
    expect(payload.manifest.files.map((file) => file.path)).toEqual(EXPORT_FILES.map((file) => file.path));
    expect(payload.manifest.files.every((file) => file.version === "1.0.0" && /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
  });

  it("is deterministic, sorted and self-verifying", () => {
    expect(payload.files["members.json"].map((record) => record.id)).toEqual(["a", "b"]);
    expect(payload.files["teams.json"]).toEqual([]);
    expect(verifyWorkspaceExport(payload)).toEqual([]);
    const again = buildWorkspaceExport({
      tenantId: "org-1",
      exportedAt: "2026-10-26T00:00:00.000Z",
      collections: { goals: [{ progress: 10, title: "Ship", ownerId: "a", id: "g1" }], members: [{ email: "a@example.com", name: "A", id: "a" }, { id: "b", name: "B", email: "b@example.com" }] },
    });
    expect(again.manifest.files).toEqual(payload.manifest.files);
  });

  it("detects tampering", () => {
    const tampered = structuredClone(payload);
    tampered.files["goals.json"][0].title = "Changed";
    expect(verifyWorkspaceExport(tampered)).toEqual(["goals.json checksum does not match the manifest."]);
  });
});

describe("scheduled phases", () => {
  const base = { peerNominationEnabled: true, calibrationEnabled: true };
  it("launches on the launch day and ends other phases after their end day", () => {
    const schedule = { ...EMPTY_SCHEDULE, launchOn: "2026-10-20", nominationEndsOn: "2026-10-25" };
    expect(duePhase({ ...base, state: "draft", schedule, now: new Date("2026-10-19T23:00:00Z") }).due).toBe(false);
    expect(duePhase({ ...base, state: "draft", schedule, now: new Date("2026-10-20T00:00:01Z") })).toMatchObject({ due: true, nextState: "peer_nomination" });
    expect(duePhase({ ...base, state: "peer_nomination", schedule, now: new Date("2026-10-25T18:00:00Z") }).due).toBe(false);
    expect(duePhase({ ...base, state: "peer_nomination", schedule, now: new Date("2026-10-28T00:00:00Z") })).toMatchObject({ due: true, nextState: "review_writing", overdueDays: 2 });
  });
  it("skips disabled phases and never advances closed cycles or unscheduled phases", () => {
    const schedule = { ...EMPTY_SCHEDULE, launchOn: "2026-01-01", writingEndsOn: "2026-02-01" };
    expect(duePhase({ peerNominationEnabled: false, calibrationEnabled: false, state: "draft", schedule, now: new Date("2026-03-01") }).nextState).toBe("review_writing");
    expect(duePhase({ peerNominationEnabled: false, calibrationEnabled: false, state: "review_writing", schedule, now: new Date("2026-03-01") }).nextState).toBe("acknowledgement");
    expect(duePhase({ ...base, state: "closed", schedule, now: new Date("2027-01-01") }).due).toBe(false);
    expect(duePhase({ ...base, state: "calibration", schedule, now: new Date("2027-01-01") }).due).toBe(false);
  });
  it("rejects out-of-order phase dates", () => {
    expect(validateSchedule({ ...EMPTY_SCHEDULE, launchOn: "2026-01-01", writingEndsOn: "2026-02-01" })).toBeNull();
    expect(validateSchedule({ ...EMPTY_SCHEDULE, launchOn: "2026-03-01", writingEndsOn: "2026-02-01" })).toMatch(/in order/);
  });
});
