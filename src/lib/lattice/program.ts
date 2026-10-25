/**
 * Pure, client-safe Performance program logic: assignment generation, deadline
 * status, reminder planning, calibration summaries, packet assembly, the
 * employee timeline, and reporting. Firestore access lives in program-data.ts;
 * everything here is deterministic so it can be unit-tested in isolation.
 */

export type ReviewDirection = "self" | "manager" | "peer" | "upward";

export const REVIEW_DIRECTION_LABELS: Record<ReviewDirection, string> = {
  self: "Self",
  manager: "Manager",
  peer: "Peer",
  upward: "Upward",
};

export type AssignmentMember = {
  id: string;
  name?: string;
  managerId: string | null;
  teamId: string | null;
  /** Active, signed-in members can write reviews. */
  active: boolean;
};

export type AssignmentSeed = {
  subjectId: string;
  reviewerId: string;
  direction: ReviewDirection;
};

export function assignmentKey(seed: AssignmentSeed) {
  return `${seed.subjectId}:${seed.reviewerId}:${seed.direction}`;
}

export const MAX_AUTO_PEERS = 3;

/**
 * Builds review assignments for a cycle.
 *
 * - `launch` runs when a draft cycle starts: self, manager and upward reviews,
 *   plus automatic teammate peers when peer nomination is disabled.
 * - `peer` runs when peer nomination closes: one peer review per approved
 *   nomination.
 *
 * Only active members ever become reviewers or self-review subjects, every
 * assignment is unique, and nobody reviews themselves outside a self review.
 */
export function generateAssignments(input: {
  phase: "launch" | "peer";
  members: AssignmentMember[];
  directions: ReviewDirection[];
  peerNominationEnabled: boolean;
  approvedNominations?: Array<{ subjectId: string; peerId: string }>;
  maxAutoPeers?: number;
}): AssignmentSeed[] {
  const { phase, members, directions, peerNominationEnabled } = input;
  const byId = new Map(members.map((member) => [member.id, member]));
  const seeds = new Map<string, AssignmentSeed>();
  const add = (seed: AssignmentSeed) => {
    const reviewer = byId.get(seed.reviewerId);
    const subject = byId.get(seed.subjectId);
    if (!reviewer?.active || !subject) return;
    if (seed.direction !== "self" && seed.subjectId === seed.reviewerId) return;
    seeds.set(assignmentKey(seed), seed);
  };
  const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));

  if (phase === "launch") {
    for (const subject of sorted) {
      if (directions.includes("self") && subject.active) {
        add({ subjectId: subject.id, reviewerId: subject.id, direction: "self" });
      }
      if (directions.includes("manager") && subject.managerId) {
        add({ subjectId: subject.id, reviewerId: subject.managerId, direction: "manager" });
      }
      if (directions.includes("upward") && subject.managerId && byId.has(subject.managerId)) {
        add({ subjectId: subject.managerId, reviewerId: subject.id, direction: "upward" });
      }
      if (directions.includes("peer") && !peerNominationEnabled && subject.teamId) {
        const peers = sorted
          .filter((candidate) =>
            candidate.id !== subject.id
            && candidate.active
            && candidate.teamId === subject.teamId
            && candidate.id !== subject.managerId
            && candidate.managerId !== subject.id,
          )
          .slice(0, input.maxAutoPeers ?? MAX_AUTO_PEERS);
        for (const peer of peers) {
          add({ subjectId: subject.id, reviewerId: peer.id, direction: "peer" });
        }
      }
    }
  }

  if (phase === "peer" && directions.includes("peer")) {
    for (const nomination of input.approvedNominations ?? []) {
      add({ subjectId: nomination.subjectId, reviewerId: nomination.peerId, direction: "peer" });
    }
  }

  return [...seeds.values()];
}

export type NominationState = "pending" | "approved" | "declined";

export function nominationKey(subjectId: string, peerId: string) {
  return `${subjectId}__${peerId}`;
}

/** Validates a peer nomination request before it is persisted. */
export function validateNomination(input: {
  subjectId: string;
  peerIds: string[];
  members: AssignmentMember[];
  maxPeers?: number;
}) {
  const errors: string[] = [];
  const byId = new Map(input.members.map((member) => [member.id, member]));
  const unique = [...new Set(input.peerIds)];
  if (!byId.has(input.subjectId)) errors.push("Choose an employee in this workspace.");
  if (!unique.length) errors.push("Nominate at least one peer.");
  if (unique.length > (input.maxPeers ?? 5)) errors.push(`Nominate at most ${input.maxPeers ?? 5} peers.`);
  for (const peerId of unique) {
    const peer = byId.get(peerId);
    if (peerId === input.subjectId) errors.push("Employees cannot nominate themselves as a peer.");
    else if (!peer) errors.push("Every nominated peer must belong to this workspace.");
    else if (!peer.active) errors.push(`${peer.name ?? "A nominated peer"} has not joined the workspace yet.`);
  }
  return { peerIds: unique, errors };
}

