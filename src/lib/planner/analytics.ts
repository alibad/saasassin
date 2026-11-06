/**
 * Planning analytics computed from stored records only — plan versions, completions,
 * pushes and recorded actual time. Pure and deterministic; `now` is an input.
 *
 * - Planned hours per week: each plan version is "in force" from its creation until the next
 *   version; a week's planned minutes are the blocks each version placed while it was in force.
 * - Completed hours per week: completions in that week, at the recorded actual time when given,
 *   otherwise the estimate.
 * - Deadline hit rate: completed on or before the deadline vs completed late or still open past it.
 * - Estimate accuracy: actual ÷ estimate for every completion with recorded actual time.
 */

import { dateFromEpochDay, epochDay } from "./recurrence";
import { localDayKey, zonedToUtc } from "./time";

export type AnalyticsTask = {
  id: string;
  title: string;
  durationMinutes: number;
  deadline: string | null;
  status: "todo" | "done";
  completedAt: string | null;
  actualMinutes: number | null;
  pushCount: number;
  recurring: boolean;
  occurrences: Record<string, { completedAt: string | null; actualMinutes: number | null }>;
};

export type AnalyticsPlan = { version: number; createdAt: string; blocks: Array<{ start: string; end: string }> };

export type AnalyticsInput = { now: string; timeZone: string; weeks?: number; tasks: AnalyticsTask[]; plans: AnalyticsPlan[] };

export type WeekStat = { weekStart: string; plannedMinutes: number; completedMinutes: number; completions: number; planVersions: number[] };

export type PlanningAnalytics = {
  weeks: WeekStat[];
  deadlines: {
    hit: number;
    missed: number;
    upcoming: number;
    rate: number | null;
    missedTasks: Array<{ id: string; title: string; deadline: string; completedAt: string | null }>;
  };
  pushed: Array<{ id: string; title: string; pushCount: number }>;
  estimates: {
    samples: number;
    medianRatio: number | null;
    withinQuarter: number | null;
    estimateMinutes: number;
    actualMinutes: number;
    biggestMisses: Array<{ id: string; title: string; estimate: number; actual: number; ratio: number }>;
  };
};

function weekStartDay(ms: number, timeZone: string) {
  const day = epochDay(localDayKey(ms, timeZone));
  return day - ((dateFromEpochDay(day).weekday + 6) % 7); // Monday
}

