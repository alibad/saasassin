/**
 * Pure, dependency-free time-zone helpers for the Planner scheduler.
 *
 * All instants are UTC epoch milliseconds. Wall-clock conversion relies only on
 * Intl (IANA data shipped with the runtime), so results are deterministic for a
 * given runtime and DST transitions are handled by re-checking the offset.
 */

export const MINUTE = 60_000;
export const DAY_MINUTES = 24 * 60;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let cached = formatters.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, cached);
  }
  return cached;
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

/** Wall-clock parts of an instant in a time zone. weekday: 0 = Sunday. */
export function localParts(utcMs: number, timeZone: string): LocalParts {
  const parts = formatter(timeZone).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    year,
    month,
    day,
    hour: get("hour") % 24,
    minute: get("minute"),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** Offset in minutes such that local = utc + offset. */
export function offsetMinutes(utcMs: number, timeZone: string) {
  const floored = Math.floor(utcMs / MINUTE) * MINUTE;
  const p = localParts(floored, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - floored) / MINUTE);
}

/** UTC instant for a wall-clock minute-of-day on a calendar date in a time zone. */
export function zonedToUtc(year: number, month: number, day: number, minuteOfDay: number, timeZone: string) {
  const naive = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  const first = offsetMinutes(naive, timeZone);
  let utc = naive - first * MINUTE;
  const second = offsetMinutes(utc, timeZone);
  if (second !== first) utc = naive - second * MINUTE;
  return utc;
}

export function dayKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function localDayKey(utcMs: number, timeZone: string) {
  const p = localParts(utcMs, timeZone);
  return dayKey(p.year, p.month, p.day);
}

/** Calendar date `offset` days after the given date (pure calendar arithmetic). */
export function addCalendarDays(year: number, month: number, day: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay() };
}

export function formatMinuteOfDay(minute: number) {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseMinuteOfDay(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute >= 0 && minute <= DAY_MINUTES ? minute : null;
}