export type DeadlineStatus = "none" | "done" | "on_track" | "due_soon" | "overdue";

export const DEADLINE_STATUS_LABELS: Record<DeadlineStatus, string> = {
  none: "No deadline",
  done: "Submitted",
  on_track: "On track",
  due_soon: "Due soon",
  overdue: "Overdue",
};

const DAY = 24 * 60 * 60 * 1000;

/** A date-only deadline (YYYY-MM-DD) is due at the end of that UTC day. */
export function deadlineStatus(
  dueDate: string | null,
  now: Date,
  submitted: boolean,
  dueSoonDays = 3,
): DeadlineStatus {
  if (submitted) return "done";
  if (!dueDate) return "none";
  const due = Date.parse(`${dueDate}T23:59:59.999Z`);
  if (Number.isNaN(due)) return "none";
  const remaining = due - now.getTime();
  if (remaining < 0) return "overdue";
  if (remaining <= dueSoonDays * DAY) return "due_soon";
  return "on_track";
}

export type ReminderPlan = {
  recipientId: string;
  kind: "reminder" | "escalation";
  reviewIds: string[];
  aboutReviewerId: string;
};

/**
 * Plans reminders for outstanding reviews: one reminder per reviewer, plus one
 * escalation to the reviewer's manager for each reviewer who is overdue.
 */
export function planReminders(input: {
  reviews: Array<{ id: string; reviewerId: string; state: string }>;
  members: AssignmentMember[];
  dueDate: string | null;
  now: Date;
}): ReminderPlan[] {
  const byId = new Map(input.members.map((member) => [member.id, member]));
  const outstanding = new Map<string, string[]>();
  for (const review of input.reviews) {
    if (review.state === "submitted") continue;
    outstanding.set(review.reviewerId, [...(outstanding.get(review.reviewerId) ?? []), review.id]);
  }
  const overdue = deadlineStatus(input.dueDate, input.now, false) === "overdue";
  const plans: ReminderPlan[] = [];
  for (const [reviewerId, reviewIds] of [...outstanding.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    plans.push({ recipientId: reviewerId, kind: "reminder", reviewIds, aboutReviewerId: reviewerId });
    const managerId = byId.get(reviewerId)?.managerId;
    if (overdue && managerId && managerId !== reviewerId && byId.has(managerId)) {
      plans.push({ recipientId: managerId, kind: "escalation", reviewIds, aboutReviewerId: reviewerId });
    }
  }
  return plans;
}

export type RatingQuestion = { id: string; prompt: string; type: "text" | "rating" };

export type ReviewForSummary = {
  id: string;
  subjectId: string;
  reviewerId: string;
  direction: ReviewDirection;
  state: string;
  answers: Record<string, string | number>;
};

export type RatingSummary = {
  subjectId: string;
  average: number | null;
  ratings: number;
  byDirection: Partial<Record<ReviewDirection, number | null>>;
  submittedReviews: number;
  totalReviews: number;
};

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function ratingValues(review: ReviewForSummary, questions: RatingQuestion[]) {
  return questions
    .filter((question) => question.type === "rating")
    .map((question) => Number(review.answers[question.id]))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);
}

/** Summarizes submitted rating answers per review subject for calibration. */
export function summarizeRatings(
  reviews: ReviewForSummary[],
  questions: RatingQuestion[],
): RatingSummary[] {
  const bySubject = new Map<string, ReviewForSummary[]>();
  for (const review of reviews) {
    bySubject.set(review.subjectId, [...(bySubject.get(review.subjectId) ?? []), review]);
  }
  return [...bySubject.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subjectId, subjectReviews]) => {
      const submitted = subjectReviews.filter((review) => review.state === "submitted");
      const all = submitted.flatMap((review) => ratingValues(review, questions));
      const byDirection: RatingSummary["byDirection"] = {};
      for (const direction of ["self", "manager", "peer", "upward"] as const) {
        const values = submitted
          .filter((review) => review.direction === direction)
          .flatMap((review) => ratingValues(review, questions));
        if (values.length) byDirection[direction] = average(values);
      }
      return {
        subjectId,
        average: average(all),
        ratings: all.length,
        byDirection,
        submittedReviews: submitted.length,
        totalReviews: subjectReviews.length,
      };
    });
}

