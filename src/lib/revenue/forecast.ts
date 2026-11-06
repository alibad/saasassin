/**
 * Forecast: weighted pipeline by stage probability plus owner-called categories with manager
 * overrides. Pure and computed only from stored deals; nothing here is modelled or predicted.
 */

import { DEAL_STAGES, isOpenStage, type DealStage } from "./deals";

export const FORECAST_CATEGORIES = ["pipeline", "best_case", "commit", "omitted"] as const;
export type ForecastCategory = (typeof FORECAST_CATEGORIES)[number];

export const FORECAST_CATEGORY_LABELS: Record<ForecastCategory, string> = {
  pipeline: "Pipeline",
  best_case: "Best case",
  commit: "Commit",
  omitted: "Omitted",
};

export const FORECAST_DEFINITIONS: Array<{ term: string; definition: string }> = [
  { term: "Weighted pipeline", definition: "Σ open deal amount × the workspace's probability for the deal's stage." },
  { term: "Commit", definition: "Open deals whose effective category is Commit." },
  { term: "Best case", definition: "Commit plus open deals called Best case." },
  { term: "Pipeline", definition: "Every open deal not marked Omitted." },
  { term: "Effective category", definition: "A manager override when present, otherwise the deal owner's call, otherwise Pipeline." },
  { term: "Closed won", definition: "Deals in Closed won, by close date month." },
];

export type StageProbabilities = Record<DealStage, number>;

export const DEFAULT_STAGE_PROBABILITIES: StageProbabilities = {
  prospecting: 10,
  discovery: 20,
  demo: 40,
  proposal: 60,
  negotiation: 80,
  closed_won: 100,
  closed_lost: 0,
};

/** Validates an edited probability table: every stage 0–100 (integers), won = 100, lost = 0. */
export function normalizeStageProbabilities(input: Partial<Record<string, number>>): StageProbabilities {
  const result = { ...DEFAULT_STAGE_PROBABILITIES };
  for (const stage of DEAL_STAGES) {
    const value = input[stage];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error(`Probability for ${stage} must be a whole number from 0 to 100.`);
    result[stage] = value;
  }
  if (result.closed_won !== 100 || result.closed_lost !== 0) throw new Error("Closed won is always 100% and closed lost 0%.");
  return result;
}

export type DealForecastCall = { category: ForecastCategory; by: string; at: string };
export type DealForecastOverride = DealForecastCall & { reason: string };

export type ForecastDeal = {
  id: string;
  name: string;
  stage: DealStage;
  amount: number;
  closeDate: string | null;
  ownerEmail: string;
  forecast?: { call?: DealForecastCall | null; override?: DealForecastOverride | null } | null;
};

export function effectiveCategory(deal: Pick<ForecastDeal, "forecast">): ForecastCategory {
  return deal.forecast?.override?.category ?? deal.forecast?.call?.category ?? "pipeline";
}

export type ForecastCheck = { allowed: true } | { allowed: false; reason: string; status: 403 | 409 };

/** The owner calls their own deal; coaches (owner/admin/manager) may override, with a reason. */
export function checkForecastChange(
  deal: Pick<ForecastDeal, "stage" | "ownerEmail">,
  change: { kind: "call" | "override" },
  actor: { email: string; coach: boolean },
): ForecastCheck {
  if (!isOpenStage(deal.stage)) return { allowed: false, reason: "Closed deals are not forecast.", status: 409 };
  if (change.kind === "call" && deal.ownerEmail.toLowerCase() !== actor.email.toLowerCase()) {
    return { allowed: false, reason: "Only the deal owner can call its forecast category. Managers can override.", status: 403 };
  }
  if (change.kind === "override" && !actor.coach) {
    return { allowed: false, reason: "Only managers, admins and owners can override a forecast call.", status: 403 };
  }
  return { allowed: true };
}

export type ForecastBucket = {
  key: string;
  deals: number;
  pipeline: number;
  weighted: number;
  bestCase: number;
  commit: number;
  closedWon: number;
};

const emptyBucket = (key: string): ForecastBucket => ({ key, deals: 0, pipeline: 0, weighted: 0, bestCase: 0, commit: 0, closedWon: 0 });

export const NO_CLOSE_DATE = "No close date";

function addTo(bucket: ForecastBucket, deal: ForecastDeal, probabilities: StageProbabilities) {
  if (deal.stage === "closed_won") {
    bucket.closedWon += deal.amount;
    return;
  }
  if (!isOpenStage(deal.stage)) return;
  const category = effectiveCategory(deal);
  if (category === "omitted") return;
  bucket.deals += 1;
  bucket.pipeline += deal.amount;
  bucket.weighted += (deal.amount * (probabilities[deal.stage] ?? 0)) / 100;
  if (category === "commit") bucket.commit += deal.amount;
  if (category === "commit" || category === "best_case") bucket.bestCase += deal.amount;
}

const round = (bucket: ForecastBucket): ForecastBucket => ({ ...bucket, weighted: Math.round(bucket.weighted * 100) / 100 });

export function buildForecast(deals: ForecastDeal[], probabilities: StageProbabilities = DEFAULT_STAGE_PROBABILITIES) {
  const total = emptyBucket("total");
  const months = new Map<string, ForecastBucket>();
  const reps = new Map<string, ForecastBucket>();
  for (const deal of deals) {
    const month = deal.closeDate ? deal.closeDate.slice(0, 7) : NO_CLOSE_DATE;
    addTo(total, deal, probabilities);
    addTo(months.get(month) ?? months.set(month, emptyBucket(month)).get(month)!, deal, probabilities);
    addTo(reps.get(deal.ownerEmail) ?? reps.set(deal.ownerEmail, emptyBucket(deal.ownerEmail)).get(deal.ownerEmail)!, deal, probabilities);
  }
  const keep = (bucket: ForecastBucket) => bucket.deals > 0 || bucket.closedWon > 0;
  return {
    probabilities,
    total: round(total),
    byMonth: [...months.values()].filter(keep).map(round).sort((a, b) => (a.key === NO_CLOSE_DATE ? 1 : b.key === NO_CLOSE_DATE ? -1 : a.key.localeCompare(b.key))),
    byRep: [...reps.values()].filter(keep).map(round).sort((a, b) => b.weighted - a.weighted || a.key.localeCompare(b.key)),
  };
}

export type Forecast = ReturnType<typeof buildForecast>;
