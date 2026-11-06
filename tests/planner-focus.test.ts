import { describe, expect, it } from "vitest";

import { schedule, type ScheduleInput, type SchedulerTask } from "../src/lib/planner/scheduler";

// Monday 2026-11-02 09:00 UTC; working hours 09:00–17:00 UTC Mon–Fri.
const base: ScheduleInput = {
  now: "2026-11-02T09:00:00.000Z",
  horizonDays: 7,
  workingHours: { timeZone: "UTC", days: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 17 * 60 },
  tasks: [],
  busy: [],
};
const task = (partial: Partial<SchedulerTask> & { id: string }): SchedulerTask => ({
  title: partial.id, durationMinutes: 60, priority: "medium", status: "todo", ...partial,
});
const FOCUS = { deep: { startMinute: 13 * 60, endMinute: 16 * 60 }, shallow: { startMinute: 9 * 60, endMinute: 10 * 60 } };

describe("scheduler — focus windows (soft preference)", () => {
  it("puts deep work in deep-work hours and shallow work in shallow hours, with an explanation", () => {
    const result = schedule({
      ...base,
      focus: FOCUS,
      tasks: [task({ id: "write", type: "deep", durationMinutes: 120 }), task({ id: "email", type: "shallow", durationMinutes: 30 })],
    });
    const write = result.blocks.find((block) => block.taskId === "write")!;
    const email = result.blocks.find((block) => block.taskId === "email")!;
    expect(write).toMatchObject({ start: "2026-11-02T13:00:00.000Z", end: "2026-11-02T15:00:00.000Z" });
    expect(email.start).toBe("2026-11-02T09:00:00.000Z");
    expect(write.reasons.some((reason) => reason.includes("Deep work placed in the workspace's preferred deep-work hours (13:00–16:00)"))).toBe(true);
    expect(email.reasons.some((reason) => reason.includes("shallow-work hours (09:00–10:00)"))).toBe(true);
  });

  it("without windows the plan is unchanged (earliest free time)", () => {
    const result = schedule({ ...base, tasks: [task({ id: "write", type: "deep", durationMinutes: 120 })] });
    expect(result.blocks[0].start).toBe("2026-11-02T09:00:00.000Z");
    expect(result.blocks[0].reasons.join(" ")).not.toContain("preferred");
  });

  it("never lets the preference make work late: falls back to the earliest time and says why", () => {
    const result = schedule({
      ...base,
      focus: FOCUS,
      tasks: [task({ id: "urgent", type: "deep", durationMinutes: 60, deadline: "2026-11-02T12:00:00.000Z" })],
    });
    const block = result.blocks[0];
    expect(block.start).toBe("2026-11-02T09:00:00.000Z");
    expect(result.outcomes[0].status).toBe("on_track");
    expect(block.reasons.some((reason) => reason.includes("had no room before it is due"))).toBe(true);
  });

  it("uses a person's own windows over the workspace default", () => {
    const result = schedule({
      ...base,
      focus: FOCUS,
      members: [{ id: "ana", name: "Ana", focus: { deep: { startMinute: 10 * 60, endMinute: 12 * 60 }, shallow: null } }],
      tasks: [task({ id: "ana-deep", type: "deep", assigneeId: "ana" }), task({ id: "shared-deep", type: "deep" })],
    });
    expect(result.blocks.find((block) => block.taskId === "ana-deep")!.start).toBe("2026-11-02T10:00:00.000Z");
    expect(result.blocks.find((block) => block.taskId === "ana-deep")!.reasons.join(" ")).toContain("Ana's preferred deep-work hours (10:00–12:00)");
    expect(result.blocks.find((block) => block.taskId === "shared-deep")!.start).toBe("2026-11-02T13:00:00.000Z");
  });

  it("spills into the next day's window when today's is full, if still on time", () => {
    const result = schedule({
      ...base,
      focus: FOCUS,
      busy: [{ id: "m", title: "Workshop", start: "2026-11-02T13:00:00.000Z", end: "2026-11-02T16:00:00.000Z" }],
      tasks: [task({ id: "deep", type: "deep", priority: "low" })],
    });
    expect(result.blocks[0].start).toBe("2026-11-03T13:00:00.000Z");
  });

  it("treats tasks without a type as deep work and stays deterministic", () => {
    const input: ScheduleInput = { ...base, focus: FOCUS, tasks: [task({ id: "a" }), task({ id: "b", type: "shallow" })] };
    const result = schedule(input);
    expect(result.blocks.find((block) => block.taskId === "a")!.start).toBe("2026-11-02T13:00:00.000Z");
    expect(schedule(input)).toEqual(result);
  });
});
