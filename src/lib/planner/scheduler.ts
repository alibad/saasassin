/**
 * SaaSassin Planner scheduling engine.
 *
 * Pure and deterministic: the same input always yields the same plan. No clock,
 * no randomness, no I/O. `now` is an explicit input. Every placed block and
 * every task outcome carries a human-readable explanation.
 *
 * Algorithm (list scheduling, earliest-effective-due first):
 *  1. Build free working intervals per lane (person) from working hours in the
 *     workspace time zone, minus busy blocks (meetings) and before `now`.
 *  2. Give every open task an effective due time: the earlier of its hard
 *     deadline and its priority target window, then propagate dependents' due
 *     times back to their prerequisites.
 *  3. Repeatedly pick the ready task (all prerequisites done or placed) with the
 *     earliest effective due time (ties: priority, earliest start, title, id).
 *  4. Place it into the earliest free time after max(now, earliest start,
 *     prerequisites' finish), splitting into chunks between minChunk and
 *     maxChunk minutes, honouring each person's daily capacity.
 *  5. Flag late tasks (finish after deadline) and unschedulable tasks (no room in
 *     the horizon, blocked prerequisite, dependency cycle) with explanations.
 */

import {
  addCalendarDays,
  dayKey,
  formatMinuteOfDay,
  localParts,
  MINUTE,
  zonedToUtc,
} from "./time";

export const PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Soft target for tasks, in working days from now, when no earlier deadline applies. */
export const PRIORITY_TARGET_DAYS: Record<Priority, number> = { urgent: 1, high: 3, medium: 7, low: 14 };
const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export const UNASSIGNED_LANE = "unassigned";

export type WorkingHours = {
  timeZone: string;
  /** Working weekdays, 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Minutes after local midnight. */
  startMinute: number;
  endMinute: number;
};

export type SchedulerTask = {
  id: string;
  title: string;
  durationMinutes: number;
  priority: Priority;
  status: "todo" | "done";
  deadline?: string | null;
  earliestStart?: string | null;
  dependsOn?: string[];
  assigneeId?: string | null;
  projectId?: string | null;
  /** Manual lock: the whole task is pinned to start here. Locks always win. */
  lockedStart?: string | null;
};

export type BusyBlock = {
  id: string;
  title: string;
  start: string;
  end: string;
  /** When set, the block only makes that person busy; otherwise everyone. */
  memberId?: string | null;
};

export type SchedulerMember = {
  id: string;
  name: string;
  /** Maximum task minutes per working day; omitted = the full working window. */
  capacityMinutesPerDay?: number | null;
};

export type ScheduleInput = {
  now: string;
  horizonDays: number;
  workingHours: WorkingHours;
  tasks: SchedulerTask[];
  busy: BusyBlock[];
  members?: SchedulerMember[];
  minChunkMinutes?: number;
  maxChunkMinutes?: number;
};

export type ScheduledBlock = {
  id: string;
  taskId: string;
  title: string;
  lane: string;
  start: string;
  end: string;
  minutes: number;
  chunkIndex: number;
  chunkCount: number;
  reasons: string[];
};

export type TaskOutcomeStatus = "on_track" | "late" | "unscheduled" | "blocked" | "done";

export type TaskOutcome = {
  taskId: string;
  title: string;
  status: TaskOutcomeStatus;
  order: number | null;
  scheduledMinutes: number;
  requiredMinutes: number;
  finish: string | null;
  deadline: string | null;
  effectiveDue: string | null;
  explanation: string;
};

export type ScheduleResult = {
  engineVersion: string;
  inputHash: string;
  horizon: { start: string; end: string };
  blocks: ScheduledBlock[];
  outcomes: TaskOutcome[];
  warnings: string[];
  stats: { scheduledTasks: number; lateTasks: number; unscheduledTasks: number; scheduledMinutes: number; freeMinutes: number };
};

export const ENGINE_VERSION = "planner-scheduler/1.0.0";

type Interval = { start: number; end: number; day: string };
type Lane = { id: string; free: Interval[]; capacity: number | null; used: Map<string, number> };

