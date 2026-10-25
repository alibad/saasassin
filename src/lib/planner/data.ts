import "server-only";

import { FieldValue, type DocumentData } from "firebase-admin/firestore";

import { toPortable } from "@/lib/fleet/platform/export";
import { FleetError, requireFleetUser, type FleetUser } from "@/lib/fleet/platform/session";
import {
  appendAuditEvent,
  listTenantMembers,
  PRIVILEGED_ROLES,
  requireTenantMember,
  tenantCollection,
  tenantRef,
} from "@/lib/fleet/platform/tenants";

import {
  DEFAULT_SETTINGS,
  EDITOR_ROLES,
  PLANNER_SLUG,
  settingsSchema,
  type CalendarEvent,
  type Plan,
  type PlannerMember,
  type PlannerSettings,
  type PlannerSnapshot,
  type PlanSummary,
  type Project,
  type Task,
} from "./model";
import { schedule, type BusyBlock, type ScheduleResult } from "./scheduler";

export type PlannerContext = { user: FleetUser; tenantId: string; role: string; tenantName: string };

/** Session → membership (→ role) for every planner route. Never trusts the browser. */
export async function plannerContext(tenantId: string, roles?: string[]): Promise<PlannerContext> {
  const user = await requireFleetUser(PLANNER_SLUG);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tenantId)) throw new FleetError("Workspace not found.", 404);
  const { tenant, role } = await requireTenantMember(PLANNER_SLUG, tenantId, user, roles);
  return { user, tenantId, role, tenantName: String(tenant.name ?? "") };
}

export const col = (tenantId: string, name: string) => tenantCollection(PLANNER_SLUG, tenantId, name);

export function audit(ctx: PlannerContext, action: string, target: { type: string; id: string }, details: Record<string, unknown> = {}) {
  return appendAuditEvent(PLANNER_SLUG, ctx.tenantId, ctx.user, action, target, details);
}

function str(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function isoOrNull(value: unknown) {
  const portable = toPortable(value);
  return typeof portable === "string" ? portable : null;
}

export async function readSettings(tenantId: string): Promise<PlannerSettings> {
  const doc = await col(tenantId, "settings").doc("workspace").get();
  if (!doc.exists) return DEFAULT_SETTINGS;
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...doc.data() });
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function readProjects(tenantId: string): Promise<Project[]> {
  const snapshot = await col(tenantId, "projects").orderBy("createdAt").get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    name: str(doc.get("name"), "Untitled project"),
    description: str(doc.get("description")),
    createdAt: isoOrNull(doc.get("createdAt")),
  }));
}

export async function readTasks(tenantId: string): Promise<Task[]> {
  const snapshot = await col(tenantId, "tasks").orderBy("createdAt").get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      title: str(data.title, "Untitled task"),
      projectId: data.projectId ?? null,
      durationMinutes: Number(data.durationMinutes ?? 30),
      priority: data.priority ?? "medium",
      deadline: data.deadline ?? null,
      earliestStart: data.earliestStart ?? null,
      lockedStart: data.lockedStart ?? null,
      dependsOn: Array.isArray(data.dependsOn) ? data.dependsOn.map(String) : [],
      assigneeId: data.assigneeId ?? null,
      notes: str(data.notes),
      status: data.status === "done" ? "done" : "todo",
      completedAt: isoOrNull(data.completedAt),
      createdAt: isoOrNull(data.createdAt),
    } satisfies Task;
  });
}

export async function readEvents(tenantId: string): Promise<CalendarEvent[]> {
  const snapshot = await col(tenantId, "events").orderBy("start").get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    title: str(doc.get("title"), "Busy"),
    start: str(doc.get("start")),
    end: str(doc.get("end")),
    memberId: doc.get("memberId") ?? null,
  }));
}

