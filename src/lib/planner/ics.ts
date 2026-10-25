/**
 * Pure RFC 5545 (iCalendar) generator for a Planner schedule.
 * Deterministic: DTSTAMP comes from the plan's creation time, UIDs are stable per
 * plan block, lines are CRLF-terminated and folded at 75 octets.
 */

export type IcsBlock = {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
};

export type IcsInput = {
  calendarName: string;
  planId: string;
  planVersion: number;
  generatedAt: string;
  blocks: IcsBlock[];
};

export function icsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function escapeIcsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

/** Fold a content line to at most 75 octets per physical line (UTF-8 safe). */
export function foldLine(line: string) {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (currentBytes + bytes > limit) {
      out.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(input: IcsInput) {
  const stamp = icsDate(input.generatedAt);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SaaSassin//Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(input.calendarName)}`,
  ];
  const blocks = [...input.blocks].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  for (const block of blocks) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${block.id.replace(/[^A-Za-z0-9:_-]/g, "-")}-${input.planId}@planner.saasassin.net`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(block.start)}`,
      `DTEND:${icsDate(block.end)}`,
      `SUMMARY:${escapeIcsText(block.title)}`,
      ...(block.description ? [`DESCRIPTION:${escapeIcsText(block.description)}`] : []),
      `SEQUENCE:${input.planVersion}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
