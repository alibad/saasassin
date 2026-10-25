import "server-only";

import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import type { SessionUser } from "@/lib/lattice/auth";
import {
  auditRecord,
  authorizeOrganization,
  LatticeDataError,
  memberFromSnapshot,
  stableId,
  toIso,
} from "@/lib/lattice/data";
import { buildWorkspaceExport, type ExportCollection, type ExportRecord } from "@/lib/lattice/export";
import { dispatchWebhookEvent } from "@/lib/lattice/integrations-data";
import { hasPermission } from "@/lib/lattice/permissions";
import {
  previewCycleTransition,
  type ReviewCycleState,
} from "@/lib/lattice/state-machine";
import {
  assemblePacket,
  assignmentKey,
  DEFAULT_ANONYMITY_THRESHOLD,
  duePhase,
  EMPTY_SCHEDULE,
  type CycleSchedule,
  generateAssignments,
  nominationKey,
  planReminders,
  summarizeRatings,
  validateNomination,
  type AssignmentMember,
  type GoalStatus,
  type ReviewDirection,
  type ReviewForSummary,
} from "@/lib/lattice/program";
import {
  EMPTY_PROGRAM,
  type ProgramCalibrationRow,
  type ProgramFeedback,
  type ProgramGoal,
  type ProgramNomination,
  type ProgramOneOnOne,
  type ProgramPacket,
  type ProgramReviewProgress,
  type ProgramSnapshot,
} from "@/lib/lattice/program-types";
import type { WorkspaceMember, WorkspaceSnapshot } from "@/types/lattice";

const MAX_WRITES_PER_BATCH = 400;

function orgRef(db: Firestore, organizationId: string) {
  return db.collection("organizations").doc(organizationId);
}

export function toAssignmentMembers(members: WorkspaceMember[]): AssignmentMember[] {
  return members.map((member) => ({
    id: member.id,
    name: member.name,
    managerId: member.managerId,
    teamId: member.teamId,
    active: member.status === "active",
  }));
}

function reviewForSummary(document: QueryDocumentSnapshot<DocumentData>): ReviewForSummary {
  const data = document.data();
  return {
    id: document.id,
    subjectId: String(data.subjectId ?? ""),
    reviewerId: String(data.reviewerId ?? ""),
    direction: (data.direction ?? "self") as ReviewDirection,
    state: data.state === "submitted" ? "submitted" : "draft",
    answers: data.answers && typeof data.answers === "object" ? data.answers : {},
  };
}

/** Writes documents in chunks; Firestore caps a batch at 500 operations. */
export async function writeInChunks(
  db: Firestore,
  writes: Array<{ ref: DocumentReference; data: DocumentData; merge?: boolean }>,
) {
  for (let index = 0; index < writes.length; index += MAX_WRITES_PER_BATCH) {
    const batch = db.batch();
    for (const write of writes.slice(index, index + MAX_WRITES_PER_BATCH)) {
      batch.set(write.ref, write.data, { merge: Boolean(write.merge) });
    }
    await batch.commit();
  }
}

async function loadMembers(db: Firestore, organizationId: string) {
  const snapshot = await orgRef(db, organizationId).collection("members").get();
  return snapshot.docs.map(memberFromSnapshot);
}

async function requireCycle(db: Firestore, organizationId: string, cycleId: string) {
  const cycleRef = orgRef(db, organizationId).collection("reviewCycles").doc(cycleId);
  const cycle = await cycleRef.get();
  if (!cycle.exists) throw new LatticeDataError("Review cycle not found.", 404);
  return { cycleRef, cycle, data: cycle.data()! };
}

function permissionsOf(role: { permissions: string[] } | null) {
  return role?.permissions ?? [];
}

// ---------------------------------------------------------------------------
// Cycle transitions (assignment generation, packet release, safe reopen)
// ---------------------------------------------------------------------------

async function loadTransitionContext(
  db: Firestore,
  organizationId: string,
  cycleId: string,
  targetState: ReviewCycleState,
) {
  const base = orgRef(db, organizationId);
  const cycleRef = base.collection("reviewCycles").doc(cycleId);
  const [cycle, reviews, nominations, calibrations, packets] = await Promise.all([
    cycleRef.get(),
    cycleRef.collection("reviews").get(),
    cycleRef.collection("nominations").get(),
    cycleRef.collection("calibrations").get(),
    cycleRef.collection("packets").get(),
  ]);
  if (!cycle.exists) throw new LatticeDataError("Review cycle not found.", 404);
  const data = cycle.data()!;
  const subjects = new Set(reviews.docs.map((review) => String(review.data().subjectId ?? "")));
  const calibrated = new Set(
    calibrations.docs.filter((document) => typeof document.data().rating === "number").map((document) => document.id),
  );
  const preview = previewCycleTransition({
    from: data.state as ReviewCycleState,
    to: targetState,
    config: {
      peerNominationEnabled: Boolean(data.peerNominationEnabled),
      calibrationEnabled: Boolean(data.calibrationEnabled),
    },
    assignedReviews: reviews.size,
    submittedReviews: reviews.docs.filter((review) => review.data().state === "submitted").length,
    pendingNominations: nominations.docs.filter((document) => document.data().state === "pending").length,
    uncalibratedSubjects: data.calibrationEnabled ? [...subjects].filter((subject) => !calibrated.has(subject)).length : 0,
    unacknowledgedPackets: packets.docs.filter((document) => document.data().state === "released").length,
  });
  return { base, cycleRef, cycle, data, reviews, nominations, packets, preview };
}

