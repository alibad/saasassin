import { describe, expect, it } from "vitest";

import { describeRecurrence, expandRecurrence, isOccurrence, parseOccurrenceId, type Recurrence } from "../src/lib/planner/recurrence";
import { schedule, type ScheduleInput } from "../src/lib/planner/scheduler";

const rule = (partial: Partial<Recurrence>): Recurrence => ({ freq: "daily", interval: 1, startDate: "2026-11-02", ...partial });

describe("recurrence expansion", () => {
  it("expands daily with an interval from the series start", () => {
    expect(expandRecurrence(rule({ interval: 2 }), "2026-11-02", "2026-11-09")).toEqual(["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-08"]);
    // Starting the window mid-series keeps the same cadence.
    expect(expandRecurrence(rule({ interval: 2 }), "2026-11-05", "2026-11-09")).toEqual(["2026-11-06", "2026-11-08"]);
  });

  it("expands weekdays only", () => {
    expect(expandRecurrence(rule({ freq: "weekdays" }), "2026-11-06", "2026-11-10")).toEqual(["2026-11-06", "2026-11-09", "2026-11-10"]);
  });

  it("expands weekly on chosen days every N weeks", () => {
    const weekly = rule({ freq: "weekly", weekdays: [1, 3], interval: 2 });
    expect(expandRecurrence(weekly, "2026-11-01", "2026-11-30")).toEqual(["2026-11-02", "2026-11-04", "2026-11-16", "2026-11-18", "2026-11-30"]);
    // Default weekday is the start date's weekday (Monday).
    expect(expandRecurrence(rule({ freq: "weekly" }), "2026-11-01", "2026-11-17")).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
  });

  it("expands monthly on day N and clamps to short months", () => {
    const monthly = rule({ freq: "monthly", monthDay: 31, startDate: "2026-01-31" });
    expect(expandRecurrence(monthly, "2026-01-01", "2026-05-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(expandRecurrence(rule({ freq: "monthly", interval: 3, startDate: "2026-01-15" }), "2026-01-01", "2026-12-31")).toEqual([
      "2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15",
    ]);
  });

  it("stops at the end date or after the count, counted from the start", () => {
    expect(expandRecurrence(rule({ until: "2026-11-04" }), "2026-11-01", "2026-11-30")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
    const counted = rule({ freq: "weekdays", count: 5 });
    expect(expandRecurrence(counted, "2026-11-01", "2026-11-30")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
    // Past occurrences still count: from Thursday only two remain.
    expect(expandRecurrence(counted, "2026-11-05", "2026-11-30")).toEqual(["2026-11-05", "2026-11-06"]);
    expect(expandRecurrence(rule({}), "2026-10-01", "2026-11-01")).toEqual([]);
  });

  it("recognises occurrences and describes rules", () => {
    const weekly = rule({ freq: "weekly", weekdays: [5] });
    expect(isOccurrence(weekly, "2026-11-06")).toBe(true);
    expect(isOccurrence(weekly, "2026-11-05")).toBe(false);
    expect(isOccurrence(weekly, "2026-02-30")).toBe(false);
    expect(describeRecurrence(rule({ freq: "weekly", weekdays: [3, 1], count: 4 }))).toBe("Every week on Mon, Wed, 4 times from 2026-11-02");
    expect(describeRecurrence(rule({ freq: "monthly", interval: 2, monthDay: 15, until: "2027-01-01" }))).toBe("Every 2 months on day 15, until 2027-01-01 from 2026-11-02");
    expect(parseOccurrenceId("abc@2026-11-02")).toEqual({ seriesId: "abc", date: "2026-11-02" });
    expect(parseOccurrenceId("abc")).toBeNull();
  });
});

describe("scheduler — repeating tasks", () => {
  const base: ScheduleInput = {
    now: "2026-11-02T09:00:00.000Z",
    horizonDays: 7,
    workingHours: { timeZone: "UTC", days: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 17 * 60 },
    tasks: [],
    busy: [],
  };

  it("places one block per occurrence on its own day, due by the end of that day", () => {
    const result = schedule({
      ...base,
      tasks: [{ id: "standup", title: "Standup notes", durationMinutes: 30, priority: "medium", status: "todo", recurrence: rule({ freq: "weekdays" }) }],
    });
    const blocks = result.blocks.filter((block) => block.seriesId === "standup");
    expect(blocks.map((block) => block.occurrenceDate)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
    for (const block of blocks) expect(block.start.slice(0, 10)).toBe(block.occurrenceDate);
    expect(result.outcomes.every((outcome) => outcome.status === "on_track")).toBe(true);
    expect(blocks[0].reasons.some((reason) => reason.includes("Occurrence for 2026-11-02"))).toBe(true);
  });

  it("completing one occurrence leaves the rest of the series scheduled", () => {
    const result = schedule({
      ...base,
      tasks: [{
        id: "review", title: "Inbox zero", durationMinutes: 60, priority: "low", status: "todo",
        recurrence: rule({ freq: "weekly", weekdays: [1, 3] }), completedOccurrences: ["2026-11-02"],
      }],
    });
    expect(result.blocks.map((block) => block.occurrenceDate)).toEqual(["2026-11-04"]);
    const done = result.outcomes.find((outcome) => outcome.taskId === "review@2026-11-02")!;
    expect(done.status).toBe("done");
    expect(done.explanation).toContain("rest of the series");
  });

  it("skips non-working days with a warning and ignores dependencies on a series", () => {
    const result = schedule({
      ...base,
      tasks: [
        { id: "plants", title: "Water plants", durationMinutes: 15, priority: "low", status: "todo", recurrence: rule({ freq: "daily" }) },
        { id: "after", title: "After plants", durationMinutes: 30, priority: "low", status: "todo", dependsOn: ["plants"] },
      ],
    });
    expect(result.blocks.filter((block) => block.seriesId === "plants")).toHaveLength(5);
    expect(result.warnings.some((warning) => warning.includes("2 non-working days"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("dependencies on repeating tasks are ignored"))).toBe(true);
    expect(result.outcomes.find((outcome) => outcome.taskId === "after")!.status).toBe("on_track");
  });

  it("is deterministic and flags an occurrence that cannot fit its day as late", () => {
    const input: ScheduleInput = {
      ...base,
      horizonDays: 2,
      busy: [{ id: "offsite", title: "Offsite", start: "2026-11-02T09:00:00.000Z", end: "2026-11-02T17:00:00.000Z" }],
      tasks: [{ id: "daily", title: "Daily log", durationMinutes: 30, priority: "high", status: "todo", recurrence: rule({}) }],
    };
    const first = schedule(input);
    expect(schedule(input)).toEqual(first);
    const monday = first.outcomes.find((outcome) => outcome.taskId === "daily@2026-11-02")!;
    expect(monday.status).toBe("late");
    expect(first.outcomes.find((outcome) => outcome.taskId === "daily@2026-11-03")!.status).toBe("on_track");
  });
});
