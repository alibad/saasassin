import { describe, expect, it } from "vitest";

import { buildIcs, escapeIcsText, foldLine, icsDate } from "../src/lib/planner/ics";

describe("planner ICS export", () => {
  const ics = buildIcs({
    calendarName: "Acme, Inc. plan",
    planId: "plan42",
    planVersion: 3,
    generatedAt: "2026-11-02T08:00:00.000Z",
    blocks: [
      { id: "t2:0", title: "Second", start: "2026-11-02T11:00:00.000Z", end: "2026-11-02T12:00:00.000Z" },
      { id: "t1:0", title: "Write spec; draft", start: "2026-11-02T09:00:00.000Z", end: "2026-11-02T10:30:00.000Z", description: "Line one\nLine two" },
    ],
  });

  it("produces a valid, CRLF-terminated calendar with one event per block", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("writes UTC times, stable UIDs, and the plan version as SEQUENCE", () => {
    expect(ics).toContain("DTSTART:20261102T090000Z");
    expect(ics).toContain("DTEND:20261102T103000Z");
    expect(ics).toContain("UID:t1:0-plan42@planner.saasassin.net");
    expect(ics).toContain("SEQUENCE:3");
    expect(ics).toContain("DTSTAMP:20261102T080000Z");
    // Sorted by start time.
    expect(ics.indexOf("Write spec")).toBeLessThan(ics.indexOf("SUMMARY:Second"));
  });

  it("escapes text and folds long lines", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    expect(ics).toContain("SUMMARY:Write spec\\; draft");
    expect(ics).toContain("X-WR-CALNAME:Acme\\, Inc. plan");
    const folded = foldLine(`SUMMARY:${"x".repeat(200)}`);
    for (const physical of folded.split("\r\n")) expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"x".repeat(200)}`);
  });

  it("is deterministic", () => {
    expect(icsDate("2026-01-05T07:08:09.000Z")).toBe("20260105T070809Z");
    const again = buildIcs({
      calendarName: "Acme, Inc. plan",
      planId: "plan42",
      planVersion: 3,
      generatedAt: "2026-11-02T08:00:00.000Z",
      blocks: [
        { id: "t1:0", title: "Write spec; draft", start: "2026-11-02T09:00:00.000Z", end: "2026-11-02T10:30:00.000Z", description: "Line one\nLine two" },
        { id: "t2:0", title: "Second", start: "2026-11-02T11:00:00.000Z", end: "2026-11-02T12:00:00.000Z" },
      ],
    });
    expect(again).toBe(ics);
  });
});