const DEFAULT_MIN_CHUNK = 30;
const DEFAULT_MAX_CHUNK = 120;
const ROUND_TO = 15 * MINUTE;

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function parseInstant(value: string | null | undefined) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** FNV-1a over canonical JSON — a stable fingerprint of the planning inputs. */
export function hashInput(value: unknown) {
  const text = canonicalJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Working windows (UTC) for each local day in the horizon, starting at `now`. */
export function workingWindows(nowMs: number, horizonDays: number, hours: WorkingHours): Interval[] {
  const today = localParts(nowMs, hours.timeZone);
  const windows: Interval[] = [];
  if (hours.endMinute <= hours.startMinute) return windows;
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = addCalendarDays(today.year, today.month, today.day, offset);
    if (!hours.days.includes(date.weekday)) continue;
    const start = zonedToUtc(date.year, date.month, date.day, hours.startMinute, hours.timeZone);
    const end = zonedToUtc(date.year, date.month, date.day, hours.endMinute, hours.timeZone);
    const clippedStart = Math.max(start, Math.ceil(nowMs / ROUND_TO) * ROUND_TO);
    if (end > clippedStart) windows.push({ start: clippedStart, end, day: dayKey(date.year, date.month, date.day) });
  }
  return windows;
}

function subtract(intervals: Interval[], busyStart: number, busyEnd: number): Interval[] {
  const result: Interval[] = [];
  for (const interval of intervals) {
    if (busyEnd <= interval.start || busyStart >= interval.end) {
      result.push(interval);
      continue;
    }
    if (busyStart > interval.start) result.push({ ...interval, end: busyStart });
    if (busyEnd < interval.end) result.push({ ...interval, start: busyEnd });
  }
  return result;
}

function describeInstant(ms: number, timeZone: string) {
  const p = localParts(ms, timeZone);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][p.weekday];
  return `${weekday} ${dayKey(p.year, p.month, p.day)} ${formatMinuteOfDay(p.hour * 60 + p.minute)}`;
}

/** Earliest instant that is `days` working days after now (end of that working day). */
function targetAfterWorkingDays(windows: Interval[], days: number, fallback: number) {
  const distinctDays = [...new Set(windows.map((window) => window.day))];
  const day = distinctDays[Math.min(days, distinctDays.length) - 1];
  if (!day) return fallback;
  const lastWindow = windows.filter((window) => window.day === day).at(-1);
  return lastWindow ? lastWindow.end : fallback;
}

