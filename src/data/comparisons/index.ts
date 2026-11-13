import type { Comparison } from "../../lib/compare/types";
import { latticeComparison } from "./lattice";

/**
 * Every published comparison. /compare, /compare/<slug>, the sitemap, the interest API's
 * accepted sources and the "Compare" links on /targets and /apps all read this list, so
 * adding a competitor is one data file plus one line here.
 */
export const comparisons: readonly Comparison[] = [latticeComparison];

export function getComparison(slug: string) {
  return comparisons.find((comparison) => comparison.slug === slug) ?? null;
}

/** The comparison for a catalog target slug (e.g. "lattice"), if one is published. */
export function getComparisonForTarget(targetSlug: string) {
  return comparisons.find((comparison) => comparison.interest.target === targetSlug) ?? null;
}

/** `source` values the interest API accepts from compare pages. */
export function getComparisonInterestSources() {
  return comparisons.map((comparison) => comparison.interest.source);
}
