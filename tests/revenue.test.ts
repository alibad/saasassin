import { describe, expect, it } from "vitest";

import { analyzeCall, keywordPattern, matchTrackers, type Tracker } from "../src/lib/revenue/analysis";
import { aggregateRepStats, computeScorecard, DEFAULT_RUBRIC, locateSpan, REDACTION_MARK, redactSegments, resolveSnippetRange } from "../src/lib/revenue/coaching";
import { allowedNextStages, checkStageTransition, computeRiskSignals } from "../src/lib/revenue/deals";
import { callsPastRetention } from "../src/lib/revenue/retention";
import { searchTranscripts } from "../src/lib/revenue/search";
import { callSchema, consentSchema } from "../src/lib/revenue/schemas";
import { detectFormat, formatTimestamp, parseTimestamp, parseTranscript, TranscriptParseError } from "../src/lib/revenue/transcript";

const VTT = `WEBVTT

1
00:00:00.000 --> 00:00:10.000
<v Ana Rep>Thanks for joining. What does your pricing process look like?

2
00:00:10.000 --> 00:00:40.000
<v Ben Buyer>We compared Gong last quarter. Budget is tight.

3
00:00:40.000 --> 00:00:50.000
<v Ana Rep>Understood. I'll send a proposal by Friday.
`;

const SRT = `1
00:00:01,000 --> 00:00:04,500
Ana: Hello there?

2
00:00:04,500 --> 00:00:09,000
Ben: Hi. Let's talk about the price increase.
`;

describe("transcript parsing", () => {
  it("parses WebVTT voice tags into timed speaker segments", () => {
    const parsed = parseTranscript(VTT);
    expect(parsed.format).toBe("vtt");
    expect(parsed.speakers).toEqual(["Ana Rep", "Ben Buyer"]);
    expect(parsed.segments).toHaveLength(3);
    expect(parsed.segments[1]).toMatchObject({ index: 1, speaker: "Ben Buyer", start: 10, end: 40 });
    expect(parsed.timingEstimated).toBe(false);
  });

  it("parses SRT with comma milliseconds and Speaker: prefixes", () => {
    expect(detectFormat(SRT)).toBe("srt");
    const parsed = parseTranscript(SRT);
    expect(parsed.segments[0]).toMatchObject({ speaker: "Ana", start: 1, end: 4.5, text: "Hello there?" });
    expect(parsed.segments[1].speaker).toBe("Ben");
  });

  it("parses plain Speaker: text with timestamps, using the next turn as the end", () => {
    const parsed = parseTranscript("[00:05] Ana: Hi\n[00:20] Ben: Hello back\nand a continuation?\n[01:00] Ana: Bye");
    expect(parsed.format).toBe("plain");
    expect(parsed.segments).toHaveLength(3);
    expect(parsed.segments[0]).toMatchObject({ start: 5, end: 20 });
    expect(parsed.segments[1].text).toBe("Hello back and a continuation?");
    expect(parsed.timingEstimated).toBe(false);
  });

  it("estimates timing from word count when plain text has no timestamps", () => {
    const parsed = parseTranscript("Ana: one two three four five\nBen: six seven");
    expect(parsed.timingEstimated).toBe(true);
    expect(parsed.segments[0]).toMatchObject({ start: 0, end: 2 });
    expect(parsed.segments[1]).toMatchObject({ start: 2, end: 3 });
  });

  it("rejects empty and unparseable input", () => {
    expect(() => parseTranscript("   ")).toThrow(TranscriptParseError);
    expect(() => parseTranscript("WEBVTT\n\nNOTE nothing here")).toThrow(TranscriptParseError);
  });

  it("converts timestamps both ways", () => {
    expect(parseTimestamp("01:02:03.500")).toBe(3723.5);
    expect(parseTimestamp("2:03")).toBe(123);
    expect(formatTimestamp(3723.5)).toBe("1:02:03");
    expect(formatTimestamp(65)).toBe("1:05");
  });
});

const trackers: Tracker[] = [
  { id: "t1", name: "Pricing", kind: "keyword", keywords: ["price", "pricing", "price increase", "budget"] },
  { id: "t2", name: "Competitors", kind: "competitor", keywords: ["Gong"] },
];

describe("tracker matching", () => {
  it("matches whole words case-insensitively and prefers the longest phrase", () => {
    const parsed = parseTranscript(SRT);
    const hits = matchTrackers(parsed.segments, trackers);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ trackerId: "t1", keyword: "price increase", segmentIndex: 1, start: 4.5 });
    expect(parsed.segments[1].text.slice(hits[0].charStart, hits[0].charEnd)).toBe("price increase");
  });

  it("does not match inside other words", () => {
    const pattern = keywordPattern("price")!;
    expect("priceless".match(pattern)).toBeNull();
    expect("The PRICE, please".match(pattern)?.[0]).toBe("PRICE");
  });
});

