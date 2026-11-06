import { describe, expect, it } from "vitest";

import type { Block, ResponseRecord } from "../src/lib/studies/model";
import {
  assessResponse,
  assessSessions,
  isLowEffortText,
  speederThreshold,
  STRAIGHT_LINE_MIN_SCALES,
} from "../src/lib/studies/quality";

const scale = (id: string): Block => ({ type: "opinion_scale", id, prompt: id, required: true, logic: [], screenOut: [], scale: 5, minLabel: "", maxLabel: "" });
const blocks: Block[] = [
  { type: "welcome", id: "w", title: "Hi", body: "", consentRequired: true, consentText: "ok" },
  scale("s1"),
  scale("s2"),
  scale("s3"),
  { type: "open_text", id: "t1", prompt: "Why?", required: false, logic: [], screenOut: [], maxLength: 500 },
  { type: "open_text", id: "t2", prompt: "Else?", required: false, logic: [], screenOut: [], maxLength: 500 },
];
const fullPath = blocks.map((block) => block.id);

function response(partial: Partial<ResponseRecord> & { id: string }): ResponseRecord {
  return {
    studyId: "s",
    version: 1,
    status: "completed",
    answers: { w: { consented: true }, s1: { value: 2 }, s2: { value: 4 }, s3: { value: 5 }, t1: { text: "The pricing page hid the plans" } },
    path: fullPath,
    blockTimings: {},
    startedAt: null,
    submittedAt: null,
    durationMs: 120_000,
    quality: null,
    source: "participant",
    ...partial,
  };
}

describe("speeder threshold", () => {
  it("prefers the researcher's minimum and otherwise needs five completed sessions", () => {
    const four = [1, 2, 3, 4].map((n) => response({ id: `r${n}`, durationMs: 90_000 }));
    expect(speederThreshold({ minDurationSeconds: 30 }, four)).toMatchObject({ ms: 30_000, source: "setting" });
    expect(speederThreshold({ minDurationSeconds: null }, four)).toBeNull();
    const five = [...four, response({ id: "r5", durationMs: 150_000 })];
    expect(speederThreshold({ minDurationSeconds: null }, five)).toEqual({ ms: 30_000, source: "auto", medianMs: 90_000 });
    // In-progress and screened-out sessions never move the median.
    const noisy = [...five, response({ id: "r6", status: "in_progress", durationMs: null }), response({ id: "r7", status: "screened_out", durationMs: 1 })];
    expect(speederThreshold({ minDurationSeconds: null }, noisy)?.ms).toBe(30_000);
  });
});

describe("quality flags", () => {
  const threshold = { ms: 30_000, source: "setting" as const, medianMs: 90_000 };

  it("flags speeders with the threshold in the reason", () => {
    const [flag] = assessResponse(blocks, response({ id: "fast", durationMs: 12_000 }), threshold);
    expect(flag.code).toBe("speeder");
    expect(flag.reason).toContain("12 s");
    expect(flag.reason).toContain("30 s");
    expect(assessResponse(blocks, response({ id: "ok" }), threshold)).toEqual([]);
    expect(assessResponse(blocks, response({ id: "none", durationMs: 1 }), null)).toEqual([]);
  });

  it(`flags identical ratings on ${STRAIGHT_LINE_MIN_SCALES}+ scales only`, () => {
    const flat = response({ id: "flat", answers: { ...response({ id: "x" }).answers, s1: { value: 3 }, s2: { value: 3 }, s3: { value: 3 } } });
    expect(assessResponse(blocks, flat, null).map((flag) => flag.code)).toEqual(["straight_lining"]);
    // Two scales off the path (skipped by logic) are not straight-lining.
    const short = response({ id: "short", path: ["w", "s1", "t1"], answers: { s1: { value: 3 }, t1: { text: "Clear docs" } } });
    expect(assessResponse(blocks, short, null)).toEqual([]);
  });

  it("flags open text only when every open question on the path is empty or junk", () => {
    expect(assessResponse(blocks, response({ id: "one-good" }), null)).toEqual([]);
    const junk = response({ id: "junk", answers: { ...response({ id: "x" }).answers, t1: { text: "asdf" }, t2: { text: "  " } } });
    expect(assessResponse(blocks, junk, null)[0]).toMatchObject({ code: "empty_open_text", reason: expect.stringContaining("all 2") });
    const offPath = response({ id: "off", path: ["w", "s1", "s2", "s3"], answers: { s1: { value: 1 }, s2: { value: 2 }, s3: { value: 3 } } });
    expect(assessResponse(blocks, offPath, null)).toEqual([]);
    expect(["", "ok", "....", "aaaaaa", "N/A", "idk"].every(isLowEffortText)).toBe(true);
    expect(["Too many steps", "no idea why the button moved", "日本語でOK"].some(isLowEffortText)).toBe(false);
  });

  it("only assesses completed sessions and reports researcher decisions", () => {
    expect(assessResponse(blocks, response({ id: "ip", status: "in_progress", durationMs: 1 }), threshold)).toEqual([]);
    const decided = response({
      id: "d",
      durationMs: 1000,
      quality: { decision: "excluded", reason: "Bot-like", decidedBy: { uid: "u", email: "r@example.com" }, decidedAt: null },
    });
    const { sessions } = assessSessions([{ version: 1, blocks }], { minDurationSeconds: 30 }, [decided, response({ id: "k" })], 1);
    expect(sessions.get("d")).toMatchObject({ excluded: true, decision: "excluded", reason: "Bot-like", decidedBy: "r@example.com" });
    expect(sessions.get("d")?.flags.map((flag) => flag.code)).toEqual(["speeder"]);
    expect(sessions.get("k")).toMatchObject({ excluded: false, decision: null, flags: [] });
  });
});