/** Counts calibrated ratings into a 1–5 distribution. */
export function ratingDistribution(ratings: Array<number | null | undefined>) {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const rating of ratings) {
    if (rating === 1 || rating === 2 || rating === 3 || rating === 4 || rating === 5) {
      distribution[rating] += 1;
    }
  }
  return distribution;
}

export type PacketSection = {
  direction: ReviewDirection;
  reviewerLabel: string;
  answers: Array<{ questionId: string; prompt: string; value: string }>;
};

export type ReviewPacketContent = {
  subjectId: string;
  calibratedRating: number | null;
  sections: PacketSection[];
};

/**
 * Assembles the packet an employee receives. Self and manager reviews are
 * attributed; peer and upward reviews are anonymized and ordered
 * deterministically so the order cannot reveal who wrote what.
 */
export function assemblePacket(input: {
  subjectId: string;
  reviews: ReviewForSummary[];
  questions: Array<{ id: string; prompt: string }>;
  memberNames: Map<string, string>;
  calibratedRating: number | null;
}): ReviewPacketContent {
  const order: ReviewDirection[] = ["self", "manager", "peer", "upward"];
  const counters: Partial<Record<ReviewDirection, number>> = {};
  const sections = input.reviews
    .filter((review) => review.subjectId === input.subjectId && review.state === "submitted")
    .sort((a, b) => order.indexOf(a.direction) - order.indexOf(b.direction) || a.id.localeCompare(b.id))
    .map((review) => {
      counters[review.direction] = (counters[review.direction] ?? 0) + 1;
      const reviewerLabel = review.direction === "self"
        ? "Self review"
        : review.direction === "manager"
          ? `Manager · ${input.memberNames.get(review.reviewerId) ?? "Manager"}`
          : `${review.direction === "peer" ? "Peer" : "Direct report"} ${counters[review.direction]}`;
      return {
        direction: review.direction,
        reviewerLabel,
        answers: input.questions
          .filter((question) => String(review.answers[question.id] ?? "").trim() !== "")
          .map((question) => ({
            questionId: question.id,
            prompt: question.prompt,
            value: String(review.answers[question.id]),
          })),
      };
    });
  return { subjectId: input.subjectId, calibratedRating: input.calibratedRating, sections };
}

export type GoalStatus = "on_track" | "at_risk" | "off_track" | "done";

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  done: "Done",
};

export type TimelineEntry = {
  id: string;
  kind: "goal" | "goal_check_in" | "feedback" | "review" | "packet" | "acknowledgement" | "one_on_one";
  at: string;
  title: string;
  detail: string;
};

/**
 * Merges every visible record about one employee into a newest-first evidence
 * timeline. Callers pass only records the viewer is already allowed to see.
 */
