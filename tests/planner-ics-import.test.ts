import { describe, expect, it } from "vitest";

import { parseContentLine, parseDuration, parseIcs, unescapeText, unfoldLines } from "../src/lib/planner/ics-import";

const calendar = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN", ...events, "END:VCALENDAR"].join("\r\n");
const vevent = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

const WINDOW = { defaultTimeZone: "Europe/Istanbul", windowStart: "2026-11-01T00:00:00.000Z", windowEnd: "2026-12-31T00:00:00.000Z" };

describe("ics import — lexing", () => {
  it("unfolds continuation lines and parses quoted params", () => {
    expect(unfoldLines("SUMMARY:Long\r\n  title\r\nUID:1")).toEqual(["SUMMARY:Long title", "UID:1"]);
    expect(parseContentLine('DTSTART;TZID="America/New_York":20261102T090000')).toEqual({
      name: "DTSTART", params: { TZID: "America/New_York" }, value: "20261102T090000",
    });
    expect(unescapeText("Lunch\\, then \\;sync\\nok")).toBe("Lunch, then ;sync\nok");
    expect(parseDuration("PT1H30M")).toBe(90 * 60_000);
    expect(parseDuration("P1DT2H")).toBe(26 * 3_600_000);
    expect(parseDuration("P1W")).toBe(7 * 86_400_000);
  });
});

describe("ics import — single events", () => {
  it("reads UTC, TZID, floating and all-day times", () => {
    const result = parseIcs(calendar(
      vevent("UID:utc", "SUMMARY:UTC call", "DTSTART:20261102T090000Z", "DTEND:20261102T100000Z"),
      vevent("UID:ny", "SUMMARY:NY call", "DTSTART;TZID=America/New_York:20261102T090000", "DTEND;TZID=America/New_York:20261102T093000"),
      vevent("UID:floating", "SUMMARY:Floating", "DTSTART:20261103T090000", "DURATION:PT45M"),
      vevent("UID:allday", "SUMMARY:Offsite", "DTSTART;VALUE=DATE:20261105", "DTEND;VALUE=DATE:20261107"),
      vevent("UID:win", "SUMMARY:Outlook", "DTSTART;TZID=Pacific Standard Time:20261104T080000", "DTEND;TZID=Pacific Standard Time:20261104T083000"),
    ), WINDOW);
    const byUid = Object.fromEntries(result.instances.map((instance) => [instance.uid, instance]));
    expect(byUid.utc).toMatchObject({ start: "2026-11-02T09:00:00.000Z", end: "2026-11-02T10:00:00.000Z", allDay: false });
    // New York is UTC-5 after DST ends on 2026-11-01.
    expect(byUid.ny).toMatchObject({ start: "2026-11-02T14:00:00.000Z", end: "2026-11-02T14:30:00.000Z" });
    // Floating times use the workspace zone (Istanbul, UTC+3).
    expect(byUid.floating).toMatchObject({ start: "2026-11-03T06:00:00.000Z", end: "2026-11-03T06:45:00.000Z" });
    // All-day: local midnight to midnight, DTEND exclusive.
    expect(byUid.allday).toMatchObject({ start: "2026-11-04T21:00:00.000Z", end: "2026-11-06T21:00:00.000Z", allDay: true });
    expect(byUid.win).toMatchObject({ start: "2026-11-04T16:00:00.000Z" });
    expect(result.warnings).toEqual([]);
  });

  it("skips cancelled, free and zero-length events and keeps their UIDs", () => {
    const result = parseIcs(calendar(
      vevent("UID:c", "SUMMARY:Cancelled", "STATUS:CANCELLED", "DTSTART:20261102T090000Z", "DTEND:20261102T100000Z"),
      vevent("UID:t", "SUMMARY:FYI", "TRANSP:TRANSPARENT", "DTSTART:20261102T090000Z", "DTEND:20261102T100000Z"),
      vevent("UID:z", "SUMMARY:Reminder", "DTSTART:20261102T090000Z"),
      vevent("UID:a", "SUMMARY:Has alarm", "DTSTART:20261102T090000Z", "DTEND:20261102T091500Z", "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:ping", "TRIGGER:-PT10M", "END:VALARM"),
    ), WINDOW);
    expect(result.instances.map((instance) => instance.uid)).toEqual(["a"]);
    expect(result.instances[0].title).toBe("Has alarm");
    expect(result.skipped.map((entry) => entry.reason)).toEqual(["Cancelled", "Marked as free (transparent)", "No duration (zero-length or invalid end)"]);
    expect(result.uids).toEqual(["a", "c", "t", "z"]);
    expect(result.eventCount).toBe(4);
  });

  it("drops events outside the window and warns on unknown zones and non-calendars", () => {
    const result = parseIcs(calendar(
      vevent("UID:old", "DTSTART:20250102T090000Z", "DTEND:20250102T100000Z"),
      vevent("UID:mystery", "DTSTART;TZID=Mars/Olympus:20261102T090000", "DTEND;TZID=Mars/Olympus:20261102T100000"),
    ), WINDOW);
    expect(result.instances.map((instance) => instance.uid)).toEqual(["mystery"]);
    expect(result.instances[0].title).toBe("Busy");
    expect(result.warnings.some((warning) => warning.includes("Mars/Olympus"))).toBe(true);
    expect(parseIcs("hello", WINDOW).warnings[0]).toContain("does not look like an iCalendar file");
  });
});

