import { describe, expect, it } from "vitest";

import { parseDuration, parseQuickCapture } from "../src/lib/planner/capture";

const options = { timeZone: "America/New_York", endMinute: 17 * 60 };

describe("planner quick capture", () => {
  it("parses durations", () => {
    expect(parseDuration("45m")).toBe(45);
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("1h30m")).toBe(90);
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("1m")).toBeNull();
  });

  it("parses one task per line with inline tokens in the workspace time zone", () => {
    const result = parseQuickCapture(
      ["- Write launch brief ~2h !high @2026-11-03 15:00", "Review pricing copy ~45m !1", "[ ] Expense report @2026-11-06", "", "Plain task"].join("\n"),
      options,
    );
    expect(result.errors).toEqual([]);
    expect(result.tasks).toEqual([
      { line: 1, title: "Write launch brief", durationMinutes: 120, priority: "high", deadline: "2026-11-03T20:00:00.000Z" },
      { line: 2, title: "Review pricing copy", durationMinutes: 45, priority: "urgent", deadline: null },
      { line: 3, title: "Expense report", durationMinutes: 30, priority: "medium", deadline: "2026-11-06T22:00:00.000Z" },
      { line: 5, title: "Plain task", durationMinutes: 30, priority: "medium", deadline: null },
    ]);
  });

  it("reports bad tokens and empty titles by line", () => {
    const result = parseQuickCapture("Task ~forever !someday\n~1h !high\nBad date @2026-02-30", options);
    expect(result.errors).toEqual([
      'Line 1: "~forever" is not a duration (try ~45m or ~1h30m).',
      'Line 1: "!someday" is not a priority (urgent, high, medium, low).',
      "Line 2: add a title.",
      'Line 3: "@2026-02-30" is not a valid date.',
    ]);
    expect(result.tasks.map((task) => task.title)).toEqual(["Task", "Bad date"]);
  });
});