function reviewSeedData(cycleId: string, templateId: unknown, seed: { subjectId: string; reviewerId: string; direction: ReviewDirection }) {
  return {
    cycleId,
    templateId,
    subjectId: seed.subjectId,
    reviewerId: seed.reviewerId,
    direction: seed.direction,
    state: "draft",
    answers: {},
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function transitionReviewCycle(input: {
  actor: SessionUser;
  organizationId: string;
  cycleId: string;
  targetState: ReviewCycleState;
  dryRun: boolean;
}) {
  const { actor, organizationId, cycleId, targetState, dryRun } = input;
  const { db } = await authorizeOrganization(actor, organizationId, "reviews.manage");
  const context = await loadTransitionContext(db, organizationId, cycleId, targetState);
  if (dryRun || !context.preview.canTransition) return context.preview;

  const cycleData = context.data;
  const existingReviewIds = new Set(context.reviews.docs.map((review) => review.id));
  const forward = context.preview.direction === "forward";
  const writes: Array<{ ref: DocumentReference; data: DocumentData; merge?: boolean }> = [];
  let assignmentsCreated = 0;

  const generationPhase = forward && cycleData.state === "draft"
    ? "launch"
    : forward && cycleData.state === "peer_nomination"
      ? "peer"
      : null;
  if (generationPhase) {
    const [template, members] = await Promise.all([
      context.base.collection("reviewTemplates").doc(String(cycleData.templateId)).get(),
      loadMembers(db, organizationId),
    ]);
    if (!template.exists) throw new LatticeDataError("The cycle template no longer exists.");
    const directions = (Array.isArray(template.data()?.directions) ? template.data()!.directions : ["self"]) as ReviewDirection[];
    const seeds = generateAssignments({
      phase: generationPhase,
      members: toAssignmentMembers(members),
      directions,
      peerNominationEnabled: Boolean(cycleData.peerNominationEnabled),
      approvedNominations: context.nominations.docs
        .filter((document) => document.data().state === "approved")
        .map((document) => ({ subjectId: String(document.data().subjectId), peerId: String(document.data().peerId) })),
    });
    for (const seed of seeds) {
      const id = stableId("review", assignmentKey(seed));
      // Never overwrite an existing assignment: reopening and re-advancing a
      // phase must not reset drafts or submitted answers.
      if (existingReviewIds.has(id)) continue;
      writes.push({ ref: context.cycleRef.collection("reviews").doc(id), data: reviewSeedData(cycleId, cycleData.templateId, seed) });
      assignmentsCreated += 1;
    }
  }

  let packetsReleased = 0;
  if (forward && targetState === "acknowledgement") {
    const packetWrites = await buildPacketWrites(db, organizationId, cycleId);
    packetsReleased = packetWrites.length;
    writes.push(...packetWrites);
  }
  let packetsWithdrawn = 0;
  if (!forward && cycleData.state === "acknowledgement") {
    for (const packet of context.packets.docs) {
      packetsWithdrawn += 1;
      writes.push({ ref: packet.ref, data: { state: "withdrawn", updatedAt: FieldValue.serverTimestamp() }, merge: true });
    }
  }

  // Idempotent writes land first; the guarded state flip below is the commit point.
  await writeInChunks(db, writes);

  const auditRef = context.base.collection("auditEvents").doc();
  await db.runTransaction(async (transaction) => {
    const freshCycle = await transaction.get(context.cycleRef);
    if (freshCycle.data()?.state !== cycleData.state) {
      throw new LatticeDataError("The cycle changed while the transition was being confirmed.", 409);
    }
    transaction.update(context.cycleRef, {
      state: targetState,
      updatedAt: FieldValue.serverTimestamp(),
      lastTransitionedBy: actor.uid,
    });
    transaction.set(auditRef, auditRecord({
      actor,
      eventType: forward ? "review_cycle.transitioned" : "review_cycle.reopened",
      entityType: "review_cycle",
      entityId: cycleId,
      summary: `Moved ${String(cycleData.name)} from ${String(cycleData.state)} to ${targetState}.`,
      metadata: { from: cycleData.state, to: targetState, assignmentsCreated, packetsReleased, packetsWithdrawn },
    }));
  });
  await dispatchWebhookEvent(organizationId, "review_cycle.transitioned", {
    cycleId,
    from: cycleData.state,
    to: targetState,
    direction: context.preview.direction,
  }).catch((error) => console.error("Webhook dispatch failed", error));
  return context.preview;
}

export function cycleSchedule(data: DocumentData): CycleSchedule {
  const stored = (data.schedule && typeof data.schedule === "object" ? data.schedule : {}) as Partial<CycleSchedule>;
  return {
    ...EMPTY_SCHEDULE,
    ...stored,
    writingEndsOn: typeof data.dueDate === "string" ? data.dueDate : null,
  };
}

/**
 * Advances every cycle whose scheduled phase end has passed, one adjacent phase
 * per run, through the same previewed and audited transition admins use by hand.
 * Blocked cycles are reported, never forced.
 */
export async function advanceDuePhases(input: { actor: SessionUser; organizationId: string }) {
  const { actor, organizationId } = input;
  const { db } = await authorizeOrganization(actor, organizationId, "reviews.manage");
  const cycles = await orgRef(db, organizationId).collection("reviewCycles").get();
  const now = new Date();
  const results: Array<{ cycleId: string; name: string; from: string; to: string; status: "advanced" | "blocked"; reasons: string[] }> = [];
  for (const cycle of cycles.docs) {
    const data = cycle.data();
    const due = duePhase({
      state: String(data.state ?? "draft"),
      schedule: cycleSchedule(data),
      peerNominationEnabled: Boolean(data.peerNominationEnabled),
      calibrationEnabled: Boolean(data.calibrationEnabled),
      now,
    });
    if (!due.due || !due.nextState) continue;
    const target = due.nextState as ReviewCycleState;
    const preview = await transitionReviewCycle({ actor, organizationId, cycleId: cycle.id, targetState: target, dryRun: true });
    if (!preview.canTransition) {
      results.push({ cycleId: cycle.id, name: String(data.name ?? ""), from: String(data.state), to: target, status: "blocked", reasons: preview.blockers });
      continue;
    }
    await transitionReviewCycle({ actor, organizationId, cycleId: cycle.id, targetState: target, dryRun: false });
    results.push({ cycleId: cycle.id, name: String(data.name ?? ""), from: String(data.state), to: target, status: "advanced", reasons: [] });
  }
  await orgRef(db, organizationId).collection("auditEvents").add(auditRecord({
    actor,
    eventType: "review_program.due_phases_checked",
    entityType: "organization",
    entityId: organizationId,
    summary: `Checked scheduled phases: ${results.filter((result) => result.status === "advanced").length} advanced, ${results.filter((result) => result.status === "blocked").length} blocked.`,
    metadata: { results: results.map(({ cycleId, from, to, status }) => ({ cycleId, from, to, status })) },
  }));
  return results;
}

// ---------------------------------------------------------------------------
// Peer nominations
// ---------------------------------------------------------------------------

export async function nominatePeers(input: {
  actor: SessionUser;
  organizationId: string;
  cycleId: string;
  subjectId: string;
  peerIds: string[];
}) {
  const { actor, organizationId, cycleId } = input;
  const { db, member, role } = await authorizeOrganization(actor, organizationId, "reviews.submit");
  const { cycleRef, data: cycle } = await requireCycle(db, organizationId, cycleId);
  if (cycle.state !== "peer_nomination") {
    throw new LatticeDataError("Peers can only be nominated during peer nomination.", 409);
  }
  const members = await loadMembers(db, organizationId);
  const subject = members.find((candidate) => candidate.id === input.subjectId);
  const isSelf = input.subjectId === member.id;
  const isManager = subject?.managerId === member.id;
  const isAdmin = hasPermission(permissionsOf(role), "reviews.manage");
  if (!isSelf && !isManager && !isAdmin) {
    throw new LatticeDataError("Only the employee, their manager, or a review admin can nominate peers.", 403);
  }
  const { peerIds, errors } = validateNomination({
    subjectId: input.subjectId,
    peerIds: input.peerIds,
    members: toAssignmentMembers(members),
  });
  if (errors.length) throw new LatticeDataError(errors[0]);
  const state = isManager || isAdmin ? "approved" : "pending";
  const batch = db.batch();
  for (const peerId of peerIds) {
    batch.set(cycleRef.collection("nominations").doc(nominationKey(input.subjectId, peerId)), {
      cycleId,
      subjectId: input.subjectId,
      peerId,
      state,
      nominatedBy: member.id,
      nominatedByName: member.name,
      decidedBy: state === "approved" ? member.id : null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  batch.set(orgRef(db, organizationId).collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: "review_nomination.created",
    entityType: "review_cycle",
    entityId: cycleId,
    summary: `Nominated ${peerIds.length} peer${peerIds.length === 1 ? "" : "s"} for ${subject?.name ?? "an employee"} (${state}).`,
    metadata: { subjectId: input.subjectId, peerIds, state },
  }));
  await batch.commit();
  return { state, nominated: peerIds.length };
}

export async function decideNomination(input: {
  actor: SessionUser;
  organizationId: string;
  cycleId: string;
  nominationId: string;
  decision: "approved" | "declined";
}) {
  const { actor, organizationId, cycleId } = input;
  const { db, member, role } = await authorizeOrganization(actor, organizationId, "reviews.submit");
  const { cycleRef, data: cycle } = await requireCycle(db, organizationId, cycleId);
  if (cycle.state !== "peer_nomination") {
    throw new LatticeDataError("Nominations can only be decided during peer nomination.", 409);
  }
  const nominationRef = cycleRef.collection("nominations").doc(input.nominationId);
  const nomination = await nominationRef.get();
  if (!nomination.exists) throw new LatticeDataError("Nomination not found.", 404);
  const subjectId = String(nomination.data()?.subjectId ?? "");
  const subject = await orgRef(db, organizationId).collection("members").doc(subjectId).get();
  const isManager = subject.data()?.managerId === member.id;
  if (!isManager && !hasPermission(permissionsOf(role), "reviews.manage")) {
    throw new LatticeDataError("Only the employee's manager or a review admin can decide nominations.", 403);
  }
  const batch = db.batch();
  batch.update(nominationRef, {
    state: input.decision,
    decidedBy: member.id,
    decidedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(orgRef(db, organizationId).collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: `review_nomination.${input.decision}`,
    entityType: "review_nomination",
    entityId: input.nominationId,
    summary: `${input.decision === "approved" ? "Approved" : "Declined"} a peer nomination for ${String(subject.data()?.name ?? "an employee")}.`,
    metadata: { cycleId, subjectId },
  }));
  await batch.commit();
}

// ---------------------------------------------------------------------------
// Deadlines and reminders
// ---------------------------------------------------------------------------

export async function setCycleDeadline(input: {
  actor: SessionUser;
  organizationId: string;
  cycleId: string;
  dueDate: string | null;
}) {
  const { actor, organizationId, cycleId, dueDate } = input;
  const { db } = await authorizeOrganization(actor, organizationId, "reviews.manage");
  const { cycleRef, data: cycle } = await requireCycle(db, organizationId, cycleId);
  if (cycle.state === "closed") throw new LatticeDataError("Reopen the cycle before changing its deadline.", 409);
  const batch = db.batch();
  batch.update(cycleRef, { dueDate, updatedAt: FieldValue.serverTimestamp() });
  batch.set(orgRef(db, organizationId).collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: "review_cycle.deadline_changed",
    entityType: "review_cycle",
    entityId: cycleId,
    summary: `Changed the ${String(cycle.name)} deadline from ${cycle.dueDate ?? "none"} to ${dueDate ?? "none"}.`,
    metadata: { from: cycle.dueDate ?? null, to: dueDate },
  }));
  await batch.commit();
}

export async function sendCycleReminders(input: {
  actor: SessionUser;
  organizationId: string;
  cycleId: string;
}) {
  const { actor, organizationId, cycleId } = input;
  const { db } = await authorizeOrganization(actor, organizationId, "reviews.manage");
  const { cycleRef, data: cycle } = await requireCycle(db, organizationId, cycleId);
  if (cycle.state !== "review_writing") {
    throw new LatticeDataError("Reminders are sent while reviews are being written.", 409);
  }
  const [reviews, members] = await Promise.all([
    cycleRef.collection("reviews").get(),
    loadMembers(db, organizationId),
  ]);
  const plans = planReminders({
    reviews: reviews.docs.map((review) => ({
      id: review.id,
      reviewerId: String(review.data().reviewerId ?? ""),
      state: String(review.data().state ?? "draft"),
    })),
    members: toAssignmentMembers(members),
    dueDate: typeof cycle.dueDate === "string" ? cycle.dueDate : null,
    now: new Date(),
  });
  const names = new Map(members.map((member) => [member.id, member.name]));
  const base = orgRef(db, organizationId);
  const writes = plans.map((plan) => ({
    ref: base.collection("notifications").doc(),
    data: {
      recipientId: plan.recipientId,
      kind: plan.kind,
      cycleId,
      title: plan.kind === "reminder"
        ? `${plan.reviewIds.length} review${plan.reviewIds.length === 1 ? "" : "s"} waiting in ${String(cycle.name)}`
        : `${names.get(plan.aboutReviewerId) ?? "A direct report"} is overdue in ${String(cycle.name)}`,
      body: plan.kind === "reminder"
        ? (cycle.dueDate ? `Due ${String(cycle.dueDate)}.` : "No deadline is set.")
        : `${plan.reviewIds.length} review${plan.reviewIds.length === 1 ? " is" : "s are"} past the ${String(cycle.dueDate)} deadline.`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    },
  }));
  await writeInChunks(db, writes);
  const reminders = plans.filter((plan) => plan.kind === "reminder").length;
  const escalations = plans.length - reminders;
  const batch = db.batch();
  batch.update(cycleRef, { lastRemindedAt: FieldValue.serverTimestamp() });
  batch.set(base.collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: "review_cycle.reminders_sent",
    entityType: "review_cycle",
    entityId: cycleId,
    summary: `Sent ${reminders} reminder${reminders === 1 ? "" : "s"} and ${escalations} escalation${escalations === 1 ? "" : "s"} for ${String(cycle.name)}.`,
    metadata: { reminders, escalations },
  }));
  await batch.commit();
  return { reminders, escalations };
}

