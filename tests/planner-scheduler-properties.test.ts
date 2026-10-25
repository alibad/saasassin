import { describe, expect, it } from "vitest";

import { PRIORITIES, schedule, type BusyBlock, type ScheduleInput, type SchedulerTask } from "../src/lib/planner/scheduler";
import { localParts } from "../src/lib/planner/time";

/** Seeded PRNG (mulberry32) so every run checks the same 200 generated workspaces. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZONES = ["UTC", "America/New_York", "Europe/Istanbul", "Asia/Kolkata", "Australia/Sydney"];
const MIN = 60_000;

function generate(seed: number): ScheduleInput {
  const random = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
  const now = Date.parse("2026-03-02T00:00:00Z") + int(0, 60 * 24 * 20) * MIN;
  const members = random() < 0.5 ? [{ id: "m1", name: "One", capacityMinutesPerDay: random() < 0.5 ? int(60, 300) : null }, { id: "m2", name: "Two" }] : [];
  const tasks: SchedulerTask[] = Array.from({ length: int(1, 12) }, (_, index) => ({
    id: `t${index}`,
    title: `Task ${index}`,
    durationMinutes: int(1, 40) * 15,
    priority: PRIORITIES[int(0, 3)],
    status: random() < 0.1 ? "done" : "todo",
    deadline: random() < 0.6 ? new Date(now + int(1, 60 * 24 * 10) * MIN).toISOString() : null,
    earliestStart: random() < 0.2 ? new Date(now + int(0, 60 * 24 * 3) * MIN).toISOString() : null,
    dependsOn: index > 0 && random() < 0.4 ? [`t${int(0, index - 1)}`] : [],
    assigneeId: members.length && random() < 0.6 ? members[int(0, 1)].id : null,
  }));
  const busy: BusyBlock[] = Array.from({ length: int(0, 8) }, (_, index) => {
    const start = now + int(0, 60 * 24 * 7) * MIN;
    return { id: `b${index}`, title: `Busy ${index}`, start: new Date(start).toISOString(), end: new Date(start + int(15, 180) * MIN).toISOString(), memberId: members.length && random() < 0.3 ? "m1" : null };
  });
  const startMinute = int(6, 10) * 60;
  return {
    now: new Date(now).toISOString(),
    horizonDays: int(3, 14),
    workingHours: { timeZone: ZONES[int(0, ZONES.length - 1)], days: [1, 2, 3, 4, 5].filter(() => random() < 0.9), startMinute, endMinute: startMinute + int(4, 10) * 60 },
    tasks,
    busy,
    members,
    minChunkMinutes: 30,
    maxChunkMinutes: int(2, 6) * 30,
  };
}

describe("planner scheduler — invariants over 200 generated workspaces", () => {
  it("never double-books, never leaves working hours, never overlaps busy time, and respects dependencies", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const input = generate(seed);
      const result = schedule(input);
      const tz = input.workingHours.timeZone;
      const nowMs = Date.parse(input.now);

      // Deterministic.
      expect(schedule(input).blocks, `seed ${seed}`).toEqual(result.blocks);

      const byLane = new Map<string, Array<{ start: number; end: number }>>();
      for (const block of result.blocks) {
        const start = Date.parse(block.start);
        const end = Date.parse(block.end);
        expect(end, `seed ${seed}`).toBeGreaterThan(start);
        expect(start, `seed ${seed}: not before now`).toBeGreaterThanOrEqual(nowMs);
        expect(block.reasons.length, `seed ${seed}: explained`).toBeGreaterThan(0);

        // Inside working hours on a working day (local time).
        const s = localParts(start, tz);
        const e = localParts(end - 1, tz);
        expect(input.workingHours.days, `seed ${seed}`).toContain(s.weekday);
        expect(s.hour * 60 + s.minute, `seed ${seed}`).toBeGreaterThanOrEqual(input.workingHours.startMinute);
        expect(e.hour * 60 + e.minute, `seed ${seed}`).toBeLessThan(input.workingHours.endMinute);

        // Never overlaps busy time that applies to this lane.
        for (const busy of input.busy) {
          if (busy.memberId && busy.memberId !== block.lane) continue;
          const overlaps = start < Date.parse(busy.end) && end > Date.parse(busy.start);
          expect(overlaps, `seed ${seed}: ${block.id} overlaps ${busy.id}`).toBe(false);
        }
        byLane.set(block.lane, [...(byLane.get(block.lane) ?? []), { start, end }]);
      }

      // No double-booking within a lane.
      for (const blocks of byLane.values()) {
        blocks.sort((a, b) => a.start - b.start);
        for (let index = 1; index < blocks.length; index += 1) {
          expect(blocks[index].start, `seed ${seed}: overlap`).toBeGreaterThanOrEqual(blocks[index - 1].end);
        }
      }

      for (const task of input.tasks) {
        const outcome = result.outcomes.find((entry) => entry.taskId === task.id)!;
        const blocks = result.blocks.filter((block) => block.taskId === task.id);
        if (outcome.status === "on_track" || outcome.status === "late") {
          // Fully scheduled, exactly once.
          expect(blocks.reduce((sum, block) => sum + block.minutes, 0), `seed ${seed}`).toBe(task.durationMinutes);
          // Late iff it finishes after the deadline.
          const finish = Date.parse(outcome.finish!);
          expect(outcome.status === "late", `seed ${seed}`).toBe(task.deadline ? finish > Date.parse(task.deadline) : false);
          // Earliest start respected.
          if (task.earliestStart) expect(Date.parse(blocks[0].start), `seed ${seed}`).toBeGreaterThanOrEqual(Date.parse(task.earliestStart));
          // Dependencies finish first.
          for (const dep of task.dependsOn ?? []) {
            const depBlocks = result.blocks.filter((block) => block.taskId === dep);
            if (depBlocks.length) expect(Date.parse(blocks[0].start), `seed ${seed}`).toBeGreaterThanOrEqual(Date.parse(depBlocks.at(-1)!.end));
          }
        } else {
          expect(blocks, `seed ${seed}: no partial blocks`).toHaveLength(0);
          expect(outcome.explanation.length, `seed ${seed}`).toBeGreaterThan(10);
        }
      }
    }
  });
});
