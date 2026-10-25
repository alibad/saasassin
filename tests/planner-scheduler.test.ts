import { describe, expect, it } from "vitest";

import {
  diffSchedules,
  schedule,
  type ScheduleInput,
  type SchedulerTask,
} from "../src/lib/planner/scheduler";
import { localParts, offsetMinutes, zonedToUtc } from "../src/lib/planner/time";

// Monday 2026-11-02, 09:00 UTC. Working hours 09:00–17:00 UTC, Mon–Fri.
const NOW = "2026-11-02T09:00:00.000Z";

function task(partial: Partial<SchedulerTask> & { id: string }): SchedulerTask {
  return {
    title: partial.id,
    durationMinutes: 60,
    priority: "medium",
    status: "todo",
    dependsOn: [],
    ...partial,
  };
}

function input(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    now: NOW,
    horizonDays: 7,
    workingHours: { timeZone: "UTC", days: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 17 * 60 },
    tasks: [],
    busy: [],
    ...overrides,
  };
}

const outcome = (result: ReturnType<typeof schedule>, id: string) => result.outcomes.find((entry) => entry.taskId === id)!;
const blocksFor = (result: ReturnType<typeof schedule>, id: string) => result.blocks.filter((block) => block.taskId === id);

describe("planner scheduler — deadlines", () => {
  it("places a task in the first free working time and meets its deadline", () => {
    const result = schedule(input({ tasks: [task({ id: "a", durationMinutes: 90, deadline: "2026-11-02T17:00:00.000Z" })] }));
    expect(blocksFor(result, "a")).toEqual([
      expect.objectContaining({ start: "2026-11-02T09:00:00.000Z", end: "2026-11-02T10:30:00.000Z", minutes: 90 }),
    ]);
    expect(outcome(result, "a").status).toBe("on_track");
    expect(outcome(result, "a").explanation).toContain("before its deadline");
  });

  it("orders by effective due date so the earlier deadline goes first", () => {
    const result = schedule(
      input({
        tasks: [
          task({ id: "later", durationMinutes: 120, deadline: "2026-11-04T17:00:00.000Z", priority: "high" }),
          task({ id: "sooner", durationMinutes: 120, deadline: "2026-11-02T12:00:00.000Z", priority: "low" }),
        ],
      }),
    );
    expect(blocksFor(result, "sooner")[0].start).toBe("2026-11-02T09:00:00.000Z");
    expect(blocksFor(result, "later")[0].start).toBe("2026-11-02T11:00:00.000Z");
    expect(outcome(result, "sooner").order).toBe(1);
  });

  it("uses priority to break ties between equal deadlines", () => {
    const deadline = "2026-11-03T17:00:00.000Z";
    const result = schedule(
      input({ tasks: [task({ id: "low", deadline, priority: "low" }), task({ id: "urgent", deadline, priority: "urgent" })] }),
    );
    expect(outcome(result, "urgent").order).toBe(1);
    expect(outcome(result, "low").order).toBe(2);
  });

  it("flags a task that cannot meet its deadline and explains why", () => {
    const result = schedule(
      input({
        tasks: [task({ id: "big", title: "Board deck", durationMinutes: 300, deadline: "2026-11-02T12:00:00.000Z" })],
      }),
    );
    const big = outcome(result, "big");
    expect(big.status).toBe("late");
    expect(big.explanation).toMatch(/Cannot meet the deadline/);
    expect(big.explanation).toContain("needs 300 min");
    expect(big.explanation).toContain("180 working min");
    expect(result.stats.lateTasks).toBe(1);
    expect(blocksFor(result, "big").at(-1)!.reasons.join(" ")).toContain("flagged late");
  });

  it("marks work that does not fit in the horizon as unscheduled, with no partial blocks", () => {
    const result = schedule(input({ horizonDays: 1, tasks: [task({ id: "huge", durationMinutes: 600 })] }));
    expect(outcome(result, "huge").status).toBe("unscheduled");
    expect(outcome(result, "huge").explanation).toContain("only 480 usable working min");
    expect(blocksFor(result, "huge")).toHaveLength(0);
  });
});

