import type { PricedModule } from "./types";

/**
 * Annual list-price arithmetic for a competitor's per-seat modules.
 *
 * annual = max(seats × Σ(module price per seat per month) × 12, annual minimum)
 *
 * List prices only: discounts, multi-year terms and renewal escalators are ignored on
 * purpose, and the page says so next to the number.
 */

export type ListCostInput = {
  seats: number;
  modules: readonly PricedModule[];
  selectedModuleIds: readonly string[];
  annualMinimum: number;
  /** Seats are clamped into this range (inclusive) and rounded to a whole number. */
  seatRange?: { min: number; max: number };
};

export type ListCostResult = {
  seats: number;
  /** Modules actually counted: required ones plus the selected ones, in catalog order. */
  modules: PricedModule[];
  perSeatMonthly: number;
  /** seats × perSeatMonthly × 12, before the minimum. */
  subtotal: number;
  /** What the buyer pays at list price. */
  annual: number;
  minimumApplies: boolean;
  /** annual ÷ seats ÷ 12, to the cent; shows what the minimum does to small teams. */
  effectivePerSeatMonthly: number;
};

export function clampSeats(seats: number, range?: { min: number; max: number }) {
  const lower = Math.max(1, Math.ceil(range?.min ?? 1));
  const upper = Math.max(lower, Math.floor(range?.max ?? Number.MAX_SAFE_INTEGER));
  if (!Number.isFinite(seats)) return lower;
  return Math.min(upper, Math.max(lower, Math.round(seats)));
}

export function calculateAnnualListCost(input: ListCostInput): ListCostResult {
  const seats = clampSeats(input.seats, input.seatRange);
  const selected = new Set(input.selectedModuleIds);
  const modules = input.modules.filter((module) => module.required || selected.has(module.id));
  const perSeatMonthly = modules.reduce((sum, module) => sum + Math.max(0, module.pricePerSeatMonth), 0);
  const subtotal = roundCents(seats * perSeatMonthly * 12);
  const minimum = Number.isFinite(input.annualMinimum) ? Math.max(0, input.annualMinimum) : 0;
  // A minimum only bites when something is actually being bought.
  const minimumApplies = perSeatMonthly > 0 && subtotal < minimum;
  const annual = minimumApplies ? minimum : subtotal;

  return {
    seats,
    modules,
    perSeatMonthly,
    subtotal,
    annual,
    minimumApplies,
    effectivePerSeatMonthly: roundCents(annual / seats / 12),
  };
}

/** Smallest seat count whose list subtotal reaches the minimum, or null when there is none. */
export function seatsWhereMinimumStopsApplying(perSeatMonthly: number, annualMinimum: number) {
  if (!(perSeatMonthly > 0) || !(annualMinimum > 0)) return null;
  return Math.ceil(annualMinimum / (perSeatMonthly * 12));
}

function roundCents(amount: number) {
  return Math.round(amount * 100) / 100;
}

export function formatUsd(amount: number, options: { cents?: boolean } = {}) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: options.cents ? 2 : 0,
    maximumFractionDigits: options.cents ? 2 : 0,
  }).format(amount);
}