describe("ics import — recurrence", () => {
  it("expands weekly BYDAY with COUNT in local time across DST", () => {
    const result = parseIcs(calendar(vevent(
      "UID:standup", "SUMMARY:Standup",
      "DTSTART;TZID=America/New_York:20261026T090000", "DTEND;TZID=America/New_York:20261026T091500",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4",
    )), { ...WINDOW, windowStart: "2026-10-01T00:00:00.000Z" });
    // 09:00 local stays 09:00: 13:00Z before DST ends, 14:00Z after.
    expect(result.instances.map((instance) => instance.start)).toEqual([
      "2026-10-26T13:00:00.000Z", "2026-10-28T13:00:00.000Z", "2026-11-02T14:00:00.000Z", "2026-11-04T14:00:00.000Z",
    ]);
  });

  it("honours INTERVAL, UNTIL and EXDATE", () => {
    const result = parseIcs(calendar(vevent(
      "UID:biweekly", "SUMMARY:1:1",
      "DTSTART:20261102T100000Z", "DTEND:20261102T103000Z",
      "RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231T000000Z",
      "EXDATE:20261116T100000Z",
    )), WINDOW);
    expect(result.instances.map((instance) => instance.start.slice(0, 10))).toEqual(["2026-11-02", "2026-11-30", "2026-12-14", "2026-12-28"]);
  });

  it("expands DAILY and monthly ordinal weekdays", () => {
    const daily = parseIcs(calendar(vevent("UID:d", "DTSTART:20261101T080000Z", "DTEND:20261101T081500Z", "RRULE:FREQ=DAILY;INTERVAL=3;COUNT=3")), WINDOW);
    expect(daily.instances.map((instance) => instance.start.slice(0, 10))).toEqual(["2026-11-01", "2026-11-04", "2026-11-07"]);

    const monthly = parseIcs(calendar(vevent("UID:m", "DTSTART:20261110T150000Z", "DTEND:20261110T160000Z", "RRULE:FREQ=MONTHLY;BYDAY=2TU,-1FR;COUNT=4")), { ...WINDOW, windowEnd: "2027-03-01T00:00:00.000Z" });
    expect(monthly.instances.map((instance) => instance.start.slice(0, 10))).toEqual(["2026-11-10", "2026-11-27", "2026-12-08", "2026-12-25"]);

    const monthDay = parseIcs(calendar(vevent("UID:md", "DTSTART:20261130T150000Z", "DTEND:20261130T160000Z", "RRULE:FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3")), { ...WINDOW, windowEnd: "2027-03-01T00:00:00.000Z" });
    expect(monthDay.instances.map((instance) => instance.start.slice(0, 10))).toEqual(["2026-11-30", "2026-12-31", "2027-01-31"]);
  });

  it("replaces an occurrence moved with RECURRENCE-ID and expands all-day series", () => {
    const result = parseIcs(calendar(
      vevent("UID:sync", "SUMMARY:Sync", "DTSTART:20261102T120000Z", "DTEND:20261102T130000Z", "RRULE:FREQ=DAILY;COUNT=3"),
      vevent("UID:sync", "SUMMARY:Sync (moved)", "RECURRENCE-ID:20261103T120000Z", "DTSTART:20261103T160000Z", "DTEND:20261103T170000Z"),
      vevent("UID:ooo", "SUMMARY:Gym", "DTSTART;VALUE=DATE:20261107", "RRULE:FREQ=WEEKLY;COUNT=2"),
    ), { ...WINDOW, defaultTimeZone: "UTC" });
    const sync = result.instances.filter((instance) => instance.uid === "sync");
    expect(sync.map((instance) => [instance.start, instance.title])).toEqual([
      ["2026-11-02T12:00:00.000Z", "Sync"],
      ["2026-11-03T16:00:00.000Z", "Sync (moved)"],
      ["2026-11-04T12:00:00.000Z", "Sync"],
    ]);
    expect(result.instances.filter((instance) => instance.uid === "ooo").map((instance) => [instance.start, instance.end])).toEqual([
      ["2026-11-07T00:00:00.000Z", "2026-11-08T00:00:00.000Z"],
      ["2026-11-14T00:00:00.000Z", "2026-11-15T00:00:00.000Z"],
    ]);
  });

  it("is deterministic and caps the number of instances", () => {
    const text = calendar(vevent("UID:many", "DTSTART:20261101T080000Z", "DTEND:20261101T081500Z", "RRULE:FREQ=DAILY"));
    expect(parseIcs(text, WINDOW)).toEqual(parseIcs(text, WINDOW));
    const capped = parseIcs(text, { ...WINDOW, maxInstances: 5 });
    expect(capped.instances).toHaveLength(5);
    expect(capped.warnings[0]).toContain("first 5");
  });
});
