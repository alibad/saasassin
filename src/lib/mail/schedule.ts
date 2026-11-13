/**
 * Send later. A scheduled draft is a queued draft with a time; it stays editable and cancellable
 * until then. No sending provider is configured, so at its time nothing is sent — the draft then
 * reads "due, not sent" instead of pretending to have gone out.
 */

export const MIN_SCHEDULE_LEAD_MS = 60_000;
export const MAX_SCHEDULE_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

export type ScheduleStatus = "draft" | "send_blocked" | "queued" | "due_unsent";

export function scheduleStatus(draft: { status: string; scheduledFor?: string | null }, now: Date): ScheduleStatus {
  if (draft.status === "scheduled" && draft.scheduledFor) return Date.parse(draft.scheduledFor) > now.getTime() ? "queued" : "due_unsent";
  return draft.status === "send_blocked" ? "send_blocked" : "draft";
}

/** Returns the normalized ISO time or an error message. */
export function validateScheduleTime(at: string, now: Date): { at: string } | { error: string } {
  const time = Date.parse(at);
  if (!Number.isFinite(time)) return { error: "Pick a valid time." };
  if (time < now.getTime() + MIN_SCHEDULE_LEAD_MS) return { error: "Schedule at least a minute from now." };
  if (time > now.getTime() + MAX_SCHEDULE_AHEAD_MS) return { error: "Schedule within the next year." };
  return { at: new Date(time).toISOString() };
}

/** Editing a queued draft keeps its slot; editing one whose time has passed returns it to Drafts. */
export function scheduleAfterEdit(draft: { status: string; scheduledFor?: string | null }, now: Date) {
  const state = scheduleStatus(draft, now);
  if (state === "queued") return { status: "scheduled", scheduledFor: draft.scheduledFor ?? null, cleared: false };
  return { status: "draft", scheduledFor: null, cleared: state === "due_unsent" };
}

export const SCHEDULE_NOT_CONFIGURED = "No email account is connected yet, so nothing will be sent at this time. The draft stays queued here until you edit or cancel it.";