function dayStartMs(day: number, timeZone: string) {
  const date = dateFromEpochDay(day);
  return zonedToUtc(date.year, date.month, date.day, 0, timeZone);
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

export function planningAnalytics(input: AnalyticsInput): PlanningAnalytics {
  const nowMs = Date.parse(input.now);
  const tz = input.timeZone;
  const weekCount = Math.max(1, Math.min(26, input.weeks ?? 8));
  const currentWeek = weekStartDay(nowMs, tz);
  const weeks = Array.from({ length: weekCount }, (_, index) => {
    const startDay = currentWeek - (weekCount - 1 - index) * 7;
    return { startDay, startMs: dayStartMs(startDay, tz), endMs: dayStartMs(startDay + 7, tz) };
  });
  const stats: WeekStat[] = weeks.map((week) => ({ weekStart: dateFromEpochDay(week.startDay).key, plannedMinutes: 0, completedMinutes: 0, completions: 0, planVersions: [] }));

  // Planned: each version counts only while it was the plan in force.
  const plans = [...input.plans].filter((plan) => Number.isFinite(Date.parse(plan.createdAt))).sort((a, b) => a.version - b.version);
  plans.forEach((plan, index) => {
    const from = Date.parse(plan.createdAt);
    const until = index + 1 < plans.length ? Date.parse(plans[index + 1].createdAt) : Infinity;
    weeks.forEach((week, weekIndex) => {
      const lo = Math.max(from, week.startMs);
      const hi = Math.min(until, week.endMs);
      if (hi <= lo) return;
      let minutes = 0;
      for (const block of plan.blocks) {
        const start = Math.max(Date.parse(block.start), lo);
        const end = Math.min(Date.parse(block.end), hi);
        if (end > start) minutes += (end - start) / 60_000;
      }
      if (minutes > 0) {
        stats[weekIndex].plannedMinutes += minutes;
        stats[weekIndex].planVersions.push(plan.version);
      }
    });
  });

  // Completed: tasks and repeating-task occurrences, at actual time when recorded.
  const completions: Array<{ id: string; title: string; at: number; estimate: number; actual: number | null }> = [];
  for (const task of input.tasks) {
    if (task.recurring) {
      for (const [date, occurrence] of Object.entries(task.occurrences)) {
        const at = occurrence.completedAt ? Date.parse(occurrence.completedAt) : NaN;
        if (Number.isFinite(at)) completions.push({ id: `${task.id}@${date}`, title: `${task.title} (${date})`, at, estimate: task.durationMinutes, actual: occurrence.actualMinutes });
      }
    } else if (task.status === "done" && task.completedAt) {
      const at = Date.parse(task.completedAt);
      if (Number.isFinite(at)) completions.push({ id: task.id, title: task.title, at, estimate: task.durationMinutes, actual: task.actualMinutes });
    }
  }
  for (const completion of completions) {
    const weekIndex = weeks.findIndex((week) => completion.at >= week.startMs && completion.at < week.endMs);
    if (weekIndex < 0) continue;
    stats[weekIndex].completedMinutes += completion.actual ?? completion.estimate;
    stats[weekIndex].completions += 1;
  }
  for (const stat of stats) stat.plannedMinutes = Math.round(stat.plannedMinutes);

  // Deadlines (one-off tasks only; occurrences are due the day they fall on).
  let hit = 0;
  let upcoming = 0;
  const missedTasks: PlanningAnalytics["deadlines"]["missedTasks"] = [];
  for (const task of input.tasks) {
    if (task.recurring || !task.deadline) continue;
    const deadline = Date.parse(task.deadline);
    if (!Number.isFinite(deadline)) continue;
    if (task.status === "done" && task.completedAt) {
      if (Date.parse(task.completedAt) <= deadline) hit += 1;
      else missedTasks.push({ id: task.id, title: task.title, deadline: task.deadline, completedAt: task.completedAt });
    } else if (deadline < nowMs) {
      missedTasks.push({ id: task.id, title: task.title, deadline: task.deadline, completedAt: null });
    } else {
      upcoming += 1;
    }
  }
  missedTasks.sort((a, b) => b.deadline.localeCompare(a.deadline) || a.id.localeCompare(b.id));
  const decided = hit + missedTasks.length;

  const pushed = input.tasks
    .filter((task) => task.pushCount > 0)
    .map((task) => ({ id: task.id, title: task.title, pushCount: task.pushCount }))
    .sort((a, b) => b.pushCount - a.pushCount || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    .slice(0, 5);

  const measured = completions.filter((completion) => completion.actual !== null && completion.estimate > 0);
  const ratios = measured.map((completion) => completion.actual! / completion.estimate);
  const biggestMisses = measured
    .map((completion) => ({ id: completion.id, title: completion.title, estimate: completion.estimate, actual: completion.actual!, ratio: round(completion.actual! / completion.estimate) }))
    .filter((entry) => entry.ratio !== 1)
    .sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)) || a.id.localeCompare(b.id))
    .slice(0, 5);

  return {
    weeks: stats,
    deadlines: { hit, missed: missedTasks.length, upcoming, rate: decided ? round(hit / decided, 3) : null, missedTasks: missedTasks.slice(0, 10) },
    pushed,
    estimates: {
      samples: measured.length,
      medianRatio: ratios.length ? round(median(ratios)!) : null,
      withinQuarter: ratios.length ? round(ratios.filter((ratio) => ratio >= 0.75 && ratio <= 1.25).length / ratios.length, 3) : null,
      estimateMinutes: measured.reduce((sum, completion) => sum + completion.estimate, 0),
      actualMinutes: measured.reduce((sum, completion) => sum + completion.actual!, 0),
      biggestMisses,
    },
  };
}
