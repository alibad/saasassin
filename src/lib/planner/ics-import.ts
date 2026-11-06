/**
 * Pure iCalendar (RFC 5545) reader for importing busy time from an .ics file.
 *
 * Supports: line unfolding, VEVENT (nested VALARM ignored), SUMMARY, UID, DTSTART/DTEND
 * (UTC "Z", TZID, floating, all-day VALUE=DATE), DURATION, STATUS:CANCELLED and
 * TRANSP:TRANSPARENT (skipped — not busy), RRULE (FREQ DAILY/WEEKLY/MONTHLY/YEARLY,
 * INTERVAL, BYDAY incl. monthly ordinals like 2TU / -1FR, BYMONTHDAY, COUNT, UNTIL),
 * EXDATE and RECURRENCE-ID overrides. Recurrences expand in the event's own wall clock,
 * so a 09:00 weekly meeting stays at 09:00 across DST changes.
 *
 * Deterministic: no clock — the import window is an input.
 */

import { dateFromEpochDay, epochDay } from "./recurrence";
import { dayKey, isValidTimeZone, localParts, zonedToUtc } from "./time";

export type IcsImportOptions = {
  /** Used for floating times, all-day events and unknown TZIDs. */
  defaultTimeZone: string;
  /** Only instances overlapping [windowStart, windowEnd) are returned. */
  windowStart: string;
  windowEnd: string;
  maxInstances?: number;
};

export type ImportedInstance = {
  uid: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
};

export type IcsImportResult = {
  instances: ImportedInstance[];
  /** Every UID seen in the file, including ones with no instance in the window. */
  uids: string[];
  eventCount: number;
  skipped: Array<{ uid: string; title: string; reason: string }>;
  warnings: string[];
};

type Property = { name: string; params: Record<string, string>; value: string };

type WallTime = { year: number; month: number; day: number; minute: number; zone: string; allDay: boolean };

type ParsedRule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count: number | null;
  untilMs: number | null;
  untilDate: string | null;
  byDay: Array<{ ordinal: number; weekday: number }>;
  byMonthDay: number[];
};

const WEEKDAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Common Windows (Outlook / Exchange) zone names → IANA. */
const WINDOWS_ZONES: Record<string, string> = {
  "UTC": "UTC",
  "Coordinated Universal Time": "UTC",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "E. Europe Standard Time": "Europe/Chisinau",
  "GTB Standard Time": "Europe/Bucharest",
  "FLE Standard Time": "Europe/Kiev",
  "Turkey Standard Time": "Europe/Istanbul",
  "Russian Standard Time": "Europe/Moscow",
  "Arabian Standard Time": "Asia/Dubai",
  "India Standard Time": "Asia/Kolkata",
  "China Standard Time": "Asia/Shanghai",
  "Singapore Standard Time": "Asia/Singapore",
  "Tokyo Standard Time": "Asia/Tokyo",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "New Zealand Standard Time": "Pacific/Auckland",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "US Mountain Standard Time": "America/Phoenix",
  "Pacific Standard Time": "America/Los_Angeles",
  "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Atlantic Standard Time": "America/Halifax",
  "SA Pacific Standard Time": "America/Bogota",
  "E. South America Standard Time": "America/Sao_Paulo",
  "South Africa Standard Time": "Africa/Johannesburg",
  "Egypt Standard Time": "Africa/Cairo",
  "Israel Standard Time": "Asia/Jerusalem",
};

export function unfoldLines(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n").filter((line) => line.length > 0);
}