describe("call analysis", () => {
  const analysis = analyzeCall(parseTranscript(VTT).segments, trackers);

  it("computes talk ratio per speaker from segment durations", () => {
    const ana = analysis.speakers.find((speaker) => speaker.speaker === "Ana Rep")!;
    const ben = analysis.speakers.find((speaker) => speaker.speaker === "Ben Buyer")!;
    expect(analysis.totalTalkSeconds).toBe(50);
    expect(ana.talkRatio).toBe(0.4);
    expect(ben.talkRatio).toBe(0.6);
    expect(ana.turns).toBe(2);
  });

  it("finds the longest monologue, questions, and interactivity", () => {
    expect(analysis.longestMonologue).toMatchObject({ speaker: "Ben Buyer", seconds: 30, start: 10 });
    expect(analysis.questionCount).toBe(1);
    expect(analysis.interactivity.switches).toBe(2);
    expect(analysis.interactivity.switchesPerMinute).toBe(2.4);
    expect(analysis.interactivity.score).toBe(6);
  });

  it("reports tracker hits with timestamps and flags competitors", () => {
    expect(analysis.trackerSummary.map((entry) => [entry.trackerName, entry.count])).toEqual([
      ["Pricing", 2],
      ["Competitors", 1],
    ]);
    expect(analysis.competitorMentioned).toBe(true);
    expect(analysis.trackerHits.find((hit) => hit.kind === "competitor")?.start).toBe(10);
  });

  it("detects next steps by phrase rule", () => {
    expect(analysis.nextSteps).toHaveLength(1);
    expect(analysis.nextSteps[0]).toMatchObject({ segmentIndex: 2, start: 40, rule: "send-commitment" });
  });

  it("is deterministic", () => {
    expect(analyzeCall(parseTranscript(VTT).segments, trackers)).toEqual(analysis);
  });
});

describe("deal stage machine", () => {
  it("lets open deals move between open stages and close", () => {
    expect(checkStageTransition("discovery", "proposal", { privileged: false }).allowed).toBe(true);
    expect(checkStageTransition("proposal", "discovery", { privileged: false }).allowed).toBe(true);
    expect(checkStageTransition("negotiation", "closed_won", { privileged: false }).allowed).toBe(true);
  });

  it("rejects no-op moves and closed-to-closed moves", () => {
    expect(checkStageTransition("demo", "demo", { privileged: true }).allowed).toBe(false);
    expect(checkStageTransition("closed_won", "closed_lost", { privileged: true }).allowed).toBe(false);
  });

  it("only privileged roles can reopen a closed deal", () => {
    expect(checkStageTransition("closed_lost", "negotiation", { privileged: false }).allowed).toBe(false);
    expect(checkStageTransition("closed_lost", "negotiation", { privileged: true }).allowed).toBe(true);
    expect(allowedNextStages("closed_won", { privileged: false })).toEqual([]);
  });
});

describe("risk signals", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const open = { stage: "proposal" as const, closeDate: "2026-12-01", createdAt: "2026-09-01T00:00:00Z" };

  it("flags an open deal with no calls", () => {
    expect(computeRiskSignals(open, [], now).map((signal) => signal.code)).toEqual(["no_calls"]);
  });

  it("flags stale conversations, missing next steps, competitors and passed close dates", () => {
    const signals = computeRiskSignals(
      { ...open, closeDate: "2026-10-01" },
      [
        { id: "old", occurredAt: "2026-09-01T10:00:00Z", nextStepCount: 1, competitorHits: [] },
        { id: "latest", occurredAt: "2026-10-01T10:00:00Z", nextStepCount: 0, competitorHits: [{ trackerName: "Competitors", keyword: "Gong", start: 42 }] },
      ],
      now,
      { staleAfterDays: 14 },
    );
    expect(signals.map((signal) => signal.code)).toEqual(["close_date_passed", "stale_conversation", "no_next_step", "competitor_mentioned"]);
    expect(signals.every((signal) => signal.code === "close_date_passed" || signal.callId === "latest")).toBe(true);
    expect(signals.find((signal) => signal.code === "competitor_mentioned")?.at).toBe(42);
  });

  it("returns nothing for healthy and closed deals", () => {
    const recent = [{ id: "c", occurredAt: "2026-10-25T10:00:00Z", nextStepCount: 2, competitorHits: [] }];
    expect(computeRiskSignals(open, recent, now)).toEqual([]);
    expect(computeRiskSignals({ ...open, stage: "closed_lost" }, [], now)).toEqual([]);
  });
});

describe("consent enforcement", () => {
  const base = {
    dealId: "d1",
    title: "Discovery",
    occurredAt: "2026-10-20T10:00:00Z",
    repEmail: "rep@example.com",
    repSpeaker: null,
    transcript: "Ana: hi",
  };

  it("rejects calls without consent or without all-party confirmation", () => {
    expect(callSchema.safeParse(base).success).toBe(false);
    expect(callSchema.safeParse({ ...base, consent: { jurisdiction: "US-CA", basis: "all-party-verbal", allPartyConfirmed: false } }).success).toBe(false);
    expect(consentSchema.safeParse({ jurisdiction: "", basis: "all-party-verbal", allPartyConfirmed: true }).success).toBe(false);
  });

  it("accepts complete consent metadata", () => {
    const parsed = callSchema.safeParse({ ...base, consent: { jurisdiction: "US-CA", basis: "all-party-written", allPartyConfirmed: true } });
    expect(parsed.success).toBe(true);
  });
});

