import { describe, expect, it } from "vitest";

import { mapMazeCsv, parseCsv, parseDuration } from "../src/lib/studies/maze";
import { checkSubmission, validateAnswer } from "../src/lib/studies/model";

const MAZE_CSV = [
  "Tester ID,Email,Device,Started At,Ended At,Duration (s),1. How easy was it to sign up?,2. Which plan would you pick?,3. Find the pricing page - Outcome,3. Find the pricing page - Duration,3. Find the pricing page - Misclicks,4. What would you change?,5. Would you recommend us?,6. Which features do you use?,7. How likely are you to recommend us?",
  't-1,ana@example.com,Desktop,2026-09-01T10:00:00Z,2026-09-01T10:04:00Z,240,4,Pro,Direct success,35,0,"Make the ""Upgrade"" button bigger",Yes,Reports|Exports,9',
  "t-2,bo@example.com,Mobile,2026-09-01T11:00:00Z,2026-09-01T11:02:00Z,120,2,Free,Give up,80,4,,No,Reports,0",
  "t-3,,Desktop,2026-09-01T12:00:00Z,2026-09-01T12:01:00Z,60,5,Pro,Indirect success,50,2,Nothing,Yes,Exports;Alerts,10",
  "t-4,,Tablet,2026-09-01T13:00:00Z,,,,,,,,,,,",
].join("\r\n");

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes, embedded newlines and BOMs", () => {
    expect(parseCsv('﻿a,b\n"x, y","say ""hi""\nthere"\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"\nthere'],
    ]);
  });

  it("reads Maze-style durations", () => {
    expect(parseDuration("83")).toBe(83_000);
    expect(parseDuration("83", "ms")).toBe(83);
    expect(parseDuration("1:23")).toBe(83_000);
    expect(parseDuration("1m 23s")).toBe(83_000);
    expect(parseDuration("2.5 min")).toBe(150_000);
    expect(parseDuration("soon")).toBeNull();
  });
});

describe("Maze results mapper", () => {
  const result = mapMazeCsv(MAZE_CSV);
  if (!result.ok) throw new Error(result.error);
  const { blocks, responses, report } = result.mapping;
  const byTitle = (title: string) => blocks.find((block) => "prompt" in block && block.prompt === title)!;

  it("infers block types from the values", () => {
    expect(blocks.map((block) => block.type)).toEqual(["opinion_scale", "multiple_choice", "multiple_choice", "open_text", "yes_no", "multiple_choice", "multiple_choice"]);
    expect(byTitle("How easy was it to sign up?")).toMatchObject({ type: "opinion_scale", scale: 5 });
    expect(byTitle("Find the pricing page")).toMatchObject({ type: "multiple_choice", options: expect.arrayContaining([expect.objectContaining({ label: "Give up" })]) });
    expect(byTitle("Which features do you use?")).toMatchObject({ allowMultiple: true });
    expect(byTitle("How likely are you to recommend us?")).toMatchObject({ type: "multiple_choice" });
    expect((byTitle("How likely are you to recommend us?") as { options: unknown[] }).options).toHaveLength(11);
  });

  it("reports every column, dropping PII, device data and click paths", () => {
    const mapping = Object.fromEntries(report.columns.map((column) => [column.header, column.mapping]));
    expect(mapping).toMatchObject({
      "Tester ID": "metadata",
      Email: "dropped",
      Device: "dropped",
      "Started At": "metadata",
      "Ended At": "metadata",
      "Duration (s)": "metadata",
      "3. Find the pricing page - Outcome": "block",
      "3. Find the pricing page - Duration": "timing",
      "3. Find the pricing page - Misclicks": "dropped",
    });
    expect(report.columns).toHaveLength(15);
    expect(report.warnings.join(" ")).toMatch(/click paths/);
    expect(JSON.stringify(result.mapping)).not.toContain("ana@example.com");
  });

  it("maps rows to answers that validate against the mapped blocks", () => {
    expect(report).toMatchObject({ rows: 4, imported: 3, skipped: [{ row: 5, reason: "No answers in this row." }] });
    const [first, second] = responses;
    expect(first).toMatchObject({ externalId: "t-1", status: "completed", durationMs: 240_000, startedAt: "2026-09-01T10:00:00.000Z" });
    expect(first.answers[byTitle("What would you change?").id]).toEqual({ text: 'Make the "Upgrade" button bigger' });
    expect(first.answers[byTitle("Which features do you use?").id]).toEqual({ selected: ["opt_reports", "opt_exports"] });
    expect(first.blockTimings[byTitle("Find the pricing page").id]).toBe(35_000);
    expect(second.answers[byTitle("What would you change?").id]).toBeUndefined();
    expect(second.path).not.toContain(byTitle("What would you change?").id);
    for (const response of responses) {
      for (const block of blocks) {
        if (response.answers[block.id]) expect(validateAnswer(block, response.answers[block.id]).ok).toBe(true);
      }
      expect(checkSubmission(blocks, response.answers, true).ok).toBe(true);
    }
  });

  it("refuses files it cannot map", () => {
    expect(mapMazeCsv("Tester ID\nt-1")).toMatchObject({ ok: false, error: expect.stringMatching(/No question/) });
    expect(mapMazeCsv("only a header")).toMatchObject({ ok: false });
    expect(mapMazeCsv(`Q\n${"x\n".repeat(5001)}`)).toMatchObject({ ok: false, error: expect.stringMatching(/5000/) });
  });
});
