/**
 * CRM field write preview. Pure: shows exactly which CRM fields Revenue would
 * write for a deal and the transcript evidence behind each proposed value.
 * Nothing is written until a CRM connection exists and a person approves it.
 */

import { DEAL_STAGE_LABELS, type DealStage } from "./deals";

export type CrmPreviewDeal = { stage: DealStage; amount: number; currency: string; closeDate: string | null };

export type CrmPreviewCall = {
  id: string;
  occurredAt: string;
  nextSteps: Array<{ text: string; start: number }>;
  competitorKeywords: string[];
  firstCompetitorAt: number | null;
};

export type CrmFieldProposal = {
  field: string;
  proposed: string;
  source: "deal" | "call";
  evidence?: { callId: string; at: number | null };
};

const MAX_NEXT_STEP_CHARS = 255;

export function buildCrmFieldPreview(deal: CrmPreviewDeal, calls: CrmPreviewCall[]): CrmFieldProposal[] {
  const proposals: CrmFieldProposal[] = [
    { field: "Stage", proposed: DEAL_STAGE_LABELS[deal.stage], source: "deal" },
    { field: "Amount", proposed: `${deal.currency} ${deal.amount}`, source: "deal" },
    { field: "Close date", proposed: deal.closeDate ?? "", source: "deal" },
  ];
  const latest = [...calls].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  if (!latest) return proposals;
  proposals.push({ field: "Last call date", proposed: latest.occurredAt.slice(0, 10), source: "call", evidence: { callId: latest.id, at: null } });
  const step = latest.nextSteps.at(-1);
  if (step) {
    const text = step.text.length > MAX_NEXT_STEP_CHARS ? `${step.text.slice(0, MAX_NEXT_STEP_CHARS - 1)}…` : step.text;
    proposals.push({ field: "Next step", proposed: text, source: "call", evidence: { callId: latest.id, at: step.start } });
  }
  if (latest.competitorKeywords.length) {
    proposals.push({
      field: "Competitors mentioned",
      proposed: [...new Set(latest.competitorKeywords)].join(", "),
      source: "call",
      evidence: { callId: latest.id, at: latest.firstCompetitorAt },
    });
  }
  return proposals;
}
