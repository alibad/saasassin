/**
 * Transcript retention. A workspace either keeps calls indefinitely (null) or
 * deletes calls whose call date is older than N days. Pure so the preview the
 * admin sees is exactly what the delete applies.
 */

export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 3650;

const DAY_MS = 24 * 60 * 60 * 1000;

export function retentionCutoff(now: Date, retentionDays: number) {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

export function callsPastRetention<T extends { id: string; occurredAt: string }>(
  calls: T[],
  now: Date,
  retentionDays: number | null,
): T[] {
  if (retentionDays === null) return [];
  if (!Number.isInteger(retentionDays) || retentionDays < MIN_RETENTION_DAYS || retentionDays > MAX_RETENTION_DAYS) {
    throw new Error(`Retention must be between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS} days.`);
  }
  const cutoff = retentionCutoff(now, retentionDays).getTime();
  return calls
    .filter((call) => new Date(call.occurredAt).getTime() < cutoff)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

/** The date a call becomes due for deletion under the workspace retention period. */
export function retentionDueAt(occurredAt: string, retentionDays: number) {
  return new Date(new Date(occurredAt).getTime() + retentionDays * DAY_MS).toISOString();
}

export const UPCOMING_WINDOW_DAYS = 14;

export type RetentionQueueEntry<T> = T & { dueAt: string; daysOverdue: number };

/**
 * The retention queue: calls already past their retention date (oldest first) and calls that
 * become due within the next two weeks. `due` uses exactly the same rule as callsPastRetention.
 */
export function retentionQueue<T extends { id: string; occurredAt: string }>(calls: T[], now: Date, retentionDays: number | null) {
  if (retentionDays === null) return { retentionDays, due: [] as RetentionQueueEntry<T>[], upcoming: [] as RetentionQueueEntry<T>[] };
  const due = callsPastRetention(calls, now, retentionDays).map((call) => {
    const dueAt = retentionDueAt(call.occurredAt, retentionDays);
    return { ...call, dueAt, daysOverdue: Math.max(0, Math.floor((now.getTime() - new Date(dueAt).getTime()) / DAY_MS)) };
  });
  const dueIds = new Set(due.map((call) => call.id));
  const horizon = now.getTime() + UPCOMING_WINDOW_DAYS * DAY_MS;
  const upcoming = calls
    .filter((call) => !dueIds.has(call.id))
    .map((call) => ({ ...call, dueAt: retentionDueAt(call.occurredAt, retentionDays), daysOverdue: 0 }))
    .filter((call) => new Date(call.dueAt).getTime() <= horizon)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return { retentionDays, due, upcoming };
}