export function schedule(input: ScheduleInput): ScheduleResult {
  const nowMs = parseInstant(input.now);
  if (nowMs === null) throw new Error("`now` must be an ISO timestamp.");
  const hours = input.workingHours;
  const minChunk = Math.max(5, input.minChunkMinutes ?? DEFAULT_MIN_CHUNK);
  const maxChunk = Math.max(minChunk, input.maxChunkMinutes ?? DEFAULT_MAX_CHUNK);
  const horizonDays = Math.max(1, Math.min(90, Math.floor(input.horizonDays)));
  const tz = hours.timeZone;
  const warnings: string[] = [];

  const windows = workingWindows(nowMs, horizonDays, hours);
  const today = localParts(nowMs, tz);
  const lastDay = addCalendarDays(today.year, today.month, today.day, horizonDays);
  const horizonEnd = zonedToUtc(lastDay.year, lastDay.month, lastDay.day, 0, tz);
  if (windows.length === 0) warnings.push("There is no working time in the planning horizon. Check working days and hours.");

  // Lanes: one per person who has assigned work, plus the shared "unassigned" lane.
  const members = new Map((input.members ?? []).map((member) => [member.id, member]));
  const busy = [...input.busy]
    .map((block) => ({ ...block, startMs: parseInstant(block.start), endMs: parseInstant(block.end) }))
    .filter((block) => {
      const valid = block.startMs !== null && block.endMs !== null && block.endMs > block.startMs;
      if (!valid) warnings.push(`Ignored busy block "${block.title}" because its times are invalid.`);
      return valid;
    })
    .sort((a, b) => a.startMs! - b.startMs! || a.id.localeCompare(b.id));

  const lanes = new Map<string, Lane>();
  function lane(id: string): Lane {
    let existing = lanes.get(id);
    if (!existing) {
      let free = windows.map((window) => ({ ...window }));
      for (const block of busy) {
        if (block.memberId && block.memberId !== id) continue;
        free = subtract(free, block.startMs!, block.endMs!);
      }
      const capacity = id === UNASSIGNED_LANE ? null : members.get(id)?.capacityMinutesPerDay ?? null;
      existing = { id, free, capacity: capacity && capacity > 0 ? capacity : null, used: new Map() };
      lanes.set(id, existing);
    }
    return existing;
  }

  const allTasks = [...input.tasks].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(allTasks.map((task) => [task.id, task]));
  const open = allTasks.filter((task) => task.status !== "done");
  const outcomes = new Map<string, TaskOutcome>();

  for (const task of allTasks) {
    if (task.status === "done") {
      outcomes.set(task.id, {
        taskId: task.id,
        title: task.title,
        status: "done",
        order: null,
        scheduledMinutes: 0,
        requiredMinutes: 0,
        finish: null,
        deadline: task.deadline ?? null,
        effectiveDue: null,
        explanation: "Completed — not scheduled again, and it no longer blocks dependent tasks.",
      });
    }
  }

  // Dependencies: keep only known prerequisites; drop done ones.
  const prerequisites = new Map<string, string[]>();
  for (const task of open) {
    const deps: string[] = [];
    for (const dep of [...new Set(task.dependsOn ?? [])].sort()) {
      if (dep === task.id) continue;
      const target = byId.get(dep);
      if (!target) {
        warnings.push(`"${task.title}" depends on a task that no longer exists; that dependency was ignored.`);
        continue;
      }
      if (target.status !== "done") deps.push(dep);
    }
    prerequisites.set(task.id, deps);
  }

  // Cycle detection (DFS, deterministic order).
  const inCycle = new Set<string>();
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  function visit(id: string) {
    state.set(id, 1);
    stack.push(id);
    for (const dep of prerequisites.get(id) ?? []) {
      if (state.get(dep) === 1) {
        for (const member of stack.slice(stack.indexOf(dep))) inCycle.add(member);
      } else if (!state.has(dep)) {
        visit(dep);
      }
    }
    stack.pop();
    state.set(id, 2);
  }
  for (const task of open) if (!state.has(task.id)) visit(task.id);

  // Effective due: min(deadline, priority target), then propagate from dependents.
  const fallbackDue = horizonEnd;
  const effectiveDue = new Map<string, number>();
  const dueReason = new Map<string, string>();
  for (const task of open) {
    const deadline = parseInstant(task.deadline);
    const target = targetAfterWorkingDays(windows, PRIORITY_TARGET_DAYS[task.priority], fallbackDue);
    if (deadline !== null && deadline <= target) {
      effectiveDue.set(task.id, deadline);
      dueReason.set(task.id, `hard deadline ${describeInstant(deadline, tz)}`);
    } else {
      effectiveDue.set(task.id, target);
      dueReason.set(
        task.id,
        `${task.priority} priority target (within ${PRIORITY_TARGET_DAYS[task.priority]} working day${PRIORITY_TARGET_DAYS[task.priority] === 1 ? "" : "s"})`,
      );
    }
  }
  // Back-propagate: a prerequisite must finish before its dependent can start.
  for (let pass = 0; pass < open.length; pass += 1) {
    let changed = false;
    for (const task of open) {
      if (inCycle.has(task.id)) continue;
      const dependentDue = effectiveDue.get(task.id)! - task.durationMinutes * MINUTE;
      for (const dep of prerequisites.get(task.id) ?? []) {
        if (inCycle.has(dep)) continue;
        if (dependentDue < effectiveDue.get(dep)!) {
          effectiveDue.set(dep, dependentDue);
          dueReason.set(dep, `needed before "${task.title}" (${dueReason.get(task.id)})`);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const blocks: ScheduledBlock[] = [];
  const finishAt = new Map<string, number>();
  const failed = new Set<string>();
  const pending = new Set(open.map((task) => task.id));
  let order = 0;

  for (const id of [...inCycle].sort()) {
    const task = byId.get(id)!;
    pending.delete(id);
    failed.add(id);
    outcomes.set(id, {
      taskId: id,
      title: task.title,
      status: "blocked",
      order: null,
      scheduledMinutes: 0,
      requiredMinutes: task.durationMinutes,
      finish: null,
      deadline: task.deadline ?? null,
      effectiveDue: null,
      explanation: "Part of a dependency cycle — these tasks each wait on another. Remove one dependency to schedule them.",
    });
  }

  // Manual locks always win: pin locked tasks first, exactly where the person put them.
  for (const task of open) {
    if (inCycle.has(task.id)) continue;
    const lockedAt = parseInstant(task.lockedStart);
    if (lockedAt === null) continue;
    pending.delete(task.id);
    order += 1;
    const laneId = task.assigneeId ? task.assigneeId : UNASSIGNED_LANE;
    const target = lane(laneId);
    const end = lockedAt + task.durationMinutes * MINUTE;
    const overlapsBusy = busy.some((block) => (!block.memberId || block.memberId === laneId) && block.startMs! < end && block.endMs! > lockedAt);
    target.free = subtract(target.free, lockedAt, end);
    const lockedDay = localParts(lockedAt, tz);
    const lockedKey = dayKey(lockedDay.year, lockedDay.month, lockedDay.day);
    target.used.set(lockedKey, (target.used.get(lockedKey) ?? 0) + task.durationMinutes);
    finishAt.set(task.id, end);
    const deadline = parseInstant(task.deadline);
    const late = deadline !== null && end > deadline;
    const reasons = [`Locked by you at ${describeInstant(lockedAt, tz)} — manual locks always win; the scheduler plans everything else around it.`];
    if (overlapsBusy) reasons.push("Overlaps a fixed meeting; the lock is kept as you set it.");
    if (late) reasons.push(`Finishes after the deadline ${describeInstant(deadline!, tz)} — flagged late.`);
    blocks.push({
      id: `${task.id}:0`,
      taskId: task.id,
      title: task.title,
      lane: laneId,
      start: iso(lockedAt),
      end: iso(end),
      minutes: task.durationMinutes,
      chunkIndex: 0,
      chunkCount: 1,
      reasons,
    });
    outcomes.set(task.id, {
      taskId: task.id,
      title: task.title,
      status: late ? "late" : "on_track",
      order,
      scheduledMinutes: task.durationMinutes,
      requiredMinutes: task.durationMinutes,
      finish: iso(end),
      deadline: task.deadline ?? null,
      effectiveDue: iso(effectiveDue.get(task.id)!),
      explanation: late
        ? `Locked at ${describeInstant(lockedAt, tz)}, which finishes after its deadline ${describeInstant(deadline!, tz)}. Move or unlock it to let the scheduler fix this.`
        : `Locked at ${describeInstant(lockedAt, tz)}; the scheduler will not move it.`,
    });
  }

  const compare = (a: SchedulerTask, b: SchedulerTask) =>
    effectiveDue.get(a.id)! - effectiveDue.get(b.id)! ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    (parseInstant(a.earliestStart) ?? 0) - (parseInstant(b.earliestStart) ?? 0) ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id);

  while (pending.size > 0) {
    const ready = [...pending]
      .map((id) => byId.get(id)!)
      .filter((task) => (prerequisites.get(task.id) ?? []).every((dep) => !pending.has(dep)))
      .sort(compare);
    const task = ready[0];
    if (!task) break; // unreachable: cycles were removed
    pending.delete(task.id);

    const deps = prerequisites.get(task.id) ?? [];
    const blockedBy = deps.filter((dep) => failed.has(dep));
    const deadline = parseInstant(task.deadline);
    const base: Omit<TaskOutcome, "status" | "order" | "scheduledMinutes" | "finish" | "explanation"> = {
      taskId: task.id,
      title: task.title,
      requiredMinutes: task.durationMinutes,
      deadline: task.deadline ?? null,
      effectiveDue: iso(effectiveDue.get(task.id)!),
    };
    if (blockedBy.length > 0) {
      failed.add(task.id);
      outcomes.set(task.id, {
        ...base,
        status: "blocked",
        order: null,
        scheduledMinutes: 0,
        finish: null,
        explanation: `Waiting on ${blockedBy.map((dep) => `"${byId.get(dep)!.title}"`).join(", ")}, which could not be scheduled in the horizon.`,
      });
      continue;
    }

    order += 1;
    const laneId = task.assigneeId ? task.assigneeId : UNASSIGNED_LANE;
    const target = lane(laneId);
    const constraints: Array<[number, string]> = [[nowMs, "now"]];
    const earliest = parseInstant(task.earliestStart);
    if (earliest !== null) constraints.push([earliest, `its earliest start ${describeInstant(earliest, tz)}`]);
    for (const dep of deps) {
      constraints.push([finishAt.get(dep)!, `prerequisite "${byId.get(dep)!.title}" finishes`]);
    }
    const [notBefore, notBeforeReason] = constraints.reduce((latest, item) => (item[0] > latest[0] ? item : latest));

    // Place chunks into the earliest free time on or after notBefore.
    let remaining = task.durationMinutes;
    const placed: Array<{ start: number; end: number; day: string }> = [];
    const free = target.free;
    const placedOnDay = (day: string) => placed.filter((p) => p.day === day).reduce((sum, p) => sum + (p.end - p.start) / MINUTE, 0);
    for (const interval of free) {
      if (remaining <= 0) break;
      let cursor = Math.max(interval.start, notBefore);
      while (remaining > 0 && cursor < interval.end) {
        const capacityLeft = target.capacity === null ? Infinity : target.capacity - (target.used.get(interval.day) ?? 0) - placedOnDay(interval.day);
        const available = Math.floor(Math.min((interval.end - cursor) / MINUTE, capacityLeft));
        const length = Math.min(remaining, maxChunk, available);
        // Avoid slivers: a chunk must be at least minChunk unless it finishes the task.
        if (length <= 0 || (length < minChunk && length < remaining)) break;
        placed.push({ start: cursor, end: cursor + length * MINUTE, day: interval.day });
        remaining -= length;
        cursor += length * MINUTE;
      }
    }

    if (remaining > 0) {
      failed.add(task.id);
      const freeInHorizon = target.free.reduce((sum, interval) => sum + Math.max(0, interval.end - Math.max(interval.start, notBefore)), 0) / MINUTE;
      outcomes.set(task.id, {
        ...base,
        status: "unscheduled",
        order,
        scheduledMinutes: 0,
        finish: null,
        explanation: `Needs ${task.durationMinutes} min but only ${Math.floor(freeInHorizon)} usable working min remain after ${notBeforeReason} in the ${horizonDays}-day horizon${target.capacity !== null ? ` (daily capacity ${target.capacity} min)` : ""}. Extend the horizon, free up meetings, or lower the estimate.`,
      });
      continue;
    }

    // Commit: carve placed chunks out of the lane's free time.
    for (const chunk of placed) {
      target.free = subtract(target.free, chunk.start, chunk.end);
      target.used.set(chunk.day, (target.used.get(chunk.day) ?? 0) + (chunk.end - chunk.start) / MINUTE);
    }
    target.free.sort((a, b) => a.start - b.start);

    // Merge adjacent chunks that ended up contiguous.
    const merged: typeof placed = [];
    for (const chunk of placed) {
      const last = merged.at(-1);
      if (last && last.end === chunk.start && (last.end - last.start + chunk.end - chunk.start) / MINUTE <= maxChunk) last.end = chunk.end;
      else merged.push({ ...chunk });
    }

    const finish = merged.at(-1)!.end;
    finishAt.set(task.id, finish);
    const late = deadline !== null && finish > deadline;
    const chunkCount = merged.length;
    merged.forEach((chunk, chunkIndex) => {
      const reasons = [
        `#${order} in queue: ${dueReason.get(task.id)}.`,
        chunkIndex === 0
          ? `Earliest free working time after ${notBeforeReason}.`
          : `Continues in the next free working time after chunk ${chunkIndex}.`,
      ];
      if (chunkCount > 1) {
        reasons.push(
          `Chunk ${chunkIndex + 1} of ${chunkCount}: ${task.durationMinutes} min split into focus blocks of at most ${maxChunk} min around meetings and working-hour boundaries.`,
        );
      }
      if (laneId !== UNASSIGNED_LANE) {
        const member = members.get(laneId);
        reasons.push(
          `Assigned to ${member?.name ?? laneId}${target.capacity !== null ? `, capped at ${target.capacity} min/day` : ""}.`,
        );
      }
      if (late) reasons.push(`Finishes after the deadline ${describeInstant(deadline!, tz)} — flagged late.`);
      blocks.push({
        id: `${task.id}:${chunkIndex}`,
        taskId: task.id,
        title: task.title,
        lane: laneId,
        start: iso(chunk.start),
        end: iso(chunk.end),
        minutes: (chunk.end - chunk.start) / MINUTE,
        chunkIndex,
        chunkCount,
        reasons,
      });
    });

    let explanation: string;
    if (late) {
      const freeBeforeDeadline =
        lane(laneId).free.reduce((sum, interval) => sum + Math.max(0, Math.min(interval.end, deadline!) - Math.max(interval.start, notBefore)), 0) / MINUTE +
        merged.reduce((sum, chunk) => sum + Math.max(0, Math.min(chunk.end, deadline!) - chunk.start), 0) / MINUTE;
      explanation = `Cannot meet the deadline ${describeInstant(deadline!, tz)}: needs ${task.durationMinutes} min, but only ${Math.floor(freeBeforeDeadline)} working min were free between ${notBeforeReason} and the deadline after higher-ranked work. Finishes ${describeInstant(finish, tz)}.`;
    } else {
      explanation = `Scheduled in ${chunkCount} block${chunkCount === 1 ? "" : "s"}, finishing ${describeInstant(finish, tz)}${deadline !== null ? ` — before its deadline ${describeInstant(deadline, tz)}` : ""}. Ranked by ${dueReason.get(task.id)}.`;
    }
    outcomes.set(task.id, {
      ...base,
      status: late ? "late" : "on_track",
      order,
      scheduledMinutes: task.durationMinutes,
      finish: iso(finish),
      explanation,
    });
  }

  blocks.sort((a, b) => a.start.localeCompare(b.start) || a.lane.localeCompare(b.lane) || a.id.localeCompare(b.id));
  const orderedOutcomes = allTasks.map((task) => outcomes.get(task.id)!).sort((a, b) => {
    const rank = (outcome: TaskOutcome) => (outcome.order === null ? Number.MAX_SAFE_INTEGER : outcome.order);
    return rank(a) - rank(b) || a.title.localeCompare(b.title) || a.taskId.localeCompare(b.taskId);
  });

  const freeMinutes = (lanes.size > 0 ? [...lanes.values()] : [lane(UNASSIGNED_LANE)]).reduce(
    (sum, entry) => sum + entry.free.reduce((total, interval) => total + (interval.end - interval.start) / MINUTE, 0),
    0,
  );

  return {
    engineVersion: ENGINE_VERSION,
    inputHash: hashInput({ ...input, engine: ENGINE_VERSION }),
    horizon: { start: iso(nowMs), end: iso(horizonEnd) },
    blocks,
    outcomes: orderedOutcomes,
    warnings,
    stats: {
      scheduledTasks: orderedOutcomes.filter((outcome) => outcome.status === "on_track" || outcome.status === "late").length,
      lateTasks: orderedOutcomes.filter((outcome) => outcome.status === "late").length,
      unscheduledTasks: orderedOutcomes.filter((outcome) => outcome.status === "unscheduled" || outcome.status === "blocked").length,
      scheduledMinutes: blocks.reduce((sum, block) => sum + block.minutes, 0),
      freeMinutes,
    },
  };
}

/** Compare two plans: which tasks moved, which newly became late. Used for what-if previews. */
export function diffSchedules(previous: Pick<ScheduleResult, "blocks" | "outcomes"> | null, next: ScheduleResult) {
  const firstStart = (result: Pick<ScheduleResult, "blocks">) => {
    const map = new Map<string, string>();
    for (const block of result.blocks) if (!map.has(block.taskId)) map.set(block.taskId, block.start);
    return map;
  };
  const before = previous ? firstStart(previous) : new Map<string, string>();
  const after = firstStart(next);
  const statusBefore = new Map((previous?.outcomes ?? []).map((outcome) => [outcome.taskId, outcome.status]));
  const moved: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const [taskId, start] of after) {
    if (!before.has(taskId)) added.push(taskId);
    else if (before.get(taskId) !== start) moved.push(taskId);
  }
  for (const taskId of before.keys()) if (!after.has(taskId)) removed.push(taskId);
  const newlyAtRisk = next.outcomes
    .filter((outcome) => (outcome.status === "late" || outcome.status === "unscheduled" || outcome.status === "blocked") && statusBefore.get(outcome.taskId) !== outcome.status)
    .map((outcome) => outcome.taskId);
  return { moved, added, removed, newlyAtRisk };
}