export async function markNotificationsRead(input: { actor: SessionUser; organizationId: string }) {
  const { db, member } = await authorizeOrganization(input.actor, input.organizationId, "reviews.read");
  const unread = await orgRef(db, input.organizationId)
    .collection("notifications")
    .where("recipientId", "==", member.id)
    .where("read", "==", false)
    .get();
  await writeInChunks(db, unread.docs.map((document) => ({ ref: document.ref, data: { read: true }, merge: true })));
  return { read: unread.size };
}

// ---------------------------------------------------------------------------
// Calibration, packets and acknowledgement
// ---------------------------------------------------------------------------

export async function saveCalibration(input: {
  actor: SessionUser;
  organizationId: string;
  cycleId: string;
  subjectId: string;
  rating: number | null;
  note: string;
}) {
  const { actor, organizationId, cycleId, subjectId } = input;
  const { db, member } = await authorizeOrganization(actor, organizationId, "reviews.calibrate");
  const { cycleRef, data: cycle } = await requireCycle(db, organizationId, cycleId);
  if (cycle.state !== "calibration") {
    throw new LatticeDataError("Ratings can only be calibrated during calibration.", 409);
  }
  const subject = await orgRef(db, organizationId).collection("members").doc(subjectId).get();
  if (!subject.exists) throw new LatticeDataError("Employee not found.", 404);
  const batch = db.batch();
  batch.set(cycleRef.collection("calibrations").doc(subjectId), {
    cycleId,
    subjectId,
    rating: input.rating,
    note: input.note.trim(),
    calibratedBy: member.id,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(orgRef(db, organizationId).collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: "review_calibration.saved",
    entityType: "review_calibration",
    entityId: `${cycleId}/${subjectId}`,
    summary: `Calibrated ${String(subject.data()?.name ?? "an employee")} in ${String(cycle.name)}.`,
    metadata: { cycleId, subjectId },
  }));
  await batch.commit();
}

