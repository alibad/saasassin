import { z } from "zod";

import { PRIORITIES, type ScheduleResult } from "./scheduler";
import { isValidTimeZone } from "./time";

export const PLANNER_SLUG = "planner";
export const EXPORT_SCHEMA_VERSION = "1.0.0";

/** Roles that can change tasks, meetings and plans. Viewers are read-only. */
export const EDITOR_ROLES = ["owner", "admin", "member"];

const instant = z.string().datetime({ offset: true, message: "Use a valid date and time." });
const optionalInstant = instant.nullable().optional();

export const settingsSchema = z
  .object({
    timeZone: z.string().refine(isValidTimeZone, "Choose a valid IANA time zone."),
    days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one working day.").max(7),
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(0).max(1440),
    horizonDays: z.number().int().min(1).max(60),
    minChunkMinutes: z.number().int().min(5).max(240),
    maxChunkMinutes: z.number().int().min(15).max(480),
    bufferMinutes: z.number().int().min(0).max(120).default(0),
  })
  .refine((value) => value.endMinute > value.startMinute, "The working day must end after it starts.")
  .refine((value) => value.maxChunkMinutes >= value.minChunkMinutes, "Maximum focus block must be at least the minimum.");

export type PlannerSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: PlannerSettings = {
  timeZone: "UTC",
  days: [1, 2, 3, 4, 5],
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  horizonDays: 14,
  minChunkMinutes: 30,
  maxChunkMinutes: 120,
  bufferMinutes: 0,
};

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Name the project.").max(80),
  description: z.string().trim().max(500).default(""),
});

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title.").max(160),
  projectId: z.string().trim().max(64).nullable().optional(),
  durationMinutes: z.number().int().min(5, "Estimate at least 5 minutes.").max(60 * 40),
  priority: z.enum(PRIORITIES),
  deadline: optionalInstant,
  earliestStart: optionalInstant,
  lockedStart: optionalInstant,
  dependsOn: z.array(z.string().max(64)).max(25).default([]),
  assigneeId: z.string().max(128).nullable().optional(),
  notes: z.string().trim().max(2000).default(""),
});

export const taskPatchSchema = taskInputSchema.partial().extend({
  status: z.enum(["todo", "done"]).optional(),
});

export const eventSchema = z
  .object({
    title: z.string().trim().min(1, "Name the event.").max(160),
    start: instant,
    end: instant,
    memberId: z.string().max(128).nullable().optional(),
  })
  .refine((value) => Date.parse(value.end) > Date.parse(value.start), "The event must end after it starts.");

export const capacitySchema = z.object({
  capacityMinutesPerDay: z.number().int().min(15).max(1440).nullable(),
});

export const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  role: z.enum(["admin", "member", "viewer"]),
});

export const planRequestSchema = z.object({
  /** Optional what-if overrides that are not saved: extra busy time and a horizon. */
  extraBusy: z
    .array(z.object({ title: z.string().trim().min(1).max(160), start: instant, end: instant }))
    .max(10)
    .default([]),
  note: z.string().trim().max(200).default(""),
});

export type Project = { id: string; name: string; description: string; createdAt: string | null };

export type Task = {
  id: string;
  title: string;
  projectId: string | null;
  durationMinutes: number;
  priority: (typeof PRIORITIES)[number];
  deadline: string | null;
  earliestStart: string | null;
  lockedStart: string | null;
  dependsOn: string[];
  assigneeId: string | null;
  notes: string;
  status: "todo" | "done";
  completedAt: string | null;
  createdAt: string | null;
};

export type CalendarEvent = { id: string; title: string; start: string; end: string; memberId: string | null };

export type PlannerMember = {
  uid: string;
  email: string;
  name: string;
  role: string;
  capacityMinutesPerDay: number | null;
};

export type PlanSummary = {
  id: string;
  version: number;
  createdAt: string | null;
  createdBy: { uid: string; email: string };
  inputHash: string;
  note: string;
  stats: ScheduleResult["stats"];
};

export type Plan = PlanSummary & { result: ScheduleResult; now: string };

export type PlannerSnapshot = {
  tenant: { id: string; name: string };
  role: string;
  canEdit: boolean;
  canAdmin: boolean;
  user: { uid: string; email: string };
  settings: PlannerSettings;
  projects: Project[];
  tasks: Task[];
  events: CalendarEvent[];
  members: PlannerMember[];
  latestPlan: Plan | null;
  history: PlanSummary[];
};

export const PRIORITY_LABELS: Record<(typeof PRIORITIES)[number], string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};
