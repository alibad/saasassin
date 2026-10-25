export const REVIEW_CYCLE_STATES = [
  "draft",
  "peer_nomination",
  "review_writing",
  "calibration",
  "acknowledgement",
  "closed",
] as const;

export type ReviewCycleState = (typeof REVIEW_CYCLE_STATES)[number];

export const REVIEW_CYCLE_STATE_LABELS: Record<ReviewCycleState, string> = {
  draft: "Draft",
  peer_nomination: "Peer nomination",
  review_writing: "Review writing",
  calibration: "Calibration",
  acknowledgement: "Acknowledgement",
  closed: "Closed",
};

export type ReviewCycleConfiguration = {
  peerNominationEnabled: boolean;
  calibrationEnabled: boolean;
};

export type TransitionPreview = {
  from: ReviewCycleState;
  to: ReviewCycleState;
  direction: "forward" | "reverse";
  canTransition: boolean;
  blockers: string[];
  warnings: string[];
  effects: string[];
};

export function getCyclePath(config: ReviewCycleConfiguration) {
  return [
    "draft",
    ...(config.peerNominationEnabled ? (["peer_nomination"] as const) : []),
    "review_writing",
    ...(config.calibrationEnabled ? (["calibration"] as const) : []),
    "acknowledgement",
    "closed",
  ] satisfies ReviewCycleState[];
}

export function getAdjacentCycleStates(
  state: ReviewCycleState,
  config: ReviewCycleConfiguration,
) {
  const path = getCyclePath(config);
  const index = path.indexOf(state);
  return {
    previous: index > 0 ? path[index - 1] : null,
    next: index >= 0 && index < path.length - 1 ? path[index + 1] : null,
  };
}

export function previewCycleTransition(input: {
  from: ReviewCycleState;
  to: ReviewCycleState;
  config: ReviewCycleConfiguration;
  assignedReviews: number;
  submittedReviews: number;
}) : TransitionPreview {
  const { from, to, config, assignedReviews, submittedReviews } = input;
  const path = getCyclePath(config);
  const fromIndex = path.indexOf(from);
  const toIndex = path.indexOf(to);
  const direction = toIndex < fromIndex ? "reverse" : "forward";
  const blockers: string[] = [];
  const warnings: string[] = [];
  const effects: string[] = [];

  if (fromIndex === -1 || toIndex === -1 || Math.abs(toIndex - fromIndex) !== 1) {
    blockers.push("Review cycles can move only one configured phase at a time.");
  }

  const outstanding = Math.max(0, assignedReviews - submittedReviews);
  if (direction === "forward" && from === "review_writing" && outstanding > 0) {
    blockers.push(
      `${outstanding} of ${assignedReviews} assigned reviews are still incomplete.`,
    );
  }

  if (direction === "reverse") {
    warnings.push("Reopening this phase restores editing without deleting submitted work.");
    effects.push(`The cycle returns to ${REVIEW_CYCLE_STATE_LABELS[to]}.`);
  } else if (from === "draft") {
    effects.push("Review assignments are generated from the selected template.");
    effects.push(`Participants enter ${REVIEW_CYCLE_STATE_LABELS[to]}.`);
  } else if (to === "closed") {
    effects.push("Review packets become read-only until the cycle is reopened.");
  } else {
    effects.push(`The active phase changes to ${REVIEW_CYCLE_STATE_LABELS[to]}.`);
  }

  return {
    from,
    to,
    direction,
    canTransition: blockers.length === 0,
    blockers,
    warnings,
    effects,
  };
}