/** Builds released packets for every reviewed employee in the cycle. */
export async function buildPacketWrites(db: Firestore, organizationId: string, cycleId: string) {
  const base = orgRef(db, organizationId);
  const cycleRef = base.collection("reviewCycles").doc(cycleId);
  const [cycle, reviews, calibrations, members] = await Promise.all([
    cycleRef.get(),
    cycleRef.collection("reviews").get(),
    cycleRef.collection("calibrations").get(),
    loadMembers(db, organizationId),
  ]);
  const template = await base.collection("reviewTemplates").doc(String(cycle.data()?.templateId ?? "")).get();
  const questions = Array.isArray(template.data()?.questions)
    ? (template.data()!.questions as Array<{ id: string; prompt: string }>)
    : [];
  const summaries = reviews.docs.map(reviewForSummary);
  const ratings = new Map(calibrations.docs.map((document) => [document.id, document.data().rating ?? null]));
  const names = new Map(members.map((member) => [member.id, member.name]));
  const subjects = [...new Set(summaries.map((review) => review.subjectId))];
  return subjects.map((subjectId) => ({
    ref: cycleRef.collection("packets").doc(subjectId),
    data: {
      cycleId,
      subjectId,
      state: "released",
      content: assemblePacket({
        subjectId,
        reviews: summaries,
        questions,
        memberNames: names,
        calibratedRating: typeof ratings.get(subjectId) === "number" ? ratings.get(subjectId) : null,
        anonymityThreshold: typeof cycle.data()?.anonymityThreshold === "number"
          ? cycle.data()!.anonymityThreshold
          : DEFAULT_ANONYMITY_THRESHOLD,
      }),
      releasedAt: FieldValue.serverTimestamp(),
      acknowledgedAt: null,
      acknowledgementComment: "",
      updatedAt: FieldValue.serverTimestamp(),
    },
    merge: true,
  }));
}