describe("planner scheduler — working hours and busy blocks", () => {
  it("never places work outside working hours or on non-working days", () => {
    const result = schedule(
      input({
        now: "2026-11-06T15:00:00.000Z", // Friday 15:00
        tasks: [task({ id: "a", durationMinutes: 240 })],
      }),
    );
    const blocks = blocksFor(result, "a");
    expect(blocks[0]).toMatchObject({ start: "2026-11-06T15:00:00.000Z", end: "2026-11-06T17:00:00.000Z" });
    // Saturday/Sunday skipped; resumes Monday 09:00.
    expect(blocks[1]).toMatchObject({ start: "2026-11-09T09:00:00.000Z", end: "2026-11-09T11:00:00.000Z" });
    for (const block of result.blocks) {
      const start = new Date(block.start);
      const end = new Date(block.end);
      expect([1, 2, 3, 4, 5]).toContain(start.getUTCDay());
      expect(start.getUTCHours()).toBeGreaterThanOrEqual(9);
      expect(end.getUTCHours() * 60 + end.getUTCMinutes()).toBeLessThanOrEqual(17 * 60);
    }
  });

  it("rounds a mid-slot now up to the next quarter hour", () => {
    const result = schedule(input({ now: "2026-11-02T09:07:00.000Z", tasks: [task({ id: "a" })] }));
    expect(blocksFor(result, "a")[0].start).toBe("2026-11-02T09:15:00.000Z");
  });

  it("schedules around fixed meetings (busy blocks)", () => {
    const result = schedule(
      input({
        tasks: [task({ id: "a", durationMinutes: 120 })],
        busy: [{ id: "m1", title: "Standup", start: "2026-11-02T09:30:00.000Z", end: "2026-11-02T10:00:00.000Z" }],
      }),
    );
    const blocks = blocksFor(result, "a");
    // 09:00–09:30 is a 30-minute slot (= min chunk), then 10:00–11:30.
    expect(blocks.map((block) => [block.start, block.end])).toEqual([
      ["2026-11-02T09:00:00.000Z", "2026-11-02T09:30:00.000Z"],
      ["2026-11-02T10:00:00.000Z", "2026-11-02T11:30:00.000Z"],
    ]);
    for (const block of result.blocks) {
      expect(block.end <= "2026-11-02T09:30:00.000Z" || block.start >= "2026-11-02T10:00:00.000Z").toBe(true);
    }
  });

  it("skips gaps shorter than the minimum chunk instead of creating slivers", () => {
    const result = schedule(
      input({
        tasks: [task({ id: "a", durationMinutes: 60 })],
        busy: [{ id: "m1", title: "Call", start: "2026-11-02T09:15:00.000Z", end: "2026-11-02T10:00:00.000Z" }],
      }),
    );
    expect(blocksFor(result, "a")[0].start).toBe("2026-11-02T10:00:00.000Z");
  });

  it("respects an earliest start", () => {
    const result = schedule(input({ tasks: [task({ id: "a", earliestStart: "2026-11-03T13:00:00.000Z" })] }));
    expect(blocksFor(result, "a")[0].start).toBe("2026-11-03T13:00:00.000Z");
    expect(blocksFor(result, "a")[0].reasons.join(" ")).toContain("earliest start");
  });

  it("handles a DST transition in the workspace time zone", () => {
    // US DST starts Sunday 2026-03-08. 09:00 New York is 14:00Z on Friday and 13:00Z on Monday.
    const result = schedule(
      input({
        now: "2026-03-06T20:00:00.000Z", // Fri 15:00 EST
        workingHours: { timeZone: "America/New_York", days: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 17 * 60 },
        tasks: [task({ id: "a", durationMinutes: 180 })],
      }),
    );
    expect(blocksFor(result, "a").map((block) => [block.start, block.end])).toEqual([
      ["2026-03-06T20:00:00.000Z", "2026-03-06T22:00:00.000Z"],
      ["2026-03-09T13:00:00.000Z", "2026-03-09T14:00:00.000Z"],
    ]);
  });
});

describe("planner scheduler — chunking", () => {
  it("splits long tasks into focus blocks no longer than the max chunk", () => {
    const result = schedule(input({ maxChunkMinutes: 90, tasks: [task({ id: "a", durationMinutes: 300 })] }));
    const blocks = blocksFor(result, "a");
    expect(blocks.map((block) => block.minutes)).toEqual([90, 90, 90, 30]);
    expect(blocks.every((block) => block.chunkCount === 4)).toBe(true);
    expect(blocks[1].reasons.join(" ")).toContain("Chunk 2 of 4");
    expect(blocks.reduce((sum, block) => sum + block.minutes, 0)).toBe(300);
  });
});

