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
