/**
 * Scorecards, transcript redaction, and rep aggregation. Pure functions.
 */

import type { CallAnalysis } from "./analysis";
import type { TranscriptSegment } from "./transcript";

export type RubricCriterion = { id: string; label: string; weight: number };

export const DEFAULT_RUBRIC: RubricCriterion[] = [
  { id: "discovery", label: "Discovery: uncovered the customer's problem and impact", weight: 3 },
  { id: "listening", label: "Listening: let the customer talk and built on answers", weight: 2 },
  { id: "value", label: "Value: tied the product to the customer's stated problem", weight: 2 },
  { id: "objections", label: "Objections: handled concerns with evidence", weight: 2 },
  { id: "next-steps", label: "Next steps: agreed a dated, owned next step", weight: 3 },
];

export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

export type ScorecardResult = { totalWeight: number; weightedScore: number; percent: number };

/** Weighted average of 1–5 scores, expressed as a percent of the maximum. Every criterion must be scored. */
export function computeScorecard(rubric: RubricCriterion[], scores: Record<string, number>): ScorecardResult {
  if (!rubric.length) throw new Error("The rubric has no criteria.");
  let totalWeight = 0;
  let weighted = 0;
  for (const criterion of rubric) {
    const score = scores[criterion.id];
    if (!Number.isInteger(score) || score < SCORE_MIN || score > SCORE_MAX) {
      throw new Error(`Score "${criterion.label}" from ${SCORE_MIN} to ${SCORE_MAX}.`);
    }
    totalWeight += criterion.weight;
    weighted += score * criterion.weight;
  }
  const weightedScore = Math.round((weighted / totalWeight) * 100) / 100;
  return { totalWeight, weightedScore, percent: Math.round(((weightedScore - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100) };
}

export const REDACTION_MARK = "[REDACTED]";

export type RedactionRequest = { segmentIndex: number; charStart: number; charEnd: number };

/**
 * Replaces a character span inside one segment with a redaction mark.
 * Returns new segments (input untouched) plus the redacted length; the removed text is never returned.
 */
export function redactSegments(segments: TranscriptSegment[], request: RedactionRequest) {
  const target = segments.find((segment) => segment.index === request.segmentIndex);
  if (!target) throw new Error("That transcript segment does not exist.");
  const { charStart, charEnd } = request;
  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd) || charStart < 0 || charEnd <= charStart || charEnd > target.text.length) {
    throw new Error("Select a span inside the segment text.");
  }
  if (target.text.slice(charStart, charEnd) === REDACTION_MARK) {
    throw new Error("That span is already redacted.");
  }
  const text = `${target.text.slice(0, charStart)}${REDACTION_MARK}${target.text.slice(charEnd)}`;
  return {
    segments: segments.map((segment) => (segment.index === request.segmentIndex ? { ...segment, text } : segment)),
    redactedLength: charEnd - charStart,
  };
}

/** Finds the first occurrence of a phrase in a segment so the UI can redact by typed text. */
export function locateSpan(segment: TranscriptSegment, phrase: string): RedactionRequest | null {
  const needle = phrase.trim();
  if (!needle) return null;
  const at = segment.text.toLowerCase().indexOf(needle.toLowerCase());
  if (at === -1) return null;
  return { segmentIndex: segment.index, charStart: at, charEnd: at + needle.length };
}

export type RepCallInput = {
  repEmail: string;
  repSpeaker: string | null;
  analysis: Pick<CallAnalysis, "speakers" | "questionCount" | "interactivity" | "nextSteps" | "durationSeconds" | "trackerSummary">;
  scorePercent: number | null;
};

export type RepStats = {
  repEmail: string;
  calls: number;
  totalMinutes: number;
  /** Mean of the rep speaker's talk ratio, 0–1; null when no call identifies the rep speaker. */
  avgRepTalkRatio: number | null;
  avgQuestionsPerCall: number;
  avgLongestRepMonologueSeconds: number | null;
  avgInteractivity: number;
  nextStepRate: number;
  avgScorePercent: number | null;
  scoredCalls: number;
};

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const r2 = (value: number) => Math.round(value * 100) / 100;