/** Splits on `separator` outside double quotes. */
function splitOutsideQuotes(value: string, separator: string) {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    if (char === separator && !quoted) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

export function parseContentLine(line: string): Property | null {
  let colon = -1;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    if (line[index] === ":" && !quoted) {
      colon = index;
      break;
    }
  }
  if (colon <= 0) return null;
  const [name, ...rawParams] = splitOutsideQuotes(line.slice(0, colon), ";");
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const eq = param.indexOf("=");
    if (eq > 0) params[param.slice(0, eq).toUpperCase()] = param.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

export function unescapeText(value: string) {
  return value.replace(/\\([\\;,nN])/g, (_match, char: string) => (char === "n" || char === "N" ? "\n" : char));
}

function resolveZone(tzid: string | undefined, fallback: string, warnings: Set<string>) {
  if (!tzid) return fallback;
  const cleaned = tzid.replace(/^\//, "").trim();
  if (isValidTimeZone(cleaned)) return cleaned;
  const mapped = WINDOWS_ZONES[cleaned];
  if (mapped) return mapped;
  // e.g. "/mozilla.org/20050126_1/Europe/London" → "Europe/London"
  const tail = cleaned.split("/").slice(-2).join("/");
  if (tail.includes("/") && isValidTimeZone(tail)) return tail;
  warnings.add(`Unknown time zone "${tzid}" — those times were read as ${fallback}.`);
  return fallback;
}

/** Parses a DATE or DATE-TIME value into wall-clock parts in a zone. */
export function parseIcsTime(value: string, params: Record<string, string>, defaultZone: string, warnings = new Set<string>()): WallTime | null {
  const trimmed = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  if (dateOnly || params.VALUE === "DATE") {
    const match = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(trimmed);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), minute: 0, zone: defaultZone, allDay: true };
  }
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(trimmed);
  if (!dateTime) return null;
  const zone = dateTime[7] ? "UTC" : resolveZone(params.TZID, defaultZone, warnings);
  return {
    year: Number(dateTime[1]),
    month: Number(dateTime[2]),
    day: Number(dateTime[3]),
    minute: Number(dateTime[4]) * 60 + Number(dateTime[5]),
    zone,
    allDay: false,
  };
}

function wallToUtc(time: WallTime) {
  return zonedToUtc(time.year, time.month, time.day, time.minute, time.zone);
}

/** ISO 8601 duration (P1W, P1DT2H, PT30M) → milliseconds. */
export function parseDuration(value: string) {
  const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!match) return null;
  const [, sign, weeks, days, hours, minutes, seconds] = match;
  const ms = ((Number(weeks ?? 0) * 7 + Number(days ?? 0)) * 86_400 + Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)) * 1000;
  return sign === "-" ? -ms : ms;
}

export function parseRule(value: string, start: WallTime, warnings: Set<string>): ParsedRule | null {
  const parts = Object.fromEntries(
    value.split(";").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key.toUpperCase(), rest.join("=")];
    }),
  );
  const freq = parts.FREQ as ParsedRule["freq"];
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) {
    warnings.add(`Repeat rule FREQ=${parts.FREQ ?? "?"} is not supported; only the first occurrence was imported.`);
    return null;
  }
  const rule: ParsedRule = {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    count: parts.COUNT ? Math.max(1, Number(parts.COUNT) || 1) : null,
    untilMs: null,
    untilDate: null,
    byDay: [],
    byMonthDay: [],
  };
  if (parts.UNTIL) {
    const until = parseIcsTime(parts.UNTIL, {}, start.zone);
    if (until?.allDay) rule.untilDate = dayKey(until.year, until.month, until.day);
    else if (until) rule.untilMs = wallToUtc(/Z$/.test(parts.UNTIL) ? until : { ...until, zone: start.zone });
  }
  for (const entry of (parts.BYDAY ?? "").split(",").filter(Boolean)) {
    const match = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(entry.trim());
    if (match) rule.byDay.push({ ordinal: match[1] ? Number(match[1]) : 0, weekday: WEEKDAY_CODES[match[2].toUpperCase()] });
  }
  for (const entry of (parts.BYMONTHDAY ?? "").split(",").filter(Boolean)) {
    const day = Number(entry);
    if (Number.isInteger(day) && day !== 0 && Math.abs(day) <= 31) rule.byMonthDay.push(day);
  }
  for (const unsupported of ["BYSETPOS", "BYWEEKNO", "BYYEARDAY", "BYHOUR", "BYMINUTE"]) {
    if (parts[unsupported]) warnings.add(`Repeat rule part ${unsupported} is not supported and was ignored.`);
  }
  return rule;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function ruleMatches(rule: ParsedRule, startDay: number, day: number) {
  const start = dateFromEpochDay(startDay);
  const date = dateFromEpochDay(day);
  const weekdayAllowed = (allowed: number[]) => allowed.includes(date.weekday);
  const monthDayAllowed = () => {
    const length = daysInMonth(date.year, date.month);
    return rule.byMonthDay.some((wanted) => (wanted > 0 ? wanted : length + wanted + 1) === date.day);
  };
  switch (rule.freq) {
    case "DAILY":
      if ((day - startDay) % rule.interval !== 0) return false;
      if (rule.byDay.length && !weekdayAllowed(rule.byDay.map((entry) => entry.weekday))) return false;
      return rule.byMonthDay.length ? monthDayAllowed() : true;
    case "WEEKLY": {
      const weekdays = rule.byDay.length ? rule.byDay.map((entry) => entry.weekday) : [start.weekday];
      if (!weekdayAllowed(weekdays)) return false;
      const weekStart = startDay - ((start.weekday + 6) % 7); // weeks start on Monday (WKST=MO)
      return Math.floor((day - weekStart) / 7) % rule.interval === 0;
    }
    case "MONTHLY": {
      const monthIndex = date.year * 12 + date.month - (start.year * 12 + start.month);
      if (monthIndex % rule.interval !== 0) return false;
      if (rule.byMonthDay.length) return monthDayAllowed();
      if (rule.byDay.length) {
        const length = daysInMonth(date.year, date.month);
        const nth = Math.floor((date.day - 1) / 7) + 1;
        const nthFromEnd = -(Math.floor((length - date.day) / 7) + 1);
        return rule.byDay.some((entry) => entry.weekday === date.weekday && (entry.ordinal === 0 || entry.ordinal === nth || entry.ordinal === nthFromEnd));
      }
      return date.day === start.day;
    }
    case "YEARLY":
      return (date.year - start.year) % rule.interval === 0 && date.month === start.month && date.day === start.day;
    default:
      return false;
  }
}