export async function acknowledgePacket(input: {
  actor: SessionUser;
  organizationId: string;
  cycleId: string;
  comment: string;
}) {
  const { actor, organizationId, cycleId } = input;
  const { db, member } = await authorizeOrganization(actor, organizationId, "reviews.read");
  const { cycleRef, data: cycle } = await requireCycle(db, organizationId, cycleId);
  const packetRef = cycleRef.collection("packets").doc(member.id);
  const auditRef = orgRef(db, organizationId).collection("auditEvents").doc();
  await db.runTransaction(async (transaction) => {
    const packet = await transaction.get(packetRef);
    if (!packet.exists) throw new LatticeDataError("No review packet has been released to you.", 404);
    if (cycle.state !== "acknowledgement" || packet.data()?.state !== "released") {
      throw new LatticeDataError("This packet is not waiting for acknowledgement.", 409);
    }
    transaction.update(packetRef, {
      state: "acknowledged",
      acknowledgedAt: FieldValue.serverTimestamp(),
      acknowledgementComment: input.comment.trim(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(auditRef, auditRecord({
      actor,
      eventType: "review_packet.acknowledged",
      entityType: "review_packet",
      entityId: `${cycleId}/${member.id}`,
      summary: `Acknowledged the ${String(cycle.name)} review packet.`,
      metadata: { cycleId, commented: Boolean(input.comment.trim()) },
    }));
  });
  await dispatchWebhookEvent(organizationId, "review_packet.acknowledged", { cycleId, subjectId: member.id })
    .catch((error) => console.error("Webhook dispatch failed", error));
}

export async function reopenPacket(input: {
  actor: SessionUser;
  organizationId: string;
  cycleId: string;
  subjectId: string;
  reason: string;
}) {
  const { actor, organizationId, cycleId, subjectId } = input;
  const { db, member } = await authorizeOrganization(actor, organizationId, "reviews.calibrate");
  const { cycleRef, data: cycle } = await requireCycle(db, organizationId, cycleId);
  const packetRef = cycleRef.collection("packets").doc(subjectId);
  const auditRef = orgRef(db, organizationId).collection("auditEvents").doc();
  await db.runTransaction(async (transaction) => {
    const packet = await transaction.get(packetRef);
    if (!packet.exists) throw new LatticeDataError("Packet not found.", 404);
    if (cycle.state !== "acknowledgement" || packet.data()?.state !== "acknowledged") {
      throw new LatticeDataError("Only acknowledged packets in an open acknowledgement phase can be reopened.", 409);
    }
    transaction.update(packetRef, {
      state: "released",
      acknowledgedAt: null,
      acknowledgementComment: "",
      history: FieldValue.arrayUnion({
        acknowledgedAt: toIso(packet.data()?.acknowledgedAt) ?? null,
        acknowledgementComment: String(packet.data()?.acknowledgementComment ?? ""),
        reopenedAt: new Date().toISOString(),
        reopenedBy: member.id,
        reason: input.reason.trim(),
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(auditRef, auditRecord({
      actor,
      eventType: "review_packet.reopened",
      entityType: "review_packet",
      entityId: `${cycleId}/${subjectId}`,
      summary: `Reopened a ${String(cycle.name)} packet for acknowledgement.`,
      metadata: { cycleId, subjectId },
    }));
  });
}

// ---------------------------------------------------------------------------
// Goals, feedback and one-to-ones
// ---------------------------------------------------------------------------

export async function createGoal(input: {
  actor: SessionUser;
  organizationId: string;
  ownerId: string | null;
  title: string;
  description: string;
  dueDate: string | null;
  visibility: "public" | "manager";
}) {
  const { actor, organizationId } = input;
  const { db, member, role } = await authorizeOrganization(actor, organizationId, "reviews.read");
  const ownerId = input.ownerId ?? member.id;
  const owner = await orgRef(db, organizationId).collection("members").doc(ownerId).get();
  if (!owner.exists) throw new LatticeDataError("Employee not found.", 404);
  const allowed = ownerId === member.id
    || owner.data()?.managerId === member.id
    || hasPermission(permissionsOf(role), "reviews.manage");
  if (!allowed) throw new LatticeDataError("You can only set goals for yourself or your direct reports.", 403);
  const goalRef = orgRef(db, organizationId).collection("goals").doc();
  const batch = db.batch();
  batch.set(goalRef, {
    ownerId,
    title: input.title.trim(),
    description: input.description.trim(),
    dueDate: input.dueDate,
    progress: 0,
    status: "on_track",
    visibility: input.visibility,
    createdBy: member.id,
    checkIns: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(orgRef(db, organizationId).collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: "goal.created",
    entityType: "goal",
    entityId: goalRef.id,
    summary: `Created a goal for ${String(owner.data()?.name ?? "an employee")}.`,
    metadata: { ownerId },
  }));
  await batch.commit();
  return goalRef.id;
}

export async function checkInGoal(input: {
  actor: SessionUser;
  organizationId: string;
  goalId: string;
  progress: number;
  status: GoalStatus;
  note: string;
}) {
  const { actor, organizationId, goalId } = input;
  const { db, member, role } = await authorizeOrganization(actor, organizationId, "reviews.read");
  const base = orgRef(db, organizationId);
  const goalRef = base.collection("goals").doc(goalId);
  const goal = await goalRef.get();
  if (!goal.exists) throw new LatticeDataError("Goal not found.", 404);
  const ownerId = String(goal.data()?.ownerId ?? "");
  const owner = await base.collection("members").doc(ownerId).get();
  const allowed = ownerId === member.id
    || owner.data()?.managerId === member.id
    || hasPermission(permissionsOf(role), "reviews.manage");
  if (!allowed) throw new LatticeDataError("Only the goal owner or their manager can check in.", 403);
  const batch = db.batch();
  batch.update(goalRef, {
    progress: input.progress,
    status: input.status,
    checkIns: FieldValue.arrayUnion({
      at: new Date().toISOString(),
      progress: input.progress,
      status: input.status,
      note: input.note.trim(),
      byId: member.id,
    }),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(base.collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: "goal.checked_in",
    entityType: "goal",
    entityId: goalId,
    summary: `Checked in on a goal at ${input.progress}% (${input.status.replace("_", " ")}).`,
    metadata: { ownerId, progress: input.progress, status: input.status },
  }));
  await batch.commit();
}

export async function giveFeedback(input: {
  actor: SessionUser;
  organizationId: string;
  recipientId: string;
  kind: "praise" | "constructive";
  body: string;
  visibility: "private" | "manager" | "public";
}) {
  const { actor, organizationId } = input;
  const { db, member } = await authorizeOrganization(actor, organizationId, "reviews.read");
  if (input.recipientId === member.id) throw new LatticeDataError("Feedback must be for someone else.");
  const base = orgRef(db, organizationId);
  const recipient = await base.collection("members").doc(input.recipientId).get();
  if (!recipient.exists) throw new LatticeDataError("Employee not found.", 404);
  const feedbackRef = base.collection("feedback").doc();
  const batch = db.batch();
  batch.set(feedbackRef, {
    authorId: member.id,
    recipientId: input.recipientId,
    kind: input.kind,
    body: input.body.trim(),
    visibility: input.visibility,
    createdAt: FieldValue.serverTimestamp(),
  });
  // Feedback content stays out of the audit log; only the fact is recorded.
  batch.set(base.collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: "feedback.given",
    entityType: "feedback",
    entityId: feedbackRef.id,
    summary: `Gave ${input.kind} feedback to ${String(recipient.data()?.name ?? "an employee")}.`,
    metadata: { recipientId: input.recipientId, visibility: input.visibility },
  }));
  await batch.commit();
  return feedbackRef.id;
}

export async function createOneOnOne(input: {
  actor: SessionUser;
  organizationId: string;
  counterpartId: string;
  scheduledFor: string;
}) {
  const { actor, organizationId } = input;
  const { db, member } = await authorizeOrganization(actor, organizationId, "reviews.read");
  const base = orgRef(db, organizationId);
  const counterpart = await base.collection("members").doc(input.counterpartId).get();
  if (!counterpart.exists) throw new LatticeDataError("Employee not found.", 404);
  let managerId: string;
  let reportId: string;
  if (counterpart.data()?.managerId === member.id) {
    managerId = member.id;
    reportId = input.counterpartId;
  } else if (member.managerId === input.counterpartId) {
    managerId = input.counterpartId;
    reportId = member.id;
  } else {
    throw new LatticeDataError("One-to-ones are between an employee and their manager.", 403);
  }
  const meetingRef = base.collection("oneOnOnes").doc();
  const batch = db.batch();
  batch.set(meetingRef, {
    managerId,
    reportId,
    participantIds: [managerId, reportId],
    scheduledFor: input.scheduledFor,
    status: "scheduled",
    agenda: [],
    sharedNotes: "",
    createdBy: member.id,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(base.collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: "one_on_one.scheduled",
    entityType: "one_on_one",
    entityId: meetingRef.id,
    summary: `Scheduled a one-to-one for ${input.scheduledFor.slice(0, 10)}.`,
    metadata: { managerId, reportId },
  }));
  await batch.commit();
  return meetingRef.id;
}

export async function updateOneOnOne(input: {
  actor: SessionUser;
  organizationId: string;
  meetingId: string;
  operation:
    | { type: "add_agenda_item"; text: string }
    | { type: "toggle_agenda_item"; itemId: string }
    | { type: "save_notes"; sharedNotes: string }
    | { type: "complete" };
}) {
  const { actor, organizationId, meetingId, operation } = input;
  const { db, member } = await authorizeOrganization(actor, organizationId, "reviews.read");
  const base = orgRef(db, organizationId);
  const meetingRef = base.collection("oneOnOnes").doc(meetingId);
  const auditRef = base.collection("auditEvents").doc();
  await db.runTransaction(async (transaction) => {
    const meeting = await transaction.get(meetingRef);
    if (!meeting.exists) throw new LatticeDataError("One-to-one not found.", 404);
    const data = meeting.data()!;
    if (data.managerId !== member.id && data.reportId !== member.id) {
      throw new LatticeDataError("Only the two participants can edit this one-to-one.", 403);
    }
    if (data.status === "completed" && operation.type !== "save_notes") {
      throw new LatticeDataError("This one-to-one is already completed.", 409);
    }
    const agenda = Array.isArray(data.agenda) ? data.agenda as Array<Record<string, unknown>> : [];
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (operation.type === "add_agenda_item") {
      update.agenda = [...agenda, {
        id: `item-${Date.now().toString(36)}-${agenda.length}`,
        text: operation.text.trim(),
        authorId: member.id,
        authorName: member.name,
        done: false,
      }];
    } else if (operation.type === "toggle_agenda_item") {
      update.agenda = agenda.map((item) => item.id === operation.itemId ? { ...item, done: !item.done } : item);
    } else if (operation.type === "save_notes") {
      update.sharedNotes = operation.sharedNotes;
    } else {
      update.status = "completed";
      update.completedAt = FieldValue.serverTimestamp();
    }
    transaction.update(meetingRef, update);
    if (operation.type === "complete") {
      transaction.set(auditRef, auditRecord({
        actor,
        eventType: "one_on_one.completed",
        entityType: "one_on_one",
        entityId: meetingId,
        summary: "Completed a one-to-one.",
      }));
    }
  });
}

// ---------------------------------------------------------------------------
// Saved report views
// ---------------------------------------------------------------------------

export async function saveReportView(input: {
  actor: SessionUser;
  organizationId: string;
  name: string;
  cycleId: string | null;
  teamId: string | null;
  shared: boolean;
}) {
  const { actor, organizationId } = input;
  const { db, member } = await authorizeOrganization(actor, organizationId, "reports.read");
  const base = orgRef(db, organizationId);
  if (input.cycleId && !(await base.collection("reviewCycles").doc(input.cycleId).get()).exists) {
    throw new LatticeDataError("That cycle no longer exists.");
  }
  const viewRef = base.collection("reportViews").doc();
  const batch = db.batch();
  batch.set(viewRef, {
    name: input.name.trim(),
    filters: { cycleId: input.cycleId, teamId: input.teamId },
    shared: input.shared,
    ownerId: member.id,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(base.collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: "report_view.saved",
    entityType: "report_view",
    entityId: viewRef.id,
    summary: `Saved report view ${input.name.trim()}${input.shared ? " (shared)" : ""}.`,
  }));
  await batch.commit();
  return viewRef.id;
}

export async function deleteReportView(input: { actor: SessionUser; organizationId: string; viewId: string }) {
  const { actor, organizationId, viewId } = input;
  const { db, member, role } = await authorizeOrganization(actor, organizationId, "reports.read");
  const base = orgRef(db, organizationId);
  const viewRef = base.collection("reportViews").doc(viewId);
  const view = await viewRef.get();
  if (!view.exists) throw new LatticeDataError("Saved view not found.", 404);
  if (view.data()?.ownerId !== member.id && !hasPermission(permissionsOf(role), "organization.manage")) {
    throw new LatticeDataError("Only the view's owner or a workspace admin can delete it.", 403);
  }
  const batch = db.batch();
  batch.delete(viewRef);
  batch.set(base.collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: "report_view.deleted",
    entityType: "report_view",
    entityId: viewId,
    summary: `Deleted report view ${String(view.data()?.name ?? "")}.`,
  }));
  await batch.commit();
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function serialize(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, serialize(entry)]));
  }
  return value;
}