/** Aggregates real logged calls per rep. Calls without a rep are grouped under "Unassigned". */
export function aggregateRepStats(calls: RepCallInput[]): RepStats[] {
  const byRep = new Map<string, RepCallInput[]>();
  for (const call of calls) {
    const key = call.repEmail || "Unassigned";
    byRep.set(key, [...(byRep.get(key) ?? []), call]);
  }
  return [...byRep.entries()]
    .map(([repEmail, list]) => {
      const repSpeakers = list
        .map((call) => call.analysis.speakers.find((speaker) => speaker.speaker === call.repSpeaker))
        .filter((speaker): speaker is NonNullable<typeof speaker> => Boolean(speaker));
      const talk = mean(repSpeakers.map((speaker) => speaker.talkRatio));
      const monologue = mean(repSpeakers.map((speaker) => speaker.longestMonologueSeconds));
      const scores = list.map((call) => call.scorePercent).filter((score): score is number => typeof score === "number");
      const avgScore = mean(scores);
      return {
        repEmail,
        calls: list.length,
        totalMinutes: r2(list.reduce((sum, call) => sum + call.analysis.durationSeconds, 0) / 60),
        avgRepTalkRatio: talk === null ? null : r2(talk),
        avgQuestionsPerCall: r2(mean(list.map((call) => call.analysis.questionCount)) ?? 0),
        avgLongestRepMonologueSeconds: monologue === null ? null : Math.round(monologue),
        avgInteractivity: r2(mean(list.map((call) => call.analysis.interactivity.score)) ?? 0),
        nextStepRate: r2(list.filter((call) => call.analysis.nextSteps.length > 0).length / list.length),
        avgScorePercent: avgScore === null ? null : Math.round(avgScore),
        scoredCalls: scores.length,
      };
    })
    .sort((a, b) => b.calls - a.calls || a.repEmail.localeCompare(b.repEmail));
}

export const METRIC_DEFINITIONS: Array<{ metric: string; definition: string }> = [
  { metric: "Talk ratio", definition: "Seconds the speaker's segments span ÷ seconds all segments span." },
  { metric: "Longest monologue", definition: "Longest run of consecutive segments by one speaker, first start to last end." },
  { metric: "Questions", definition: "Count of '?' groups in segment text." },
  { metric: "Interactivity", definition: "Speaker switches per minute, scaled so 4+/min = 10." },
  { metric: "Next-step rate", definition: "Share of calls where at least one next-step phrase rule matched." },
  { metric: "Score", definition: "Weighted 1–5 rubric average from manager scorecards, as % of max." },
];

export const MAX_SNIPPET_SEGMENTS = 40;

/** Resolves a clip's segment range into timestamps; the clip never copies transcript text. */
export function resolveSnippetRange(segments: TranscriptSegment[], startSegment: number, endSegment: number) {
  if (endSegment < startSegment) throw new Error("A clip must end after it starts.");
  if (endSegment - startSegment + 1 > MAX_SNIPPET_SEGMENTS) throw new Error(`Clips are limited to ${MAX_SNIPPET_SEGMENTS} segments.`);
  const first = segments.find((segment) => segment.index === startSegment);
  const last = segments.find((segment) => segment.index === endSegment);
  if (!first || !last) throw new Error("That transcript range does not exist.");
  return { start: first.start, end: Math.max(first.start, last.end) };
}

export const MAX_RUBRIC_CRITERIA = 10;

/** Normalizes an edited rubric: trimmed labels, slug ids (unique), weights 1–5, 1–10 criteria. */
export function normalizeRubric(criteria: Array<{ label: string; weight: number }>): RubricCriterion[] {
  const cleaned = criteria.map((criterion) => ({ label: criterion.label.trim(), weight: criterion.weight })).filter((criterion) => criterion.label);
  if (!cleaned.length) throw new Error("Add at least one criterion.");
  if (cleaned.length > MAX_RUBRIC_CRITERIA) throw new Error(`Rubrics are limited to ${MAX_RUBRIC_CRITERIA} criteria.`);
  const seen = new Set<string>();
  return cleaned.map((criterion) => {
    if (!Number.isInteger(criterion.weight) || criterion.weight < 1 || criterion.weight > 5) {
      throw new Error(`Weight for "${criterion.label}" must be a whole number from 1 to 5.`);
    }
    const base = criterion.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "criterion";
    let id = base;
    for (let n = 2; seen.has(id); n += 1) id = `${base}-${n}`;
    seen.add(id);
    return { id, label: criterion.label.slice(0, 160), weight: criterion.weight };
  });
}

export type AssignmentStatus = "assigned" | "acknowledged";

/** Only the assignee can acknowledge, and only once. */
export function checkAcknowledge(assignment: { assigneeEmail: string; status: AssignmentStatus }, userEmail: string) {
  if (assignment.assigneeEmail.toLowerCase() !== userEmail.toLowerCase()) {
    return { allowed: false as const, reason: "Only the assigned rep can acknowledge this coaching." };
  }
  if (assignment.status === "acknowledged") return { allowed: false as const, reason: "Already acknowledged." };
  return { allowed: true as const };
}