describe("coaching", () => {
  it("computes a weighted scorecard percent and requires every criterion", () => {
    const all5 = Object.fromEntries(DEFAULT_RUBRIC.map((criterion) => [criterion.id, 5]));
    expect(computeScorecard(DEFAULT_RUBRIC, all5).percent).toBe(100);
    const all1 = Object.fromEntries(DEFAULT_RUBRIC.map((criterion) => [criterion.id, 1]));
    expect(computeScorecard(DEFAULT_RUBRIC, all1).percent).toBe(0);
    expect(() => computeScorecard(DEFAULT_RUBRIC, { discovery: 3 })).toThrow();
  });

  it("redacts a span without mutating the input or returning removed text", () => {
    const segments = parseTranscript("Ana: my phone is 555 0100 ok").segments;
    const span = locateSpan(segments[0], "555 0100")!;
    const result = redactSegments(segments, span);
    expect(result.segments[0].text).toBe(`my phone is ${REDACTION_MARK} ok`);
    expect(segments[0].text).toContain("555 0100");
    expect(JSON.stringify(result)).not.toContain("555 0100");
    expect(() => redactSegments(segments, { segmentIndex: 0, charStart: 5, charEnd: 999 })).toThrow();
  });

  it("aggregates rep stats from logged calls only", () => {
    const analysis = analyzeCall(parseTranscript(VTT).segments, trackers);
    const stats = aggregateRepStats([
      { repEmail: "ana@example.com", repSpeaker: "Ana Rep", analysis, scorePercent: 80 },
      { repEmail: "ana@example.com", repSpeaker: null, analysis: { ...analysis, nextSteps: [] }, scorePercent: null },
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ calls: 2, avgRepTalkRatio: 0.4, nextStepRate: 0.5, avgScorePercent: 80, scoredCalls: 1 });
    expect(aggregateRepStats([])).toEqual([]);
  });
});

describe("transcript retention", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const calls = [
    { id: "new", occurredAt: "2026-10-20T10:00:00Z" },
    { id: "old", occurredAt: "2026-06-01T10:00:00Z" },
    { id: "older", occurredAt: "2026-01-01T10:00:00Z" },
  ];

  it("keeps everything when no retention period is set", () => {
    expect(callsPastRetention(calls, now, null)).toEqual([]);
  });

  it("selects only calls older than the period, oldest first", () => {
    expect(callsPastRetention(calls, now, 90).map((call) => call.id)).toEqual(["older", "old"]);
    expect(callsPastRetention(calls, now, 365)).toEqual([]);
  });

  it("rejects out-of-range periods", () => {
    expect(() => callsPastRetention(calls, now, 1)).toThrow();
    expect(() => callsPastRetention(calls, now, 30.5)).toThrow();
  });
});

describe("transcript search", () => {
  const calls = [
    { id: "a", title: "Discovery", dealId: "d1", occurredAt: "2026-10-01T10:00:00Z", segments: parseTranscript(VTT).segments },
    { id: "b", title: "Pricing", dealId: "d2", occurredAt: "2026-10-10T10:00:00Z", segments: parseTranscript(SRT).segments },
  ];

  it("returns exact segment spans, newest call first", () => {
    const { results } = searchTranscripts(calls, "price");
    expect(results.map((result) => result.callId)).toEqual(["b"]);
    const { results: budget } = searchTranscripts(calls, "BUDGET");
    expect(budget[0]).toMatchObject({ callId: "a", segmentIndex: 1, start: 10, speaker: "Ben Buyer" });
    expect(budget[0].text.slice(budget[0].charStart, budget[0].charEnd)).toBe("Budget");
  });

  it("ignores too-short queries and caps results", () => {
    expect(searchTranscripts(calls, "a").results).toEqual([]);
    const capped = searchTranscripts(calls, "the", 0);
    expect(capped.truncated).toBe(true);
    expect(capped.results).toEqual([]);
  });
});

describe("coaching clips", () => {
  const segments = parseTranscript(VTT).segments;

  it("resolves a segment range to timestamps without copying text", () => {
    expect(resolveSnippetRange(segments, 1, 2)).toEqual({ start: 10, end: 50 });
    expect(resolveSnippetRange(segments, 0, 0)).toEqual({ start: 0, end: 10 });
  });

  it("rejects reversed, missing, and oversized ranges", () => {
    expect(() => resolveSnippetRange(segments, 2, 1)).toThrow();
    expect(() => resolveSnippetRange(segments, 0, 9)).toThrow();
    expect(() => resolveSnippetRange(segments, 0, 60)).toThrow();
  });
});
