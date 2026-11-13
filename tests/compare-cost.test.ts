import { describe, expect, it } from "vitest";

import {
  calculateAnnualListCost,
  clampSeats,
  formatUsd,
  seatsWhereMinimumStopsApplying,
} from "../src/lib/compare/cost";
import type { PricedModule } from "../src/lib/compare/types";

// Lattice list prices from docs/competitors/lattice/research.md §3 (lattice.com/pricing, 2026-11-13).
const modules: PricedModule[] = [
  { id: "performance", name: "Performance", pricePerSeatMonth: 10, kind: "base", required: true, covers: "Reviews" },
  { id: "goals", name: "Goals & OKRs", pricePerSeatMonth: 8, kind: "base", covers: "Goals" },
  { id: "grow", name: "Grow", pricePerSeatMonth: 4, kind: "add-on", covers: "Growth" },
];
const minimum = 4000;

function cost(seats: number, selectedModuleIds: string[] = []) {
  return calculateAnnualListCost({ seats, modules, selectedModuleIds, annualMinimum: minimum });
}

describe("calculateAnnualListCost", () => {
  it("applies the $4,000 minimum to small teams (25 people, Performance only)", () => {
    const result = cost(25);
    expect(result.subtotal).toBe(3000);
    expect(result.annual).toBe(4000);
    expect(result.minimumApplies).toBe(true);
    expect(result.effectivePerSeatMonthly).toBe(13.33);
  });

  it("matches the research.md list-price arithmetic table", () => {
    expect(cost(33).annual).toBe(4000); // $3,960 subtotal, still under the minimum
    expect(cost(34).annual).toBe(4080);
    expect(cost(34).minimumApplies).toBe(false);
    expect(cost(50, ["goals"]).annual).toBe(10800);
    expect(cost(100, ["goals", "grow"]).annual).toBe(26400);
    expect(cost(250, ["goals"]).annual).toBe(54000);
  });

  it("always counts required modules and ignores unknown ids", () => {
    const result = cost(50, ["not-a-module"]);
    expect(result.modules.map((module) => module.id)).toEqual(["performance"]);
    expect(result.perSeatMonthly).toBe(10);
    expect(result.annual).toBe(6000);
  });

  it("keeps catalog order regardless of selection order", () => {
    expect(cost(40, ["grow", "goals"]).modules.map((module) => module.id)).toEqual([
      "performance",
      "goals",
      "grow",
    ]);
  });

  it("clamps seats into the slider range and rounds to whole people", () => {
    const range = { min: 10, max: 500 };
    const run = (seats: number) =>
      calculateAnnualListCost({ seats, modules, selectedModuleIds: [], annualMinimum: minimum, seatRange: range });
    expect(run(3).seats).toBe(10);
    expect(run(9000).seats).toBe(500);
    expect(run(49.6).seats).toBe(50);
    expect(run(Number.NaN).seats).toBe(10);
    expect(run(500).annual).toBe(60000);
  });

  it("does not charge a minimum when nothing is being bought", () => {
    const result = calculateAnnualListCost({
      seats: 20,
      modules: [{ ...modules[1], required: false }],
      selectedModuleIds: [],
      annualMinimum: minimum,
    });
    expect(result.annual).toBe(0);
    expect(result.minimumApplies).toBe(false);
    expect(result.effectivePerSeatMonthly).toBe(0);
  });

  it("treats a missing or negative minimum as no minimum", () => {
    const result = calculateAnnualListCost({ seats: 10, modules, selectedModuleIds: [], annualMinimum: -1 });
    expect(result.annual).toBe(1200);
    expect(result.minimumApplies).toBe(false);
  });
});

describe("helpers", () => {
  it("finds the seat count where the minimum stops mattering", () => {
    expect(seatsWhereMinimumStopsApplying(10, 4000)).toBe(34);
    expect(seatsWhereMinimumStopsApplying(18, 4000)).toBe(19);
    expect(seatsWhereMinimumStopsApplying(0, 4000)).toBeNull();
    expect(seatsWhereMinimumStopsApplying(10, 0)).toBeNull();
  });

  it("clamps without a range to at least one seat", () => {
    expect(clampSeats(0)).toBe(1);
    expect(clampSeats(-5)).toBe(1);
    expect(clampSeats(12.2)).toBe(12);
  });

  it("formats whole dollars and cents", () => {
    expect(formatUsd(10800)).toBe("$10,800");
    expect(formatUsd(13.333, { cents: true })).toBe("$13.33");
  });
});
