/**
 * Deterministic call analysis. Pure: the same transcript and trackers always
 * produce the same result, and every signal points at a transcript segment and
 * timestamp so a reviewer can check it. No model, no scoring of emotion.
 */

import type { TranscriptSegment } from "./transcript";

export const ANALYSIS_VERSION = 1;

export type TrackerKind = "keyword" | "competitor";

export type Tracker = {
  id: string;
  name: string;
  kind: TrackerKind;
  keywords: string[];
};

export type SpeakerStats = {
  speaker: string;
  talkSeconds: number;
  /** Share of all talk time, 0–1. */
  talkRatio: number;
  turns: number;
  words: number;
  questions: number;
  longestMonologueSeconds: number;
};

export type Monologue = { speaker: string; seconds: number; start: number; end: number; segmentIndex: number };

export type TrackerHit = {
  trackerId: string;
  trackerName: string;
  kind: TrackerKind;
  keyword: string;
  segmentIndex: number;
  start: number;
  speaker: string;
  /** Character offsets of the match inside the segment text. */
  charStart: number;
  charEnd: number;
};

export type NextStep = { segmentIndex: number; start: number; speaker: string; text: string; rule: string };

export type CallAnalysis = {
  version: number;
  durationSeconds: number;
  totalTalkSeconds: number;
  speakers: SpeakerStats[];
  longestMonologue: Monologue | null;
  questionCount: number;
  interactivity: { switches: number; switchesPerMinute: number; score: number };
  trackerHits: TrackerHit[];
  trackerSummary: Array<{ trackerId: string; trackerName: string; kind: TrackerKind; count: number; firstAt: number }>;
  nextSteps: NextStep[];
  competitorMentioned: boolean;
};

/**
 * Next-step phrase rules. A segment counts as a next step when any rule matches;
 * the rule id is stored so reviewers can see why.
 */
