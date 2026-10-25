import { describe, expect, it } from "vitest";

import { mapDovetailRows, rowsFromDovetailJson, splitTags } from "../src/lib/research/dovetail";
import { buildProjectExport, RESEARCH_EXPORT_SCHEMA } from "../src/lib/research/export";
import { actionSchema, canEdit, canManage, planRetention, retentionState, tagFrequency, type Highlight, type Source } from "../src/lib/research/model";
import { buildSearchDocs, rankDocuments } from "../src/lib/research/search";
import { adjustSpanForRedaction, reanchorSpan, redactText, snapToWords, tightenSpan, validateHighlightSpan } from "../src/lib/research/spans";
import { detectTranscriptFormat, formatTimestamp, parseTimestamp, parseTranscript } from "../src/lib/research/transcript";

const VTT = `WEBVTT

NOTE recorded with consent

1
00:00:01.000 --> 00:00:04.500
<v Interviewer>How do you store research today?</v>

2
00:00:05.000 --> 00:00:09.000
<v Maya Chen>Honestly, in a spreadsheet nobody trusts.

00:00:09.000 --> 00:00:12.000
<v Maya Chen>We lose the quotes when people leave.`;

const SRT = `1
00:00:01,000 --> 00:00:03,000
Interviewer: What triggered the search?

2
00:00:03,500 --> 00:00:07,250
Sam: Our Dovetail bill tripled.

3
00:00:07,300 --> 00:00:09,000
And we could not export the clips.`;

const PLAIN = `[00:00:02] Interviewer: Tell me about the last study.
[00:01:10] Priya: We ran twelve interviews.
It took three weeks to synthesize.
Interviewer: What was hardest?`;

describe("transcript parsing", () => {
  it("parses timestamps in several shapes", () => {
    expect(parseTimestamp("00:00:04.500")).toBe(4500);
    expect(parseTimestamp("01:02:03,250")).toBe(3723250);
    expect(parseTimestamp("2:05")).toBe(125000);
    expect(parseTimestamp("00:61")).toBeNull();
    expect(formatTimestamp(3723250)).toBe("1:02:03");
    expect(formatTimestamp(65000)).toBe("01:05");
  });

  it("detects formats", () => {
    expect(detectTranscriptFormat(VTT)).toBe("vtt");
    expect(detectTranscriptFormat(SRT)).toBe("srt");
    expect(detectTranscriptFormat(PLAIN)).toBe("plain");
  });

  it("parses VTT voice tags into speaker segments and merges consecutive turns", () => {
    const parsed = parseTranscript(VTT);
    expect(parsed.format).toBe("vtt");
    expect(parsed.speakers).toEqual(["Interviewer", "Maya Chen"]);
    expect(parsed.segments).toHaveLength(3);
    expect(parsed.segments[1]).toMatchObject({ id: "seg-2", speaker: "Maya Chen", startMs: 5000, endMs: 9000 });
    expect(parsed.segments[2].text).toBe("We lose the quotes when people leave.");
  });

  it("parses SRT speaker prefixes and continues the speaker for unlabeled cues", () => {
    const parsed = parseTranscript(SRT);
    expect(parsed.segments.map((s) => s.speaker)).toEqual(["Interviewer", "Sam"]);
    expect(parsed.segments[1].text).toBe("Our Dovetail bill tripled. And we could not export the clips.");
    expect(parsed.segments[1].endMs).toBe(9000);
  });

  it("parses plain Speaker: text lines with optional timestamps and continuation lines", () => {
    const parsed = parseTranscript(PLAIN);
    expect(parsed.segments).toHaveLength(3);
    expect(parsed.segments[1]).toMatchObject({ speaker: "Priya", startMs: 70000, text: "We ran twelve interviews. It took three weeks to synthesize." });
    expect(parsed.segments[2]).toMatchObject({ speaker: "Interviewer", startMs: null });
  });

  it("warns on empty input and rejects oversized transcripts", () => {
    expect(parseTranscript("   ").warnings).toContain("No transcript text was found.");
    expect(() => parseTranscript("x".repeat(400_001))).toThrow(/limited/);
  });
});

