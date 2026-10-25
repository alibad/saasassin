/**
 * Quick capture: one task per line, with optional inline tokens.
 *
 *   Write launch brief ~2h !high @2026-11-03 15:00
 *   Review pricing copy ~45m !urgent
 *   Expense report @2026-11-07
 *
 * ~duration (45m, 2h, 1h30m, 90), !priority (urgent|high|medium|low|1-4), @deadline
 * (YYYY-MM-DD with optional HH:MM, interpreted in the workspace time zone; a date
 * without a time means the end of that working day). Pure and deterministic.
 */

import { PRIORITIES, type Priority } from "./scheduler";
import { zonedToUtc } from "./time";

export type CapturedTask = { line: number; title: string; durationMinutes: number; priority: Priority; deadline: string | null };
export type CaptureResult = { tasks: CapturedTask[]; errors: string[] };

const PRIORITY_ALIASES: Record<string, Priority> = { "1": "urgent", "2": "high", "3": "medium", "4": "low" };

export function parseDuration(token: string) {
  const match = /^(?:(\d+)h)?(?:(\d+)m?)?$/i.exec(token);
  if (!match || (!match[1] && !match[2])) return null;
  const minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  return minutes >= 5 && minutes <= 60 * 40 ? minutes : null;
}

export function parseQuickCapture(
  text: string,
  options: { timeZone: string; endMinute: number; defaultDurationMinutes?: number },
): CaptureResult {
  const tasks: CapturedTask[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const source = raw.trim().replace(/^[-*•]\s*/, "").replace(/^\[\s?\]\s*/, "");
    if (!source) return;
    let durationMinutes = options.defaultDurationMinutes ?? 30;
    let priority: Priority = "medium";
    let deadline: string | null = null;
    const words: string[] = [];
    const tokens = source.split(/\s+/);
    for (let position = 0; position < tokens.length; position += 1) {
      const token = tokens[position];
      if (token.startsWith("~") && token.length > 1) {
        const parsed = parseDuration(token.slice(1));
        if (parsed === null) errors.push(`Line ${line}: "${token}" is not a duration (try ~45m or ~1h30m).`);
        else durationMinutes = parsed;
      } else if (token.startsWith("!") && token.length > 1) {
        const value = token.slice(1).toLowerCase();
        const resolved = (PRIORITIES as readonly string[]).includes(value) ? (value as Priority) : PRIORITY_ALIASES[value];
        if (!resolved) errors.push(`Line ${line}: "${token}" is not a priority (urgent, high, medium, low).`);
        else priority = resolved;
      } else if (token.startsWith("@") && /^@\d{4}-\d{2}-\d{2}$/.test(token)) {
        const [year, month, day] = token.slice(1).split("-").map(Number);
        let minute = options.endMinute;
        const next = tokens[position + 1];
        if (next && /^\d{1,2}:\d{2}$/.test(next)) {
          const [hours, minutes] = next.split(":").map(Number);
          minute = hours * 60 + minutes;
          position += 1;
        }
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCMonth() !== month - 1 || minute > 1440) errors.push(`Line ${line}: "${token}" is not a valid date.`);
        else deadline = new Date(zonedToUtc(year, month, day, minute, options.timeZone)).toISOString();
      } else {
        words.push(token);
      }
    }
    const title = words.join(" ").trim();
    if (!title) {
      errors.push(`Line ${line}: add a title.`);
      return;
    }
    tasks.push({ line, title: title.slice(0, 160), durationMinutes, priority, deadline });
  });
  return { tasks, errors };
}