type RawEvent = Property[];

function first(event: RawEvent, name: string) {
  return event.find((property) => property.name === name);
}

export function parseIcs(text: string, options: IcsImportOptions): IcsImportResult {
  const warnings = new Set<string>();
  const skipped: IcsImportResult["skipped"] = [];
  const windowStart = Date.parse(options.windowStart);
  const windowEnd = Date.parse(options.windowEnd);
  const maxInstances = options.maxInstances ?? 2000;
  const zone = options.defaultTimeZone;

  const events: RawEvent[] = [];
  const stack: string[] = [];
  let current: RawEvent | null = null;
  let sawCalendar = false;
  for (const line of unfoldLines(text)) {
    const property = parseContentLine(line);
    if (!property) continue;
    if (property.name === "BEGIN") {
      const component = property.value.trim().toUpperCase();
      if (component === "VCALENDAR") sawCalendar = true;
      stack.push(component);
      if (component === "VEVENT") current = [];
      continue;
    }
    if (property.name === "END") {
      const component = stack.pop();
      if (component === "VEVENT" && current) {
        events.push(current);
        current = null;
      }
      continue;
    }
    if (current && stack.at(-1) === "VEVENT") current.push(property);
  }
  if (!sawCalendar) warnings.add("This does not look like an iCalendar file (no BEGIN:VCALENDAR).");

  // RECURRENCE-ID instances replace the matching occurrence of their series.
  const overridden = new Map<string, Set<number>>();
  for (const event of events) {
    const uid = first(event, "UID")?.value.trim();
    const recurrenceId = first(event, "RECURRENCE-ID");
    if (!uid || !recurrenceId) continue;
    const time = parseIcsTime(recurrenceId.value, recurrenceId.params, zone, warnings);
    if (!time) continue;
    const set = overridden.get(uid) ?? new Set<number>();
    set.add(wallToUtc(time));
    overridden.set(uid, set);
  }

  const instances: ImportedInstance[] = [];
  const uids = new Set<string>();
  let truncated = false;

  events.forEach((event, index) => {
    const title = unescapeText(first(event, "SUMMARY")?.value ?? "").trim() || "Busy";
    const uid = first(event, "UID")?.value.trim() || `no-uid-${index}-${first(event, "DTSTART")?.value ?? ""}`;
    uids.add(uid);
    if (first(event, "STATUS")?.value.trim().toUpperCase() === "CANCELLED") {
      skipped.push({ uid, title, reason: "Cancelled" });
      return;
    }
    if (first(event, "TRANSP")?.value.trim().toUpperCase() === "TRANSPARENT") {
      skipped.push({ uid, title, reason: "Marked as free (transparent)" });
      return;
    }
    const dtstart = first(event, "DTSTART");
    const start = dtstart ? parseIcsTime(dtstart.value, dtstart.params, zone, warnings) : null;
    if (!start) {
      skipped.push({ uid, title, reason: "Missing or invalid DTSTART" });
      return;
    }
    const startMs = wallToUtc(start);
    let durationMs: number | null = null;
    const dtend = first(event, "DTEND");
    const durationProp = first(event, "DURATION");
    if (dtend) {
      const end = parseIcsTime(dtend.value, dtend.params, zone, warnings);
      if (end) durationMs = start.allDay ? (epochDay(dayKey(end.year, end.month, end.day)) - epochDay(dayKey(start.year, start.month, start.day))) * 86_400_000 : wallToUtc(end) - startMs;
    } else if (durationProp) {
      durationMs = parseDuration(durationProp.value);
    } else if (start.allDay) {
      durationMs = 86_400_000;
    }
    if (durationMs === null || durationMs <= 0) {
      skipped.push({ uid, title, reason: "No duration (zero-length or invalid end)" });
      return;
    }

    const make = (wall: WallTime): ImportedInstance => {
      if (wall.allDay) {
        const days = Math.round(durationMs! / 86_400_000);
        const startDay = epochDay(dayKey(wall.year, wall.month, wall.day));
        const endDate = dateFromEpochDay(startDay + days);
        return {
          uid,
          title,
          allDay: true,
          start: new Date(zonedToUtc(wall.year, wall.month, wall.day, 0, zone)).toISOString(),
          end: new Date(zonedToUtc(endDate.year, endDate.month, endDate.day, 0, zone)).toISOString(),
        };
      }
      const instanceStart = wallToUtc(wall);
      return { uid, title, allDay: false, start: new Date(instanceStart).toISOString(), end: new Date(instanceStart + durationMs!).toISOString() };
    };
    const inWindow = (instance: ImportedInstance) => Date.parse(instance.end) > windowStart && Date.parse(instance.start) < windowEnd;
    const push = (instance: ImportedInstance) => {
      if (!inWindow(instance)) return;
      if (instances.length >= maxInstances) {
        truncated = true;
        return;
      }
      instances.push(instance);
    };

    const rrule = first(event, "RRULE");
    const isOverride = Boolean(first(event, "RECURRENCE-ID"));
    const rule = rrule && !isOverride ? parseRule(rrule.value, start, warnings) : null;
    if (!rule) {
      push(make(start));
      return;
    }

    const exMs = new Set<number>();
    const exDates = new Set<string>();
    for (const property of event.filter((entry) => entry.name === "EXDATE")) {
      for (const value of property.value.split(",")) {
        const time = parseIcsTime(value, property.params, start.zone, warnings);
        if (!time) continue;
        if (time.allDay) exDates.add(dayKey(time.year, time.month, time.day));
        else exMs.add(wallToUtc(time));
      }
    }
    const replaced = overridden.get(uid) ?? new Set<number>();

    const startDay = epochDay(dayKey(start.year, start.month, start.day));
    const windowLastDay = epochDay(dayKey(...ymd(windowEnd, start.zone))) + 1;
    const untilDay = rule.untilDate ? epochDay(rule.untilDate) : rule.untilMs !== null ? epochDay(dayKey(...ymd(rule.untilMs, start.zone))) : Infinity;
    const lastDay = Math.min(windowLastDay, untilDay, startDay + 366 * 30);
    const spanDays = Math.ceil(durationMs / 86_400_000) + 1;
    const firstDay = rule.count === null ? Math.max(startDay, epochDay(dayKey(...ymd(windowStart, start.zone))) - spanDays) : startDay;
    let seen = 0;
    for (let day = rule.count === null ? firstDay : startDay; day <= lastDay; day += 1) {
      if (day !== startDay && !ruleMatches(rule, startDay, day)) continue;
      const date = dateFromEpochDay(day);
      const wall: WallTime = { ...start, year: date.year, month: date.month, day: date.day };
      const instanceStart = wallToUtc(wall);
      if (rule.untilMs !== null && instanceStart > rule.untilMs) break;
      seen += 1;
      if (rule.count !== null && seen > rule.count) break;
      if (day < firstDay) continue;
      if (exMs.has(instanceStart) || exDates.has(date.key) || replaced.has(instanceStart)) continue;
      push(make(wall));
      if (truncated) break;
    }
  });

  if (truncated) warnings.add(`Only the first ${maxInstances} busy blocks in the window were imported.`);
  instances.sort((a, b) => a.start.localeCompare(b.start) || a.uid.localeCompare(b.uid));
  return { instances, uids: [...uids].sort(), eventCount: events.length, skipped, warnings: [...warnings] };
}

function ymd(ms: number, zone: string): [number, number, number] {
  const parts = localParts(ms, zone);
  return [parts.year, parts.month, parts.day];
}
