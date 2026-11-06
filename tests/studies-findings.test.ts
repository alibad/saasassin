import { describe, expect, it } from "vitest";

import { excludedEvidence, findingInputSchema, resolveEvidence, sortFindings } from "../src/lib/studies/findings";
import type { Block, ResponseRecord, StudyVersion } from "../src/lib/studies/model";

const blocks: Block[] = [
  { type: "welcome", id: "w", title: "Hi", body: "", consentRequired: true, consentText: "ok" },
  { type: "open_text", id: "why", prompt: "What confused you?", required: false, logic: [], screenOut: [], maxLength: 500 },
  { type: "yes_no", id: "again", prompt: "Would you use it again?", required: true, logic: [], screenOut: [] },
];
const versions: StudyVersion[] = [
  { studyId: "s", version: 1, title: "T", blocks, settings: { participantCap: null, closeAt: null, endMessage: "", minDurationSeconds: null }, publishedAt: null },
];
const response = (id: string, answers: ResponseRecord["answers"], quality: ResponseRecord["quality"] = null): ResponseRecord => ({
  id,
  studyId: "s",
  version: 1,
  status: "completed",
  answers,
  path: Object.keys(answers),
  blockTimings: {},
  startedAt: null,
  submittedAt: null,
  durationMs: 1000,
  quality,
  source: "participant",
});
const responses = [response("r1", { w: { consented: true }, why: { text: "The export button is hidden" }, again: { value: "no" } }), response("r2", { w: { consented: true }, again: { value: "yes" } })];

describe("findings", () => {
  it("requires at least one piece of evidence", () => {
    expect(findingInputSchema.safeParse({ title: "Hidden export", evidence: [] }).success).toBe(false);
    expect(findingInputSchema.parse({ title: "Hidden export", evidence: [{ kind: "block", blockId: "again" }] })).toMatchObject({ severity: "medium", status: "open" });
  });

  it("resolves response and block evidence with excerpts and dedupes", () => {
    const result = resolveEvidence(
      [
        { kind: "response", responseId: "r1", blockId: "why", note: "Key quote" },
        { kind: "response", responseId: "r1", blockId: "why", note: "" },
        { kind: "block", blockId: "again", note: "" },
      ],
      versions,
      responses,
    );
    expect(result).toEqual({
      ok: true,
      evidence: [
        { kind: "response", responseId: "r1", blockId: "why", note: "Key quote", version: 1, blockTitle: "What confused you?", excerpt: "The export button is hidden" },
        { kind: "block", blockId: "again", note: "", version: 1, blockTitle: "Would you use it again?", excerpt: "" },
      ],
    });
  });

  it("rejects evidence the study does not contain", () => {
    expect(resolveEvidence([{ kind: "response", responseId: "nope", blockId: "why", note: "" }], versions, responses)).toMatchObject({ ok: false, status: 404 });
    expect(resolveEvidence([{ kind: "response", responseId: "r2", blockId: "why", note: "" }], versions, responses)).toMatchObject({ ok: false, status: 422 });
    expect(resolveEvidence([{ kind: "block", blockId: "ghost", note: "" }], versions, responses)).toMatchObject({ ok: false, status: 404 });
  });

  it("calls out evidence from excluded sessions and sorts by severity", () => {
    const excluded = [response("r1", {}, { decision: "excluded", reason: "bot", decidedBy: { uid: "u", email: "e" }, decidedAt: null }), responses[1]];
    const finding = { evidence: [{ kind: "response" as const, responseId: "r1", blockId: "why", note: "", version: 1, blockTitle: "", excerpt: "" }] };
    expect(excludedEvidence(finding, excluded)).toBe(1);
    expect(excludedEvidence(finding, responses)).toBe(0);
    const sorted = sortFindings([
      { id: "a", severity: "low" as const, updatedAt: "2026-01-02" },
      { id: "b", severity: "critical" as const, updatedAt: "2026-01-01" },
      { id: "c", severity: "low" as const, updatedAt: "2026-01-03" },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });
});