describe("highlight spans", () => {
  const text = "We lose the quotes when people leave.";

  it("validates spans against segment text", () => {
    expect(validateHighlightSpan(text, 3, 18)).toEqual({ ok: true, quote: "lose the quotes" });
    expect(validateHighlightSpan(text, 5, 5).ok).toBe(false);
    expect(validateHighlightSpan(text, -1, 4).ok).toBe(false);
    expect(validateHighlightSpan(text, 0, 999).ok).toBe(false);
    expect(validateHighlightSpan(text, 2, 3).ok).toBe(false); // whitespace only
    expect(validateHighlightSpan(text, 1.5, 4).ok).toBe(false);
  });

  it("tightens selections to visible characters", () => {
    expect(tightenSpan(text, 2, 19)).toEqual({ start: 3, end: 18 });
  });

  it("snaps partial-word selections to whole words", () => {
    const sentence = "We lose the quotes when people leave, and the clips live on.";
    const start = sentence.indexOf("leave") + 2; // "ave, and the clips li"
    const end = sentence.indexOf("live") + 2;
    const snapped = snapToWords(sentence, start, end);
    expect(sentence.slice(snapped.start, snapped.end)).toBe("leave, and the clips live");
    expect(snapToWords(sentence, 0, 2)).toEqual({ start: 0, end: 2 });
  });

  it("re-anchors highlights after a transcript correction", () => {
    const span = { start: 3, end: 18, quote: "lose the quotes" };
    expect(reanchorSpan("Honestly, we lose the quotes when people leave.", span)).toEqual({ start: 13, end: 28, quote: "lose the quotes", stale: false });
    expect(reanchorSpan("We misplace everything.", span).stale).toBe(true);
    expect(reanchorSpan(text, span)).toEqual({ ...span, stale: false });
  });

  it("redacts a span and keeps surrounding highlights consistent", () => {
    const source = "Call me at 555-0100 tomorrow about pricing.";
    const rStart = source.indexOf("555-0100");
    const rEnd = rStart + "555-0100".length;
    const result = redactText(source, rStart, rEnd);
    expect(result.text).toBe("Call me at [redacted] tomorrow about pricing.");
    const after = { start: source.indexOf("pricing"), end: source.indexOf("pricing") + 7, quote: "pricing" };
    const moved = adjustSpanForRedaction(result.text, after, rStart, rEnd);
    expect(result.text.slice(moved.start, moved.end)).toBe("pricing");
    expect(moved.redacted).toBe(false);
    const overlapping = { start: 0, end: rEnd, quote: source.slice(0, rEnd) };
    const rewritten = adjustSpanForRedaction(result.text, overlapping, rStart, rEnd);
    expect(rewritten).toMatchObject({ quote: "Call me at [redacted]", redacted: true });
    expect(() => redactText(source, 4, 4)).toThrow();
  });
});

function source(partial: Partial<Source> = {}): Source {
  return {
    id: "src-1",
    projectId: "p1",
    title: "Interview with Maya",
    kind: "interview",
    format: "vtt",
    fileName: "maya.vtt",
    participant: { name: "Maya Chen", email: "", company: "Acme" },
    consent: { status: "granted", capturedOn: "2026-10-01", retentionUntil: "2027-10-01", notes: "" },
    segments: parseTranscript(VTT).segments,
    redactionCount: 0,
    createdAt: null,
    createdBy: "u1",
    updatedAt: null,
    ...partial,
  };
}

function highlight(partial: Partial<Highlight> = {}): Highlight {
  return {
    id: "h1",
    projectId: "p1",
    sourceId: "src-1",
    segmentId: "seg-3",
    start: 3,
    end: 18,
    quote: "lose the quotes",
    tags: ["knowledge-loss"],
    note: "",
    stale: false,
    redacted: false,
    createdAt: null,
    createdBy: "u1",
    ...partial,
  };
}

