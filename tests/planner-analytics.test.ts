import { describe, expect, it } from "vitest";

import { planningAnalytics, type AnalyticsTask } from "../src/lib/planner/analytics";

const task = (partial: Partial<AnalyticsTask> & { id: string }): AnalyticsTask => ({
  title: partial.id, durationMinutes: 60, deadline: null, status: "todo", completedAt: null, actualMinutes: null,
  pushCount: 0, recurring: false, occurrences: {}, ...partial,
});

// Thursday 2026-11-12 12:00 UTC → current week starts Monday 2026-11-09.
const NOW = "2026-11-12T12:00:00.000Z";

describe("planning analytics", () => {
  it("buckets planned minutes by the plan version in force", () => {
    const result = planningAnalytics({
      now: NOW, timeZone: "UTC", weeks: 2, tasks: [],
      plans: [
        // v1 made last Monday: two 60-min blocks last week and one this week.
        { version: 1, createdAt: "2026-11-02T08:00:00.000Z", blocks: [
          { start: "2026-11-02T09:00:00.000Z", end: "2026-11-02T10:00:00.000Z" },
          { start: "2026-11-03T09:00:00.000Z", end: "2026-11-03T10:00:00.000Z" },
          { start: "2026-11-10T09:00:00.000Z", end: "2026-11-10T10:00:00.000Z" },
        ] },
        // v2 replaced it on Wednesday 2026-11-04 at 00:00: its block on Tuesday 03 is ignored (not in force).
        { version: 2, createdAt: "2026-11-04T00:00:00.000Z", blocks: [
          { start: "2026-11-03T13:00:00.000Z", end: "2026-11-03T14:00:00.000Z" },
          { start: "2026-11-05T09:00:00.000Z", end: "2026-11-05T09:30:00.000Z" },
          { start: "2026-11-11T09:00:00.000Z", end: "2026-11-11T11:00:00.000Z" },
        ] },
      ],
    });
    expect(result.weeks.map((week) => week.weekStart)).toEqual(["2026-11-02", "2026-11-09"]);
    expect(result.weeks[0]).toMatchObject({ plannedMinutes: 150, planVersions: [1, 2] });
    expect(result.weeks[1]).toMatchObject({ plannedMinutes: 120, planVersions: [2] });
  });

  it("counts completed minutes at actual time when recorded, including occurrences", () => {
    const result = planningAnalytics({
      now: NOW, timeZone: "UTC", weeks: 2, plans: [],
      tasks: [
        task({ id: "a", status: "done", completedAt: "2026-11-03T10:00:00.000Z", actualMinutes: 90 }),
        task({ id: "b", status: "done", completedAt: "2026-11-10T10:00:00.000Z", durationMinutes: 30 }),
        task({ id: "s", recurring: true, durationMinutes: 15, occurrences: { "2026-11-10": { completedAt: "2026-11-10T09:15:00.000Z", actualMinutes: 10 } } }),
        task({ id: "old", status: "done", completedAt: "2026-09-01T10:00:00.000Z" }),
      ],
    });
    expect(result.weeks.map((week) => [week.completedMinutes, week.completions])).toEqual([[90, 1], [40, 2]]);
  });

  it("computes the deadline hit rate from real completions and overdue work", () => {
    const result = planningAnalytics({
      now: NOW, timeZone: "UTC", plans: [],
      tasks: [
        task({ id: "on-time", deadline: "2026-11-05T17:00:00.000Z", status: "done", completedAt: "2026-11-05T12:00:00.000Z" }),
        task({ id: "late", deadline: "2026-11-05T17:00:00.000Z", status: "done", completedAt: "2026-11-06T12:00:00.000Z" }),
        task({ id: "overdue", deadline: "2026-11-10T17:00:00.000Z" }),
        task({ id: "future", deadline: "2026-11-20T17:00:00.000Z" }),
        task({ id: "no-deadline", status: "done", completedAt: "2026-11-05T12:00:00.000Z" }),
      ],
    });
    expect(result.deadlines).toMatchObject({ hit: 1, missed: 2, upcoming: 1, rate: 0.333 });
    expect(result.deadlines.missedTasks.map((entry) => entry.id)).toEqual(["overdue", "late"]);
  });

  it("ranks the most pushed tasks and measures estimate accuracy", () => {
    const result = planningAnalytics({
      now: NOW, timeZone: "UTC", plans: [],
      tasks: [
        task({ id: "p1", pushCount: 3 }),
        task({ id: "p2", pushCount: 1 }),
        task({ id: "p0" }),
        task({ id: "x", status: "done", completedAt: "2026-11-10T10:00:00.000Z", durationMinutes: 60, actualMinutes: 60 }),
        task({ id: "y", status: "done", completedAt: "2026-11-10T10:00:00.000Z", durationMinutes: 60, actualMinutes: 120 }),
        task({ id: "z", status: "done", completedAt: "2026-11-10T10:00:00.000Z", durationMinutes: 60, actualMinutes: 50 }),
      ],
    });
    expect(result.pushed.map((entry) => [entry.id, entry.pushCount])).toEqual([["p1", 3], ["p2", 1]]);
    expect(result.estimates).toMatchObject({ samples: 3, medianRatio: 1, withinQuarter: 0.667, estimateMinutes: 180, actualMinutes: 230 });
    expect(result.estimates.biggestMisses.map((entry) => [entry.id, entry.ratio])).toEqual([["y", 2], ["z", 0.83]]);
  });

  it("reports honest empty states", () => {
    const result = planningAnalytics({ now: NOW, timeZone: "Europe/Istanbul", tasks: [], plans: [] });
    expect(result.weeks).toHaveLength(8);
    expect(result.deadlines.rate).toBeNull();
    expect(result.estimates.medianRatio).toBeNull();
    expect(result.pushed).toEqual([]);
  });
});
