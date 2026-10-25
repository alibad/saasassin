/**
 * Deal stage machine and risk-signal rules. Pure and deterministic: risk
 * signals are computed from stored deals and calls at read time, never stored
 * as opaque scores, and each one says which rule fired and on what evidence.
 */

export const DEAL_STAGES = [
  "prospecting",
  "discovery",
  "demo",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export const OPEN_STAGES: DealStage[] = ["prospecting", "discovery", "demo", "proposal", "negotiation"];
export const CLOSED_STAGES: DealStage[] = ["closed_won", "closed_lost"];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  prospecting: "Prospecting",
  discovery: "Discovery",
  demo: "Demo",
  proposal: "Proposal",
  negotiation: "Negotiation",
  closed_won: "Closed won",
  closed_lost: "Closed lost",
};

export function isOpenStage(stage: DealStage) {
  return OPEN_STAGES.includes(stage);
}

export type TransitionCheck = { allowed: true } | { allowed: false; reason: string };

/**
 * Open deals can move to any other open stage or close.
 * Closed deals are final for reps; only privileged roles can reopen them, and only into an open stage.
 */
export function checkStageTransition(from: DealStage, to: DealStage, options: { privileged: boolean }): TransitionCheck {
  if (!DEAL_STAGES.includes(to)) return { allowed: false, reason: "Unknown stage." };
  if (from === to) return { allowed: false, reason: "The deal is already in that stage." };
  if (isOpenStage(from)) return { allowed: true };
  if (!isOpenStage(to)) return { allowed: false, reason: "A closed deal must be reopened into an open stage first." };
  if (!options.privileged) return { allowed: false, reason: "Only an owner or admin can reopen a closed deal." };
  return { allowed: true };
}

export function allowedNextStages(from: DealStage, options: { privileged: boolean }): DealStage[] {
  return DEAL_STAGES.filter((stage) => checkStageTransition(from, stage, options).allowed);
}

export type StageChange = { from: DealStage | null; to: DealStage; at: string; by: string };

export type RiskSeverity = "high" | "medium" | "low";
export type RiskCode = "no_calls" | "stale_conversation" | "no_next_step" | "competitor_mentioned" | "close_date_passed";

export type RiskSignal = {
  code: RiskCode;
  severity: RiskSeverity;
  message: string;
  /** Call id the signal points to, when the evidence is a call. */
  callId?: string;
  /** Segment timestamp (seconds) inside that call, when applicable. */
  at?: number;
};

export type RiskDeal = { stage: DealStage; closeDate: string | null; createdAt: string | null };

export type RiskCall = {
  id: string;
  occurredAt: string;
  nextStepCount: number;
  competitorHits: Array<{ trackerName: string; keyword: string; start: number }>;
};

export type RiskConfig = { staleAfterDays: number };

export const DEFAULT_RISK_CONFIG: RiskConfig = { staleAfterDays: 14 };

export const RISK_RULE_DEFINITIONS: Record<RiskCode, string> = {
  no_calls: "Open deal with no logged call.",
  stale_conversation: "Most recent call is older than the workspace's stale threshold.",
  no_next_step: "Most recent call has no detected next-step phrase.",
  competitor_mentioned: "A competitor tracker matched in the most recent call.",
  close_date_passed: "Close date is in the past while the deal is still open.",
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(fromIso: string, now: Date) {
  return Math.floor((now.getTime() - new Date(fromIso).getTime()) / DAY_MS);
}

export function computeRiskSignals(deal: RiskDeal, calls: RiskCall[], now: Date, config: RiskConfig = DEFAULT_RISK_CONFIG): RiskSignal[] {
  if (!isOpenStage(deal.stage)) return [];
  const signals: RiskSignal[] = [];

  if (deal.closeDate) {
    const close = new Date(`${deal.closeDate}T23:59:59Z`);
    if (close.getTime() < now.getTime()) {
      signals.push({ code: "close_date_passed", severity: "high", message: `Close date ${deal.closeDate} has passed.` });
    }
  }

  const ordered = [...calls].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const latest = ordered[0];
  if (!latest) {
    signals.push({ code: "no_calls", severity: "medium", message: "No call has been logged for this deal." });
    return signals;
  }

  const age = daysBetween(latest.occurredAt, now);
  if (age > config.staleAfterDays) {
    signals.push({
      code: "stale_conversation",
      severity: age > config.staleAfterDays * 2 ? "high" : "medium",
      message: `No call in ${age} days (threshold ${config.staleAfterDays}).`,
      callId: latest.id,
    });
  }
  if (latest.nextStepCount === 0) {
    signals.push({ code: "no_next_step", severity: "medium", message: "The latest call ended without a detected next step.", callId: latest.id });
  }
  const competitor = latest.competitorHits[0];
  if (competitor) {
    const names = [...new Set(latest.competitorHits.map((hit) => hit.keyword))].join(", ");
    signals.push({
      code: "competitor_mentioned",
      severity: "low",
      message: `Competitor mentioned in the latest call: ${names}.`,
      callId: latest.id,
      at: competitor.start,
    });
  }
  return signals;
}