export function buildTimeline(subjectId: string, input: {
  goals: Array<{ id: string; ownerId: string; title: string; createdAt: string | null; checkIns: Array<{ at: string; progress: number; status: GoalStatus; note: string }> }>;
  feedback: Array<{ id: string; recipientId: string; authorName: string; kind: string; body: string; createdAt: string | null }>;
  reviews: Array<{ id: string; subjectId: string; direction: ReviewDirection; cycleName: string; submittedAt: string | null }>;
  packets: Array<{ cycleId: string; cycleName: string; subjectId: string; releasedAt: string | null; acknowledgedAt: string | null }>;
  oneOnOnes: Array<{ id: string; managerId: string; reportId: string; scheduledFor: string; status: string; counterpartName: string }>;
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const goal of input.goals.filter((item) => item.ownerId === subjectId)) {
    if (goal.createdAt) entries.push({ id: `goal-${goal.id}`, kind: "goal", at: goal.createdAt, title: `Goal set: ${goal.title}`, detail: "Goal created" });
    goal.checkIns.forEach((checkIn, index) => entries.push({
      id: `goal-${goal.id}-${index}`,
      kind: "goal_check_in",
      at: checkIn.at,
      title: `${goal.title} · ${checkIn.progress}%`,
      detail: `${GOAL_STATUS_LABELS[checkIn.status]}${checkIn.note ? ` — ${checkIn.note}` : ""}`,
    }));
  }
  for (const item of input.feedback.filter((entry) => entry.recipientId === subjectId)) {
    if (item.createdAt) entries.push({ id: `feedback-${item.id}`, kind: "feedback", at: item.createdAt, title: `${item.kind === "praise" ? "Praise" : "Feedback"} from ${item.authorName}`, detail: item.body });
  }
  for (const review of input.reviews.filter((entry) => entry.subjectId === subjectId)) {
    if (review.submittedAt) entries.push({ id: `review-${review.id}`, kind: "review", at: review.submittedAt, title: `${REVIEW_DIRECTION_LABELS[review.direction]} review submitted`, detail: review.cycleName });
  }
  for (const packet of input.packets.filter((entry) => entry.subjectId === subjectId)) {
    if (packet.releasedAt) entries.push({ id: `packet-${packet.cycleId}`, kind: "packet", at: packet.releasedAt, title: "Review packet released", detail: packet.cycleName });
    if (packet.acknowledgedAt) entries.push({ id: `ack-${packet.cycleId}`, kind: "acknowledgement", at: packet.acknowledgedAt, title: "Review packet acknowledged", detail: packet.cycleName });
  }
  for (const meeting of input.oneOnOnes.filter((entry) => entry.managerId === subjectId || entry.reportId === subjectId)) {
    entries.push({ id: `one-on-one-${meeting.id}`, kind: "one_on_one", at: meeting.scheduledFor, title: `One-to-one with ${meeting.counterpartName}`, detail: meeting.status === "completed" ? "Completed" : "Scheduled" });
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

export type ReportInput = {
  members: Array<{ id: string; teamId: string | null; teamName: string | null }>;
  reviews: Array<{ cycleId: string; subjectId: string; direction: ReviewDirection; state: string }>;
  goals: Array<{ ownerId: string; status: GoalStatus }>;
  feedback: Array<{ recipientId: string; kind: string }>;
  calibrations: Array<{ cycleId: string; subjectId: string; rating: number | null }>;
  packets: Array<{ cycleId: string; subjectId: string; state: string }>;
};

export type ReportFilter = { cycleId: string | null; teamId: string | null };

function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

/** Composable program report with reliable cycle and team filters. */
export function buildReport(input: ReportInput, filter: ReportFilter) {
  const teamOf = new Map(input.members.map((member) => [member.id, member.teamId]));
  const inTeam = (memberId: string) => !filter.teamId || teamOf.get(memberId) === filter.teamId;
  const inCycle = (cycleId: string) => !filter.cycleId || cycleId === filter.cycleId;
  const reviews = input.reviews.filter((review) => inCycle(review.cycleId) && inTeam(review.subjectId));
  const byDirection = (["self", "manager", "peer", "upward"] as const).map((direction) => {
    const scoped = reviews.filter((review) => review.direction === direction);
    const submitted = scoped.filter((review) => review.state === "submitted").length;
    return { direction, total: scoped.length, submitted, completion: percent(submitted, scoped.length) };
  });
  const teams = new Map<string, { teamId: string; teamName: string; total: number; submitted: number }>();
  for (const review of reviews) {
    const member = input.members.find((candidate) => candidate.id === review.subjectId);
    const key = member?.teamId ?? "unassigned";
    const entry = teams.get(key) ?? { teamId: key, teamName: member?.teamName ?? "No team", total: 0, submitted: 0 };
    entry.total += 1;
    if (review.state === "submitted") entry.submitted += 1;
    teams.set(key, entry);
  }
  const goals = input.goals.filter((goal) => inTeam(goal.ownerId));
  const goalStatus = { on_track: 0, at_risk: 0, off_track: 0, done: 0 } as Record<GoalStatus, number>;
  for (const goal of goals) goalStatus[goal.status] += 1;
  const feedback = input.feedback.filter((item) => inTeam(item.recipientId));
  const packets = input.packets.filter((packet) => inCycle(packet.cycleId) && inTeam(packet.subjectId));
  const acknowledged = packets.filter((packet) => packet.state === "acknowledged").length;
  const submitted = reviews.filter((review) => review.state === "submitted").length;
  return {
    reviews: { total: reviews.length, submitted, completion: percent(submitted, reviews.length) },
    byDirection,
    byTeam: [...teams.values()]
      .map((team) => ({ ...team, completion: percent(team.submitted, team.total) }))
      .sort((a, b) => a.teamName.localeCompare(b.teamName)),
    goals: { total: goals.length, ...goalStatus },
    feedback: {
      total: feedback.length,
      praise: feedback.filter((item) => item.kind === "praise").length,
      constructive: feedback.filter((item) => item.kind !== "praise").length,
    },
    calibration: ratingDistribution(
      input.calibrations.filter((entry) => inCycle(entry.cycleId) && inTeam(entry.subjectId)).map((entry) => entry.rating),
    ),
    packets: { released: packets.length, acknowledged, acknowledgement: percent(acknowledged, packets.length) },
  };
}

export type ProgramReport = ReturnType<typeof buildReport>;
