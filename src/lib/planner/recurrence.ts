/**
 * Pure recurrence rules for repeating tasks.
 *
 * Dates are local calendar dates ("YYYY-MM-DD") in the workspace time zone, so a series
 * expands identically on every run regardless of the server clock or DST. Each
 * occurrence is identified by its date; counts are measured from the series start, so
 * "10 times" means the same ten dates no matter when the scheduler runs.
 */

export const RECURRENCE_FREQUENCIES = ["daily", "weekdays", "weekly", "monthly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export type Recurrence = {
  freq: RecurrenceFrequency;
  /** Every N days / weeks / months (ignored for "weekdays"). */
  interval: number;
  /** Weekly only: 0 = Sunday … 6 = Saturday. Defaults to the start date's weekday. */
  weekdays?: number[] | null;
  /** Monthly only: day of month 1–31; shorter months use their last day. Defaults to the start date's day. */
  monthDay?: number | null;
  /** First possible occurrence (inclusive). */
  startDate: string;
  /** Last possible occurrence (inclusive). */
  until?: string | null;
  /** Total number of occurrences, counted from the start date. */
  count?: number | null;
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_SPAN_DAYS = 366 * 25;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isDateKey(value: string) {
  const match = DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Days since 1970-01-01 for a date key. */
export function epochDay(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function dateFromEpochDay(day: number) {
  const date = new Date(day * 86_400_000);
  return {
    key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function matches(rule: Recurrence, startDay: number, day: number) {
  const start = dateFromEpochDay(startDay);
  const date = dateFromEpochDay(day);
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  switch (rule.freq) {
    case "daily":
      return (day - startDay) % interval === 0;
    case "weekdays":
      return date.weekday >= 1 && date.weekday <= 5;
    case "weekly": {
      const weekdays = rule.weekdays && rule.weekdays.length > 0 ? rule.weekdays : [start.weekday];
      if (!weekdays.includes(date.weekday)) return false;
      const weekStart = startDay - start.weekday;
      return Math.floor((day - weekStart) / 7) % interval === 0;
    }
    case "monthly": {
      const wanted = rule.monthDay ?? start.day;
      const monthIndex = date.year * 12 + date.month - (start.year * 12 + start.month);
      if (monthIndex % interval !== 0) return false;
      return date.day === Math.min(wanted, daysInMonth(date.year, date.month));
    }
    default:
      return false;
  }
}

/**
 * Occurrence dates of a series that fall within [from, to] (inclusive date keys),
 * honouring the series' start, end date and count.
 */
export function expandRecurrence(rule: Recurrence, from: string, to: string): string[] {
  if (!isDateKey(rule.startDate) || !isDateKey(from) || !isDateKey(to)) return [];
  const startDay = epochDay(rule.startDate);
  let lastDay = epochDay(to);
  if (rule.until && isDateKey(rule.until)) lastDay = Math.min(lastDay, epochDay(rule.until));
  lastDay = Math.min(lastDay, startDay + MAX_SPAN_DAYS);
  const firstDay = Math.max(epochDay(from), startDay);
  const limit = rule.count && rule.count > 0 ? Math.floor(rule.count) : Infinity;
  const result: string[] = [];
  let seen = 0;
  // Counting from the series start keeps "N times" stable; without a count we can jump to `from`.
  for (let day = limit === Infinity ? firstDay : startDay; day <= lastDay; day += 1) {
    if (!matches(rule, startDay, day)) continue;
    seen += 1;
    if (seen > limit) break;
    if (day >= firstDay) result.push(dateFromEpochDay(day).key);
  }
  return result;
}

/** True when `date` is one of the series' occurrences. */
export function isOccurrence(rule: Recurrence, date: string) {
  return isDateKey(date) && expandRecurrence(rule, date, date).length === 1;
}

export function describeRecurrence(rule: Recurrence) {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  const every = (unit: string) => (interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`);
  let text: string;
  switch (rule.freq) {
    case "daily":
      text = every("day");
      break;
    case "weekdays":
      text = "Every weekday";
      break;
    case "weekly": {
      const start = dateFromEpochDay(epochDay(rule.startDate));
      const days = (rule.weekdays && rule.weekdays.length > 0 ? rule.weekdays : [start.weekday]).slice().sort();
      text = `${every("week")} on ${days.map((day) => WEEKDAY_NAMES[day]).join(", ")}`;
      break;
    }
    case "monthly": {
      const day = rule.monthDay ?? Number(rule.startDate.slice(8, 10));
      text = `${every("month")} on day ${day}`;
      break;
    }
    default:
      text = "Repeats";
  }
  if (rule.count) text += `, ${rule.count} time${rule.count === 1 ? "" : "s"}`;
  else if (rule.until) text += `, until ${rule.until}`;
  return `${text} from ${rule.startDate}`;
}

/** Occurrence ids look like `<taskId>@<YYYY-MM-DD>`. */
export function occurrenceId(taskId: string, date: string) {
  return `${taskId}@${date}`;
}

export function parseOccurrenceId(id: string): { seriesId: string; date: string } | null {
  const at = id.lastIndexOf("@");
  if (at <= 0) return null;
  const date = id.slice(at + 1);
  return isDateKey(date) ? { seriesId: id.slice(0, at), date } : null;
}
