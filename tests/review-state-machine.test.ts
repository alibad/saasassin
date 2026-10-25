import { describe, expect, it } from "vitest";

import {
  getAdjacentCycleStates,
  getCyclePath,
  previewCycleTransition,
} from "../src/lib/lattice/state-machine";

const configuration = {
  peerNominationEnabled: false,
  calibrationEnabled: true,
};

describe("review-cycle state machine", () => {
  it("removes optional phases without allowing arbitrary jumps", () => {
    expect(getCyclePath(configuration)).toEqual([
      "draft",
      "review_writing",
      "calibration",
      "acknowledgement",
      "closed",
    ]);
    expect(getAdjacentCycleStates("review_writing", configuration)).toEqual({
      previous: "draft",
      next: "calibration",
    });
  });

  it("previews launch effects before applying them", () => {
    const preview = previewCycleTransition({
      from: "draft",
      to: "review_writing",
      config: configuration,
      assignedReviews: 0,
      submittedReviews: 0,
    });
    expect(preview.canTransition).toBe(true);
    expect(preview.effects).toContain("Review assignments are generated from the selected template.");
  });

  it("blocks advancement while review work is incomplete", () => {
    const preview = previewCycleTransition({
      from: "review_writing",
      to: "calibration",
      config: configuration,
      assignedReviews: 8,
      submittedReviews: 7,
    });
    expect(preview.canTransition).toBe(false);
    expect(preview.blockers[0]).toContain("1 of 8");
  });

  it("allows a one-step reverse transition without deleting work", () => {
    const preview = previewCycleTransition({
      from: "calibration",
      to: "review_writing",
      config: configuration,
      assignedReviews: 8,
      submittedReviews: 8,
    });
    expect(preview.canTransition).toBe(true);
    expect(preview.direction).toBe("reverse");
    expect(preview.warnings[0]).toContain("without deleting submitted work");
  });
});