export const NEXT_STEP_RULES: Array<{ id: string; pattern: RegExp }> = [
  { id: "explicit-next-step", pattern: /\bnext steps?\b/i },
  { id: "action-item", pattern: /\baction items?\b/i },
  { id: "follow-up", pattern: /\bfollow(?:[- ])?up\b/i },
  { id: "schedule", pattern: /\b(?:let'?s|we(?:'ll| will| can)|i(?:'ll| will| can))\s+(?:schedule|set up|book|put .{0,20}on the calendar|reconvene|regroup|meet again)\b/i },
  { id: "send-commitment", pattern: /\b(?:i|we)(?:'ll| will| can)\s+(?:send|share|email|forward|get you)\b/i },
  { id: "dated-commitment", pattern: /\bby (?:monday|tuesday|wednesday|thursday|friday|tomorrow|next week|end of (?:the )?(?:day|week|month|quarter)|eod|eow)\b/i },
  { id: "circle-back", pattern: /\bcircle back\b/i },
];

/** Interactivity score: 4 speaker switches per minute or more scores 10. */
export const INTERACTIVITY_FULL_SCORE_SWITCHES_PER_MINUTE = 4;

function roundTo(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word, case-insensitive phrase matcher; whitespace inside a phrase is flexible. */
export function keywordPattern(keyword: string): RegExp | null {
  const words = keyword.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (!words.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.join("\\s+")}(?![\\p{L}\\p{N}])`, "giu");
}

export function matchTrackers(segments: TranscriptSegment[], trackers: Tracker[]): TrackerHit[] {
  const hits: TrackerHit[] = [];
  for (const tracker of trackers) {
    const keywords = [...new Set(tracker.keywords.map((keyword) => keyword.trim()).filter(Boolean))];
    for (const segment of segments) {
      const taken: Array<[number, number]> = [];
      // Longer phrases first so "price increase" wins over "price" at the same spot.
      for (const keyword of [...keywords].sort((a, b) => b.length - a.length)) {
        const pattern = keywordPattern(keyword);
        if (!pattern) continue;
        for (const match of segment.text.matchAll(pattern)) {
          const charStart = match.index ?? 0;
          const charEnd = charStart + match[0].length;
          if (taken.some(([s, e]) => charStart < e && charEnd > s)) continue;
          taken.push([charStart, charEnd]);
          hits.push({
            trackerId: tracker.id,
            trackerName: tracker.name,
            kind: tracker.kind,
            keyword,
            segmentIndex: segment.index,
            start: segment.start,
            speaker: segment.speaker,
            charStart,
            charEnd,
          });
        }
      }
    }
  }
  return hits.sort((a, b) => a.segmentIndex - b.segmentIndex || a.charStart - b.charStart || a.trackerId.localeCompare(b.trackerId));
}

export function countQuestions(text: string) {
  return (text.match(/\?+/g) ?? []).length;
}

export function detectNextSteps(segments: TranscriptSegment[]): NextStep[] {
  const steps: NextStep[] = [];
  for (const segment of segments) {
    const rule = NEXT_STEP_RULES.find(({ pattern }) => pattern.test(segment.text));
    if (rule) {
      steps.push({ segmentIndex: segment.index, start: segment.start, speaker: segment.speaker, text: segment.text, rule: rule.id });
    }
  }
  return steps;
}

export function analyzeCall(segments: TranscriptSegment[], trackers: Tracker[] = []): CallAnalysis {
  const ordered = [...segments].sort((a, b) => a.start - b.start || a.index - b.index);
  const stats = new Map<string, SpeakerStats>();
  let totalTalk = 0;
  let questionCount = 0;
  for (const segment of ordered) {
    const seconds = Math.max(0, segment.end - segment.start);
    const questions = countQuestions(segment.text);
    totalTalk += seconds;
    questionCount += questions;
    const entry = stats.get(segment.speaker) ?? {
      speaker: segment.speaker,
      talkSeconds: 0,
      talkRatio: 0,
      turns: 0,
      words: 0,
      questions: 0,
      longestMonologueSeconds: 0,
    };
    entry.talkSeconds += seconds;
    entry.words += segment.text.split(/\s+/).filter(Boolean).length;
    entry.questions += questions;
    stats.set(segment.speaker, entry);
  }

  // Turns and monologues: consecutive segments by the same speaker form one turn.
  let longest: Monologue | null = null;
  let switches = 0;
  let turnStart = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    const segment = ordered[i];
    const next = ordered[i + 1];
    if (!next || next.speaker !== segment.speaker) {
      const first = ordered[turnStart];
      const seconds = roundTo(segment.end - first.start);
      const entry = stats.get(segment.speaker)!;
      entry.turns += 1;
      entry.longestMonologueSeconds = Math.max(entry.longestMonologueSeconds, seconds);
      if (!longest || seconds > longest.seconds) {
        longest = { speaker: segment.speaker, seconds, start: first.start, end: segment.end, segmentIndex: first.index };
      }
      if (next) switches += 1;
      turnStart = i + 1;
    }
  }

  const durationSeconds = ordered.length
    ? Math.max(...ordered.map((segment) => segment.end)) - Math.min(...ordered.map((segment) => segment.start))
    : 0;
  const minutes = durationSeconds / 60;
  const switchesPerMinute = minutes > 0 ? switches / minutes : 0;
  const trackerHits = matchTrackers(ordered, trackers);
  const summary = new Map<string, CallAnalysis["trackerSummary"][number]>();
  for (const hit of trackerHits) {
    const entry = summary.get(hit.trackerId) ?? { trackerId: hit.trackerId, trackerName: hit.trackerName, kind: hit.kind, count: 0, firstAt: hit.start };
    entry.count += 1;
    entry.firstAt = Math.min(entry.firstAt, hit.start);
    summary.set(hit.trackerId, entry);
  }

  return {
    version: ANALYSIS_VERSION,
    durationSeconds: roundTo(durationSeconds),
    totalTalkSeconds: roundTo(totalTalk),
    speakers: [...stats.values()]
      .map((entry) => ({
        ...entry,
        talkSeconds: roundTo(entry.talkSeconds),
        talkRatio: totalTalk > 0 ? roundTo(entry.talkSeconds / totalTalk, 4) : 0,
      }))
      .sort((a, b) => b.talkSeconds - a.talkSeconds || a.speaker.localeCompare(b.speaker)),
    longestMonologue: longest,
    questionCount,
    interactivity: {
      switches,
      switchesPerMinute: roundTo(switchesPerMinute),
      score: roundTo(Math.min(10, (switchesPerMinute / INTERACTIVITY_FULL_SCORE_SWITCHES_PER_MINUTE) * 10), 1),
    },
    trackerHits,
    trackerSummary: [...summary.values()].sort((a, b) => b.count - a.count || a.trackerName.localeCompare(b.trackerName)),
    nextSteps: detectNextSteps(ordered),
    competitorMentioned: trackerHits.some((hit) => hit.kind === "competitor"),
  };
}

/** Default trackers seeded into a new workspace; teams edit them in Trackers. */
export const DEFAULT_TRACKERS: Array<Omit<Tracker, "id">> = [
  { name: "Pricing", kind: "keyword", keywords: ["pricing", "price", "budget", "discount", "cost"] },
  { name: "Timeline", kind: "keyword", keywords: ["timeline", "deadline", "go live", "this quarter"] },
  { name: "Security review", kind: "keyword", keywords: ["security review", "SOC 2", "DPA", "procurement"] },
  { name: "Competitors", kind: "competitor", keywords: ["Gong", "Chorus", "Clari"] },
];