function records(documents: Array<QueryDocumentSnapshot<DocumentData>>, extra: (document: QueryDocumentSnapshot<DocumentData>) => Record<string, unknown> = () => ({})): ExportRecord[] {
  return documents.map((document) => ({ ...(serialize(document.data()) as Record<string, unknown>), ...extra(document), id: document.id }));
}

export async function exportWorkspace(input: { actor: SessionUser; organizationId: string }) {
  const { actor, organizationId } = input;
  const { db } = await authorizeOrganization(actor, organizationId, "workspace.export");
  const base = orgRef(db, organizationId);
  const [organization, members, teams, roles, templates, cycles, goals, feedback, oneOnOnes, audit] = await Promise.all([
    base.get(),
    base.collection("members").get(),
    base.collection("teams").get(),
    base.collection("roles").get(),
    base.collection("reviewTemplates").get(),
    base.collection("reviewCycles").get(),
    base.collection("goals").get(),
    base.collection("feedback").get(),
    base.collection("oneOnOnes").get(),
    base.collection("auditEvents").get(),
  ]);
  const perCycle = await Promise.all(cycles.docs.map(async (cycle) => {
    const [reviews, nominations, calibrations, packets] = await Promise.all([
      cycle.ref.collection("reviews").get(),
      cycle.ref.collection("nominations").get(),
      cycle.ref.collection("calibrations").get(),
      cycle.ref.collection("packets").get(),
    ]);
    const withCycle = () => ({ cycleId: cycle.id });
    return {
      reviews: records(reviews.docs, withCycle).map((record) => ({ ...record, id: `${cycle.id}/${record.id}` })),
      nominations: records(nominations.docs, withCycle).map((record) => ({ ...record, id: `${cycle.id}/${record.id}` })),
      calibrations: records(calibrations.docs, withCycle).map((record) => ({ ...record, id: `${cycle.id}/${record.id}` })),
      packets: records(packets.docs, withCycle).map((record) => ({ ...record, id: `${cycle.id}/${record.id}` })),
    };
  }));
  const collections: Partial<Record<ExportCollection, ExportRecord[]>> = {
    organization: organization.exists ? [{ ...(serialize(organization.data()) as Record<string, unknown>), id: organization.id }] : [],
    members: records(members.docs),
    teams: records(teams.docs),
    roles: records(roles.docs),
    reviewTemplates: records(templates.docs),
    reviewCycles: records(cycles.docs),
    reviews: perCycle.flatMap((entry) => entry.reviews),
    nominations: perCycle.flatMap((entry) => entry.nominations),
    calibrations: perCycle.flatMap((entry) => entry.calibrations),
    packets: perCycle.flatMap((entry) => entry.packets),
    goals: records(goals.docs),
    feedback: records(feedback.docs),
    oneOnOnes: records(oneOnOnes.docs),
    auditEvents: records(audit.docs),
  };
  const payload = buildWorkspaceExport({ tenantId: organizationId, exportedAt: new Date().toISOString(), collections });
  await base.collection("auditEvents").add(auditRecord({
    actor,
    eventType: "workspace.exported",
    entityType: "organization",
    entityId: organizationId,
    summary: `Exported the workspace (${payload.manifest.files.reduce((sum, file) => sum + file.records, 0)} records).`,
    metadata: { version: payload.manifest.version },
  }));
  return payload;
}