export async function readMembers(tenantId: string): Promise<PlannerMember[]> {
  const [memberships, capacities] = await Promise.all([
    listTenantMembers(PLANNER_SLUG, tenantId),
    col(tenantId, "capacity").get(),
  ]);
  const capacity = new Map(capacities.docs.map((doc) => [doc.id, doc.get("capacityMinutesPerDay") ?? null]));
  return memberships
    .filter((member) => member.status === "active")
    .map((member) => ({
      uid: member.uid,
      email: member.email,
      name: member.name || member.email,
      role: String(member.role),
      capacityMinutesPerDay: (capacity.get(member.uid) as number | null | undefined) ?? null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

function planSummary(id: string, data: DocumentData): PlanSummary {
  return {
    id,
    version: Number(data.version ?? 0),
    createdAt: isoOrNull(data.createdAt),
    createdBy: data.createdBy ?? { uid: "", email: "" },
    inputHash: str(data.inputHash),
    note: str(data.note),
    stats: data.stats ?? { scheduledTasks: 0, lateTasks: 0, unscheduledTasks: 0, scheduledMinutes: 0, freeMinutes: 0 },
  };
}

export async function readLatestPlan(tenantId: string): Promise<Plan | null> {
  const snapshot = await col(tenantId, "plans").orderBy("version", "desc").limit(1).get();
  const doc = snapshot.docs[0];
  if (!doc) return null;
  const data = doc.data();
  return { ...planSummary(doc.id, data), now: str(data.now), result: data.result as ScheduleResult };
}

export async function readPlanHistory(tenantId: string, limit = 25): Promise<PlanSummary[]> {
  const snapshot = await col(tenantId, "plans")
    .orderBy("version", "desc")
    .select("version", "createdAt", "createdBy", "inputHash", "note", "stats")
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => planSummary(doc.id, doc.data()));
}

export async function readSnapshot(ctx: PlannerContext): Promise<PlannerSnapshot> {
  const [settings, projects, tasks, events, members, latestPlan, history] = await Promise.all([
    readSettings(ctx.tenantId),
    readProjects(ctx.tenantId),
    readTasks(ctx.tenantId),
    readEvents(ctx.tenantId),
    readMembers(ctx.tenantId),
    readLatestPlan(ctx.tenantId),
    readPlanHistory(ctx.tenantId),
  ]);
  return {
    tenant: { id: ctx.tenantId, name: ctx.tenantName },
    role: ctx.role,
    canEdit: EDITOR_ROLES.includes(ctx.role),
    canAdmin: PRIVILEGED_ROLES.includes(ctx.role),
    user: { uid: ctx.user.uid, email: ctx.user.email },
    settings,
    projects,
    tasks,
    events,
    members,
    latestPlan,
    history,
  };
}

/** Builds scheduler input from stored state. `extraBusy` supports what-if previews. */
export async function computeSchedule(tenantId: string, now: string, extraBusy: Array<{ title: string; start: string; end: string }> = []) {
  const [settings, tasks, events, members] = await Promise.all([
    readSettings(tenantId),
    readTasks(tenantId),
    readEvents(tenantId),
    readMembers(tenantId),
  ]);
  const busy: BusyBlock[] = [
    ...events.map((event) => ({ id: event.id, title: event.title, start: event.start, end: event.end, memberId: event.memberId })),
    ...extraBusy.map((block, index) => ({ id: `what-if-${index}`, title: block.title, start: block.start, end: block.end })),
  ];
  const result = schedule({
    now,
    horizonDays: settings.horizonDays,
    workingHours: {
      timeZone: settings.timeZone,
      days: settings.days,
      startMinute: settings.startMinute,
      endMinute: settings.endMinute,
    },
    minChunkMinutes: settings.minChunkMinutes,
    maxChunkMinutes: settings.maxChunkMinutes,
    bufferMinutes: settings.bufferMinutes,
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      durationMinutes: task.durationMinutes,
      priority: task.priority,
      status: task.status,
      deadline: task.deadline,
      earliestStart: task.earliestStart,
      lockedStart: task.lockedStart,
      dependsOn: task.dependsOn,
      assigneeId: task.assigneeId,
      projectId: task.projectId,
    })),
    busy,
    members: members.map((member) => ({ id: member.uid, name: member.name, capacityMinutesPerDay: member.capacityMinutesPerDay })),
  });
  return { result, settings };
}

/** Persists a new immutable plan version (transactional version counter). */
export async function savePlanVersion(ctx: PlannerContext, now: string, result: ScheduleResult, note: string) {
  const firestore = tenantRef(PLANNER_SLUG, ctx.tenantId).firestore;
  const counter = col(ctx.tenantId, "settings").doc("planCounter");
  const planRef = col(ctx.tenantId, "plans").doc();
  const version = await firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(counter);
    const next = Number(current.get("version") ?? 0) + 1;
    transaction.set(counter, { version: next });
    transaction.set(planRef, {
      version: next,
      now,
      note,
      inputHash: result.inputHash,
      engineVersion: result.engineVersion,
      stats: result.stats,
      result: JSON.parse(JSON.stringify(result)),
      createdBy: { uid: ctx.user.uid, email: ctx.user.email },
      createdAt: FieldValue.serverTimestamp(),
    });
    return next;
  });
  await audit(ctx, "plan.generated", { type: "plan", id: planRef.id }, { version, inputHash: result.inputHash, ...result.stats });
  return { id: planRef.id, version };
}

export async function readPlan(tenantId: string, planId: string): Promise<Plan | null> {
  const doc = await col(tenantId, "plans").doc(planId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return { ...planSummary(doc.id, data), now: str(data.now), result: data.result as ScheduleResult };
}
