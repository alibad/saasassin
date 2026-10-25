import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, eventSchema, settingsSchema, taskInputSchema } from "../src/lib/planner/model";

describe("planner input validation", () => {
  it("accepts the default working hours", () => {
    expect(settingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it("rejects an unknown time zone, an inverted day, and an impossible chunk range", () => {
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, timeZone: "Mars/Olympus" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, startMinute: 600, endMinute: 540 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, minChunkMinutes: 90, maxChunkMinutes: 60 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, days: [] }).success).toBe(false);
  });

  it("validates task estimates, priorities and instants", () => {
    const base = { title: "Write spec", durationMinutes: 60, priority: "high" };
    expect(taskInputSchema.parse(base)).toMatchObject({ dependsOn: [], notes: "" });
    expect(taskInputSchema.safeParse({ ...base, durationMinutes: 2 }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...base, priority: "whenever" }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...base, deadline: "next tuesday" }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...base, deadline: "2026-11-02T17:00:00.000Z", lockedStart: null }).success).toBe(true);
  });

  it("requires meetings to end after they start", () => {
    expect(eventSchema.safeParse({ title: "Sync", start: "2026-11-02T10:00:00Z", end: "2026-11-02T09:00:00Z" }).success).toBe(false);
    expect(eventSchema.safeParse({ title: "Sync", start: "2026-11-02T09:00:00Z", end: "2026-11-02T10:00:00Z" }).success).toBe(true);
  });
});