// ---------------------------------------------------------------------------
// Program snapshot (server-filtered by role and relationship)
// ---------------------------------------------------------------------------

export async function getProgramSnapshot(
  actor: SessionUser,
  workspace: WorkspaceSnapshot,
): Promise<ProgramSnapshot> {
  const organizationId = workspace.organization?.id;
  const me = workspace.currentMember;
  if (!organizationId || !me || me.status !== "active") return { ...EMPTY_PROGRAM, now: new Date().toISOString() };
  const { db, role } = await authorizeOrganization(actor, organizationId, "reviews.read").catch(() => ({ db: null, role: null }));
  if (!db) return { ...EMPTY_PROGRAM, now: new Date().toISOString() };
  const permissions = permissionsOf(role);
  const canManage = hasPermission(permissions, "reviews.manage");
  const canReadAll = hasPermission(permissions, "reviews.read_all");
  const canCalibrate = hasPermission(permissions, "reviews.calibrate");
  const canReport = hasPermission(permissions, "reports.read");
  const base = orgRef(db, organizationId);
  const names = new Map(workspace.members.map((member) => [member.id, member.name]));
  const reportIds = new Set(workspace.members.filter((member) => member.managerId === me.id).map((member) => member.id));
  const nameOf = (id: string) => names.get(id) ?? "Former employee";

  const reportViewsSnapshot = canReport ? await base.collection("reportViews").get() : null;
  const [goalsSnapshot, feedbackSnapshot, managerMeetings, reportMeetings, notificationsSnapshot] = await Promise.all([
    base.collection("goals").get(),
    base.collection("feedback").get(),
    base.collection("oneOnOnes").where("managerId", "==", me.id).get(),
    base.collection("oneOnOnes").where("reportId", "==", me.id).get(),
    base.collection("notifications").where("recipientId", "==", me.id).get(),
  ]);

  const cycleDocs = await base.collection("reviewCycles").get();
  const templates = new Map(workspace.templates.map((template) => [template.id, template]));
  const perCycle = await Promise.all(cycleDocs.docs.map(async (cycle) => {
    const [reviews, nominations, calibrations, packets] = await Promise.all([
      cycle.ref.collection("reviews").get(),
      cycle.ref.collection("nominations").get(),
      cycle.ref.collection("calibrations").get(),
      cycle.ref.collection("packets").get(),
    ]);
    return { cycle, reviews, nominations, calibrations, packets };
  }));

  const cycles = perCycle.map(({ cycle }) => {
    const data = cycle.data();
    const template = templates.get(String(data.templateId ?? ""));
    return {
      id: cycle.id,
      name: String(data.name ?? "Untitled cycle"),
      state: String(data.state ?? "draft"),
      dueDate: typeof data.dueDate === "string" ? data.dueDate : null,
      directions: (template?.directions ?? ["self"]) as ReviewDirection[],
      peerNominationEnabled: Boolean(data.peerNominationEnabled),
      calibrationEnabled: Boolean(data.calibrationEnabled),
      lastRemindedAt: toIso(data.lastRemindedAt),
      anonymityThreshold: typeof data.anonymityThreshold === "number" ? data.anonymityThreshold : DEFAULT_ANONYMITY_THRESHOLD,
      schedule: cycleSchedule(data),
      phaseDue: duePhase({
        state: String(data.state ?? "draft"),
        schedule: cycleSchedule(data),
        peerNominationEnabled: Boolean(data.peerNominationEnabled),
        calibrationEnabled: Boolean(data.calibrationEnabled),
        now: new Date(),
      }),
    };
  });

  const nominations: ProgramNomination[] = perCycle.flatMap(({ cycle, nominations: snapshot }) =>
    snapshot.docs
      .map((document) => ({ document, data: document.data() }))
      .filter(({ data }) => canManage || data.subjectId === me.id || data.peerId === me.id || reportIds.has(String(data.subjectId)))
      .map(({ document, data }) => ({
        id: document.id,
        cycleId: cycle.id,
        subjectId: String(data.subjectId),
        subjectName: nameOf(String(data.subjectId)),
        peerId: String(data.peerId),
        peerName: nameOf(String(data.peerId)),
        state: data.state === "approved" || data.state === "declined" ? data.state : "pending",
        nominatedByName: String(data.nominatedByName ?? ""),
        canDecide: canManage || reportIds.has(String(data.subjectId)),
      })),
  );

  const progress: ProgramReviewProgress[] = canManage || canReadAll
    ? perCycle.flatMap(({ cycle, reviews }) => {
      const byReviewer = new Map<string, ProgramReviewProgress>();
      for (const review of reviews.docs) {
        const reviewerId = String(review.data().reviewerId ?? "");
        const entry = byReviewer.get(reviewerId) ?? { cycleId: cycle.id, reviewerId, reviewerName: nameOf(reviewerId), outstanding: 0, submitted: 0 };
        if (review.data().state === "submitted") entry.submitted += 1;
        else entry.outstanding += 1;
        byReviewer.set(reviewerId, entry);
      }
      return [...byReviewer.values()].sort((a, b) => b.outstanding - a.outstanding || a.reviewerName.localeCompare(b.reviewerName));
    })
    : [];

  const calibration: ProgramCalibrationRow[] = canCalibrate
    ? perCycle.flatMap(({ cycle, reviews, calibrations }) => {
      const template = templates.get(String(cycle.data().templateId ?? ""));
      const saved = new Map(calibrations.docs.map((document) => [document.id, document.data()]));
      return summarizeRatings(reviews.docs.map(reviewForSummary), template?.questions ?? []).map((summary) => ({
        cycleId: cycle.id,
        subjectId: summary.subjectId,
        subjectName: nameOf(summary.subjectId),
        summary,
        rating: typeof saved.get(summary.subjectId)?.rating === "number" ? saved.get(summary.subjectId)!.rating : null,
        note: String(saved.get(summary.subjectId)?.note ?? ""),
      }));
    })
    : [];

  const packets: ProgramPacket[] = perCycle.flatMap(({ cycle, packets: snapshot }) =>
    snapshot.docs
      .map((document) => ({ document, data: document.data() }))
      .filter(({ data }) => {
        const subjectId = String(data.subjectId);
        if (subjectId === me.id) return data.state !== "withdrawn";
        return canReadAll || canCalibrate || reportIds.has(subjectId);
      })
      .map(({ data }) => ({
        cycleId: cycle.id,
        cycleName: String(cycle.data().name ?? "Review cycle"),
        subjectId: String(data.subjectId),
        subjectName: nameOf(String(data.subjectId)),
        state: data.state === "acknowledged" || data.state === "withdrawn" ? data.state : "released",
        content: data.content ?? { subjectId: String(data.subjectId), calibratedRating: null, sections: [] },
        releasedAt: toIso(data.releasedAt),
        acknowledgedAt: toIso(data.acknowledgedAt),
        acknowledgementComment: String(data.acknowledgementComment ?? ""),
        reopenCount: Array.isArray(data.history) ? data.history.length : 0,
      })),
  );

  const goals: ProgramGoal[] = goalsSnapshot.docs
    .map((document) => ({ document, data: document.data() }))
    .filter(({ data }) => data.ownerId === me.id || reportIds.has(String(data.ownerId)) || data.visibility === "public" || canReadAll)
    .map(({ document, data }) => ({
      id: document.id,
      ownerId: String(data.ownerId),
      ownerName: nameOf(String(data.ownerId)),
      title: String(data.title ?? "Untitled goal"),
      description: String(data.description ?? ""),
      dueDate: typeof data.dueDate === "string" ? data.dueDate : null,
      progress: Number(data.progress ?? 0),
      status: (["on_track", "at_risk", "off_track", "done"].includes(data.status) ? data.status : "on_track") as GoalStatus,
      visibility: (data.visibility === "manager" ? "manager" : "public") as ProgramGoal["visibility"],
      createdAt: toIso(data.createdAt),
      checkIns: Array.isArray(data.checkIns) ? data.checkIns.map((checkIn: Record<string, unknown>) => ({
        at: String(checkIn.at ?? ""),
        progress: Number(checkIn.progress ?? 0),
        status: (checkIn.status ?? "on_track") as GoalStatus,
        note: String(checkIn.note ?? ""),
      })) : [],
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  const feedback: ProgramFeedback[] = feedbackSnapshot.docs
    .map((document) => ({ document, data: document.data() }))
    .filter(({ data }) =>
      data.authorId === me.id
      || data.recipientId === me.id
      || data.visibility === "public"
      || (data.visibility === "manager" && (reportIds.has(String(data.recipientId)) || canReadAll)),
    )
    .map(({ document, data }) => ({
      id: document.id,
      authorId: String(data.authorId),
      authorName: nameOf(String(data.authorId)),
      recipientId: String(data.recipientId),
      recipientName: nameOf(String(data.recipientId)),
      kind: data.kind === "praise" ? "praise" : "constructive",
      body: String(data.body ?? ""),
      visibility: data.visibility === "public" || data.visibility === "manager" ? data.visibility : "private",
      createdAt: toIso(data.createdAt),
    }) satisfies ProgramFeedback)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  const oneOnOnes: ProgramOneOnOne[] = [...managerMeetings.docs, ...reportMeetings.docs]
    .map((document) => {
      const data = document.data();
      return {
        id: document.id,
        managerId: String(data.managerId),
        managerName: nameOf(String(data.managerId)),
        reportId: String(data.reportId),
        reportName: nameOf(String(data.reportId)),
        scheduledFor: String(data.scheduledFor ?? ""),
        status: data.status === "completed" ? "completed" : "scheduled",
        agenda: Array.isArray(data.agenda) ? data.agenda.map((item: Record<string, unknown>) => ({
          id: String(item.id),
          text: String(item.text ?? ""),
          authorName: String(item.authorName ?? ""),
          done: Boolean(item.done),
        })) : [],
        sharedNotes: String(data.sharedNotes ?? ""),
      } satisfies ProgramOneOnOne;
    })
    .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));

  const visibleSubject = (subjectId: string) => subjectId === me.id || reportIds.has(subjectId) || canReadAll;
  const timelineReviews = perCycle.flatMap(({ cycle, reviews }) => reviews.docs
    .filter((review) => review.data().state === "submitted" && visibleSubject(String(review.data().subjectId)))
    .map((review) => ({
      id: review.id,
      subjectId: String(review.data().subjectId),
      direction: (review.data().direction ?? "self") as ReviewDirection,
      cycleName: String(cycle.data().name ?? "Review cycle"),
      submittedAt: toIso(review.data().submittedAt),
    })));

  const reportInput = canReport
    ? {
      members: workspace.members.map((member) => ({ id: member.id, teamId: member.teamId, teamName: member.teamName })),
      reviews: perCycle.flatMap(({ cycle, reviews }) => reviews.docs.map((review) => ({
        cycleId: cycle.id,
        subjectId: String(review.data().subjectId ?? ""),
        direction: (review.data().direction ?? "self") as ReviewDirection,
        state: String(review.data().state ?? "draft"),
      }))),
      goals: goalsSnapshot.docs.map((document) => ({ ownerId: String(document.data().ownerId), status: (document.data().status ?? "on_track") as GoalStatus })),
      feedback: feedbackSnapshot.docs.map((document) => ({ recipientId: String(document.data().recipientId), kind: String(document.data().kind ?? "constructive") })),
      calibrations: perCycle.flatMap(({ cycle, calibrations }) => calibrations.docs.map((document) => ({
        cycleId: cycle.id,
        subjectId: document.id,
        rating: typeof document.data().rating === "number" ? document.data().rating : null,
      }))),
      packets: perCycle.flatMap(({ cycle, packets: snapshot }) => snapshot.docs.map((document) => ({
        cycleId: cycle.id,
        subjectId: document.id,
        state: String(document.data().state ?? "released"),
      }))),
    }
    : null;

  return {
    now: new Date().toISOString(),
    myMemberId: me.id,
    directReportIds: [...reportIds],
    cycles,
    nominations,
    progress,
    calibration,
    packets,
    goals,
    feedback,
    oneOnOnes,
    notifications: notificationsSnapshot.docs
      .map((document) => ({
        id: document.id,
        kind: (document.data().kind ?? "reminder") as ProgramSnapshot["notifications"][number]["kind"],
        title: String(document.data().title ?? ""),
        body: String(document.data().body ?? ""),
        createdAt: toIso(document.data().createdAt),
        read: Boolean(document.data().read),
      }))
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .slice(0, 50),
    timelineReviews,
    reportInput,
    reportViews: (reportViewsSnapshot?.docs ?? [])
      .filter((document) => document.data().shared === true || document.data().ownerId === me.id)
      .map((document) => ({
        id: document.id,
        name: String(document.data().name ?? "Saved view"),
        cycleId: typeof document.data().filters?.cycleId === "string" ? document.data().filters.cycleId : null,
        teamId: typeof document.data().filters?.teamId === "string" ? document.data().filters.teamId : null,
        shared: Boolean(document.data().shared),
        mine: document.data().ownerId === me.id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
