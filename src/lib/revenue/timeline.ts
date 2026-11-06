/**
 * Deal timeline: stage history, calls, call comments and detected next steps in one chronological
 * stream, plus time-in-stage statistics. Pure; every entry links back to its source record.
 */

import { DEAL_STAGES, daysBetween, isOpenStage, type DealStage, type StageChange } from "./deals";

export type TimelineCall = {
  id: string;
  title: string;
  occurredAt: string;
  repEmail: string;
  durationSeconds: number;
  nextSteps: Array<{ text: string; start: number; segmentIndex: number }>;
};
export type TimelineComment = { id: string; callId: string; at: number; body: string; authorEmail: string; createdAt: string };

export type TimelineEntry =
  | { kind: "stage"; at: string; from: DealStage | null; to: DealStage; by: string }
  | { kind: "call"; at: string; callId: string; title: string; repEmail: string; durationSeconds: number }
  | { kind: "next_step"; at: string; callId: string; callTitle: string; text: string; offset: number }
  | { kind: "comment"; at: string; callId: string; callTitle: string; commentId: string; body: string; authorEmail: string; offset: number };

const ORDER: Record<TimelineEntry["kind"], number> = { stage: 0, call: 1, next_step: 2, comment: 3 };

export function buildDealTimeline(stageHistory: StageChange[], calls: TimelineCall[], comments: TimelineComment[]): TimelineEntry[] {
  const titles = new Map(calls.map((call) => [call.id, call.title]));
  const entries: TimelineEntry[] = [
    ...stageHistory.map((change) => ({ kind: "stage" as const, at: change.at, from: change.from, to: change.to, by: change.by })),
    ...calls.map((call) => ({ kind: "call" as const, at: call.occurredAt, callId: call.id, title: call.title, repEmail: call.repEmail, durationSeconds: call.durationSeconds })),
    ...calls.flatMap((call) =>
      call.nextSteps.map((step) => ({ kind: "next_step" as const, at: call.occurredAt, callId: call.id, callTitle: call.title, text: step.text, offset: step.start })),
    ),
    ...comments
      .filter((comment) => titles.has(comment.callId))
      .map((comment) => ({
        kind: "comment" as const,
        at: comment.createdAt,
        callId: comment.callId,
        callTitle: titles.get(comment.callId)!,
        commentId: comment.id,
        body: comment.body,
        authorEmail: comment.authorEmail,
        offset: comment.at,
      })),
  ];
  // Newest first; within the same instant, stage → call → its next steps → comments.
  return entries.sort((a, b) => b.at.localeCompare(a.at) || ORDER[a.kind] - ORDER[b.kind] || ("offset" in a && "offset" in b ? a.offset - b.offset : 0));
}

export type StageDuration = { stage: DealStage; days: number; visits: number; current: boolean };

const DAY_MS = 86_400_000;

/** Total (fractional → rounded to 0.1) days spent in each stage, from the deal's stage history. */
export function stageDurations(stageHistory: StageChange[], now: Date): StageDuration[] {
  const ordered = [...stageHistory].sort((a, b) => a.at.localeCompare(b.at));
  const totals = new Map<DealStage, { ms: number; visits: number }>();
  ordered.forEach((change, i) => {
    const end = ordered[i + 1] ? new Date(ordered[i + 1].at).getTime() : now.getTime();
    const entry = totals.get(change.to) ?? { ms: 0, visits: 0 };
    entry.ms += Math.max(0, end - new Date(change.at).getTime());
    entry.visits += 1;
    totals.set(change.to, entry);
  });
  const current = ordered.at(-1)?.to ?? null;
  return DEAL_STAGES.filter((stage) => totals.has(stage)).map((stage) => ({
    stage,
    days: Math.round((totals.get(stage)!.ms / DAY_MS) * 10) / 10,
    visits: totals.get(stage)!.visits,
    current: stage === current,
  }));
}

export type StageStats = {
  currentStage: DealStage;
  daysInCurrentStage: number;
  enteredCurrentStageAt: string | null;
  stalled: boolean;
  stalledAfterDays: number;
  durations: StageDuration[];
  ageDays: number;
};

export function dealStageStats(
  deal: { stage: DealStage; stageHistory: StageChange[]; createdAt: string },
  now: Date,
  stalledAfterDays: number,
): StageStats {
  const entered = [...deal.stageHistory].reverse().find((change) => change.to === deal.stage)?.at ?? deal.createdAt;
  const daysInCurrentStage = entered ? daysBetween(entered, now) : 0;
  return {
    currentStage: deal.stage,
    daysInCurrentStage,
    enteredCurrentStageAt: entered,
    stalled: isOpenStage(deal.stage) && daysInCurrentStage > stalledAfterDays,
    stalledAfterDays,
    durations: stageDurations(deal.stageHistory, now),
    ageDays: daysBetween(deal.createdAt, now),
  };
}