describe("search ranking", () => {
  const docs = buildSearchDocs({
    sources: [source()],
    highlights: [highlight()],
    insights: [{ id: "i1", projectId: "p1", title: "Teams lose quotes when researchers leave", body: "Knowledge walks out the door.", highlightIds: ["h1"], themeId: null, createdAt: null, createdBy: "u1", updatedAt: null }],
  });

  it("ranks insights above highlights above raw segments for the same terms", () => {
    const results = rankDocuments("lose quotes", docs);
    expect(results.map((r) => r.type).slice(0, 3)).toEqual(["insight", "highlight", "segment"]);
    expect(results[0].matchedTerms).toEqual(["lose", "quotes"]);
  });

  it("matches tags, prefixes and diacritics, and returns nothing for empty queries", () => {
    expect(rankDocuments("knowledge", docs).some((r) => r.type === "highlight")).toBe(true);
    expect(rankDocuments("spread", docs)[0].body).toContain("spreadsheet");
    expect(rankDocuments("the", docs)).toEqual([]);
    expect(rankDocuments("Mâya", docs).some((r) => r.type === "source")).toBe(true);
  });

  it("drops highlights whose source is not in the visible set", () => {
    const hidden = buildSearchDocs({ sources: [], highlights: [highlight()], insights: [] });
    expect(hidden).toEqual([]);
  });

  it("builds snippets around the first match", () => {
    const [result] = rankDocuments("spreadsheet", docs);
    expect(result.snippet).toContain("spreadsheet");
    expect(result.segmentId).toBe("seg-2");
  });
});

describe("project export", () => {
  it("emits a versioned envelope with the full evidence chain", () => {
    const exported = buildProjectExport({
      project: { id: "p1", name: "Onboarding study", description: "", createdAt: null, createdBy: "u1" },
      sources: [source()],
      highlights: [highlight()],
      insights: [{ id: "i1", projectId: "p1", title: "Insight", body: "", highlightIds: ["h1", "missing"], themeId: null, createdAt: null, createdBy: "u1", updatedAt: null }],
      themes: [],
      exportedAt: "2026-10-26T00:00:00.000Z",
    });
    expect(exported.schema).toBe(RESEARCH_EXPORT_SCHEMA);
    expect(exported.version).toBe("1.0.0");
    expect(exported.counts).toEqual({ sources: 1, segments: 3, highlights: 1, insights: 1, themes: 0 });
    expect(exported.relationships.evidence).toEqual([
      { insightId: "i1", highlightId: "h1", sourceId: "src-1", segmentId: "seg-3", start: 3, end: 18, quote: "lose the quotes" },
    ]);
    expect(exported.relationships.brokenLinks).toEqual([{ insightId: "i1", highlightId: "missing" }]);
    expect(JSON.parse(JSON.stringify(exported))).toEqual(exported);
  });
});