describe("planner scheduler — dependencies", () => {
  it("never starts a task before its prerequisites finish", () => {
    const result = schedule(
      input({
        tasks: [
          task({ id: "ship", durationMinutes: 60, priority: "urgent", dependsOn: ["build"] }),
          task({ id: "build", durationMinutes: 120, priority: "low", dependsOn: ["design"] }),
          task({ id: "design", durationMinutes: 60, priority: "low" }),
        ],
      }),
    );
    const end = (id: string) => blocksFor(result, id).at(-1)!.end;
    const start = (id: string) => blocksFor(result, id)[0].start;
    expect(start("build") >= end("design")).toBe(true);
    expect(start("ship") >= end("build")).toBe(true);
    expect(blocksFor(result, "ship")[0].reasons.join(" ")).toContain('prerequisite "build" finishes');
  });

  it("pulls prerequisites forward to meet a dependent's deadline", () => {
    const result = schedule(
      input({
        tasks: [
          task({ id: "other", durationMinutes: 120, priority: "urgent" }),
          task({ id: "prep", durationMinutes: 60, priority: "low" }),
          task({ id: "launch", durationMinutes: 60, priority: "low", dependsOn: ["prep"], deadline: "2026-11-02T11:00:00.000Z" }),
        ],
      }),
    );
    expect(outcome(result, "prep").order).toBe(1);
    expect(outcome(result, "launch").status).toBe("on_track");
  });

  it("treats completed prerequisites as satisfied and skips done tasks", () => {
    const result = schedule(
      input({ tasks: [task({ id: "done", status: "done" }), task({ id: "next", dependsOn: ["done"] })] }),
    );
    expect(blocksFor(result, "done")).toHaveLength(0);
    expect(outcome(result, "done").status).toBe("done");
    expect(blocksFor(result, "next")[0].start).toBe(NOW);
  });

  it("flags dependency cycles and blocks dependents of unschedulable work", () => {
    const result = schedule(
      input({
        horizonDays: 1,
        tasks: [
          task({ id: "x", dependsOn: ["y"] }),
          task({ id: "y", dependsOn: ["x"] }),
          task({ id: "huge", durationMinutes: 900 }),
          task({ id: "after", dependsOn: ["huge"] }),
        ],
      }),
    );
    expect(outcome(result, "x").status).toBe("blocked");
    expect(outcome(result, "y").explanation).toContain("dependency cycle");
    expect(outcome(result, "huge").status).toBe("unscheduled");
    expect(outcome(result, "after").status).toBe("blocked");
    expect(outcome(result, "after").explanation).toContain('"huge"');
  });

  it("warns about and ignores dependencies on deleted tasks", () => {
    const result = schedule(input({ tasks: [task({ id: "a", dependsOn: ["ghost"] })] }));
    expect(outcome(result, "a").status).toBe("on_track");
    expect(result.warnings[0]).toContain("no longer exists");
  });
});

describe("planner scheduler — team capacity", () => {
  it("keeps each person's work in their own lane and honours daily capacity", () => {
    const result = schedule(
      input({
        members: [
          { id: "ana", name: "Ana", capacityMinutesPerDay: 120 },
          { id: "bo", name: "Bo" },
        ],
        busy: [{ id: "m", title: "Ana's 1:1", start: "2026-11-02T09:00:00.000Z", end: "2026-11-02T10:00:00.000Z", memberId: "ana" }],
        tasks: [
          task({ id: "ana-task", durationMinutes: 180, assigneeId: "ana" }),
          task({ id: "bo-task", durationMinutes: 60, assigneeId: "bo" }),
        ],
      }),
    );
    // Bo is not affected by Ana's meeting.
    expect(blocksFor(result, "bo-task")[0].start).toBe(NOW);
    const ana = blocksFor(result, "ana-task");
    expect(ana[0].start).toBe("2026-11-02T10:00:00.000Z");
    expect(ana.filter((block) => block.start.startsWith("2026-11-02")).reduce((sum, block) => sum + block.minutes, 0)).toBe(120);
    expect(ana.at(-1)!.start.startsWith("2026-11-03")).toBe(true);
    expect(ana[0].reasons.join(" ")).toContain("Assigned to Ana, capped at 120 min/day");
  });
});

describe("planner scheduler — determinism and diffs", () => {
  const tasks = [
    task({ id: "a", durationMinutes: 200, deadline: "2026-11-04T17:00:00.000Z" }),
    task({ id: "b", durationMinutes: 45, priority: "urgent" }),
    task({ id: "c", durationMinutes: 90, dependsOn: ["b"] }),
  ];

  it("produces identical output for identical input regardless of task order", () => {
    const first = schedule(input({ tasks }));
    const second = schedule(input({ tasks: [...tasks].reverse() }));
    expect(second.blocks).toEqual(first.blocks);
    expect(second.outcomes).toEqual(first.outcomes);
    expect(schedule(input({ tasks })).inputHash).toBe(first.inputHash);
  });

  it("explains every block", () => {
    const result = schedule(input({ tasks }));
    expect(result.blocks.length).toBeGreaterThan(0);
    for (const block of result.blocks) expect(block.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("reports moved and newly at-risk tasks for a what-if preview", () => {
    const before = schedule(input({ tasks }));
    const after = schedule(
      input({
        tasks,
        busy: [{ id: "m", title: "Offsite", start: "2026-11-02T09:00:00.000Z", end: "2026-11-04T17:00:00.000Z" }],
      }),
    );
    const diff = diffSchedules(before, after);
    expect(diff.moved).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(diff.newlyAtRisk).toContain("a");
  });
});

describe("planner time helpers", () => {
  it("converts wall-clock time across DST", () => {
    expect(new Date(zonedToUtc(2026, 3, 6, 9 * 60, "America/New_York")).toISOString()).toBe("2026-03-06T14:00:00.000Z");
    expect(new Date(zonedToUtc(2026, 3, 9, 9 * 60, "America/New_York")).toISOString()).toBe("2026-03-09T13:00:00.000Z");
    expect(offsetMinutes(Date.parse("2026-07-01T00:00:00Z"), "Asia/Kolkata")).toBe(330);
    expect(localParts(Date.parse("2026-11-02T23:30:00Z"), "Asia/Tokyo")).toMatchObject({ day: 3, hour: 8, minute: 30, weekday: 2 });
  });
});
