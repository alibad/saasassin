import { describe, expect, it } from "vitest";

import { scheduleAfterEdit, scheduleStatus, validateScheduleTime } from "../src/lib/mail/schedule";

const now = new Date("2026-11-06T12:00:00.000Z");

describe("send later", () => {
  it("reports queued until the time, then due and not sent", () => {
    expect(scheduleStatus({ status: "scheduled", scheduledFor: "2026-11-06T13:00:00.000Z" }, now)).toBe("queued");
    expect(scheduleStatus({ status: "scheduled", scheduledFor: "2026-11-06T12:00:00.000Z" }, now)).toBe("due_unsent");
    expect(scheduleStatus({ status: "scheduled", scheduledFor: null }, now)).toBe("draft");
    expect(scheduleStatus({ status: "send_blocked" }, now)).toBe("send_blocked");
    expect(scheduleStatus({ status: "draft" }, now)).toBe("draft");
  });

  it("accepts times from a minute ahead to a year ahead", () => {
    expect(validateScheduleTime("2026-11-06T12:00:30.000Z", now)).toEqual({ error: "Schedule at least a minute from now." });
    expect(validateScheduleTime("2028-01-01T00:00:00.000Z", now)).toEqual({ error: "Schedule within the next year." });
    expect(validateScheduleTime("soon", now)).toEqual({ error: "Pick a valid time." });
    expect(validateScheduleTime("2026-11-07T08:00:00+01:00", now)).toEqual({ at: "2026-11-07T07:00:00.000Z" });
  });

  it("keeps a queued slot through edits but returns a past-due draft to Drafts", () => {
    expect(scheduleAfterEdit({ status: "scheduled", scheduledFor: "2026-11-07T00:00:00.000Z" }, now)).toEqual({ status: "scheduled", scheduledFor: "2026-11-07T00:00:00.000Z", cleared: false });
    expect(scheduleAfterEdit({ status: "scheduled", scheduledFor: "2026-11-05T00:00:00.000Z" }, now)).toEqual({ status: "draft", scheduledFor: null, cleared: true });
    expect(scheduleAfterEdit({ status: "send_blocked" }, now)).toEqual({ status: "draft", scheduledFor: null, cleared: false });
  });
});