describe("dovetail import mapping", () => {
  it("maps highlight rows into sources, segments and full-span highlights with a report", () => {
    const { sources, highlights, report } = mapDovetailRows([
      { Highlight: "Pricing is opaque", Note: "Interview 1", Tags: "Pricing, Trust", Participant: "Ana", Extra: "x" },
      { Highlight: "We export to Notion weekly", Note: "Interview 1", Tags: "export;workflow", Participant: "Ana" },
      { Highlight: "   ", Note: "Interview 2", Tags: "", Participant: "Ben" },
      { Highlight: "Search never finds clips", Note: "", Tags: "search", Participant: "" },
    ]);
    expect(sources.map((s) => s.title)).toEqual(["Interview 1", "Imported Dovetail highlights"]);
    expect(sources[0].segments).toHaveLength(2);
    expect(highlights[0]).toMatchObject({ start: 0, end: 17, quote: "Pricing is opaque", tags: ["pricing", "trust"], segmentId: "seg-1" });
    expect(report).toMatchObject({ totalRows: 4, mappedRows: 3, skipped: [{ row: 3, reason: "Empty highlight text." }], unmappedColumns: ["Extra"] });
    expect(report.tags).toEqual(["export", "pricing", "search", "trust", "workflow"]);
  });

  it("splits very large imported sources into parts that fit a Firestore document", () => {
    const long = "x".repeat(15_000);
    const rows = Array.from({ length: 40 }, () => ({ Highlight: long, Note: "Big call" }));
    const { sources, highlights } = mapDovetailRows(rows);
    expect(sources.map((s) => s.title)).toEqual(["Big call", "Big call (part 2)", "Big call (part 3)"]);
    expect(sources.every((s) => s.segments.reduce((n, seg) => n + seg.text.length, 0) <= 250_000)).toBe(true);
    expect(new Set(highlights.map((h) => h.sourceKey)).size).toBe(3);
    expect(highlights.filter((h) => h.sourceKey === "big call#2")[0].segmentId).toBe("seg-1");
  });

  it("reports every row when no text column exists", () => {
    const result = mapDovetailRows([{ Foo: "bar" }]);
    expect(result.report.mappedRows).toBe(0);
    expect(result.report.skipped[0].reason).toMatch(/No highlight text column/);
  });

  it("normalizes JSON exports and tags", () => {
    const rows = rowsFromDovetailJson({ highlights: [{ text: "Hi", tags: [{ name: "Onboarding" }, "Churn Risk"], source: { title: "Call" } }] });
    expect(rows).toEqual([{ text: "Hi", tags: "Onboarding, Churn Risk", source: "Call" }]);
    expect(splitTags("A b | c;c")).toEqual(["a-b", "c"]);
    expect(rowsFromDovetailJson("nope")).toEqual([]);
  });
});

describe("roles, tags, retention and action validation", () => {
  it("lets members edit but only owners and admins manage", () => {
    expect(canEdit("viewer")).toBe(false);
    expect(canEdit("member")).toBe(true);
    expect(canManage("member")).toBe(false);
    expect(canManage("admin")).toBe(true);
  });

  it("counts tag frequency once per highlight", () => {
    expect(tagFrequency([{ tags: ["a", "b", "a"] }, { tags: ["b"] }])).toEqual([{ tag: "b", count: 2 }, { tag: "a", count: 1 }]);
  });

  it("classifies retention dates", () => {
    expect(retentionState({ retentionUntil: "" })).toBe("none");
    expect(retentionState({ retentionUntil: "2026-01-01" }, "2026-10-26")).toBe("expired");
    expect(retentionState({ retentionUntil: "2026-11-10" }, "2026-10-26")).toBe("soon");
    expect(retentionState({ retentionUntil: "2027-11-10" }, "2026-10-26")).toBe("ok");
  });

  it("plans retention runs: expired or withdrawn sources are deleted unless under legal hold", () => {
    const base = { projectId: "p", title: "t" };
    const plan = planRetention([
      { ...base, id: "expired", consent: { status: "granted", retentionUntil: "2026-01-01" } },
      { ...base, id: "held", consent: { status: "granted", retentionUntil: "2026-01-01" }, legalHold: { reason: "Litigation", placedBy: "o", placedAt: null } },
      { ...base, id: "withdrawn", consent: { status: "withdrawn", retentionUntil: "" } },
      { ...base, id: "fine", consent: { status: "granted", retentionUntil: "2027-01-01" } },
      { ...base, id: "none", consent: { status: "pending", retentionUntil: "" } },
    ], "2026-10-26");
    expect(plan.toDelete.map((entry) => [entry.source.id, entry.reason])).toEqual([["expired", "retention_expired"], ["withdrawn", "consent_withdrawn"]]);
    expect(plan.held.map((entry) => entry.source.id)).toEqual(["held"]);
  });

  it("requires evidence for insights and normalizes tags", () => {
    expect(actionSchema.safeParse({ type: "insight.create", title: "Something", highlightIds: [] }).success).toBe(false);
    const parsed = actionSchema.parse({ type: "highlight.create", sourceId: "s", segmentId: "seg-1", start: 0, end: 3, tags: ["Churn Risk"] });
    expect(parsed.type === "highlight.create" && parsed.tags).toEqual(["churn-risk"]);
    expect(actionSchema.safeParse({ type: "source.create", title: "x", content: "", participant: { name: "" }, consent: { status: "granted" } }).success).toBe(false);
  });
});
