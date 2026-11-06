import "server-only";

import { createHash } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import { FleetError, type FleetUser } from "@/lib/fleet/platform/session";
import { addTenantMember, listAuditEvents, PRIVILEGED_ROLES } from "@/lib/fleet/platform/tenants";

import {
  audit,
  col,
  computeSchedule,
  plannerContextFor,
  readLatestPlan,
  readMembers,
  readPlan,
  readPlanHistory,
  readSettings,
  readSnapshot,
  savePlanVersion,
} from "./data";
import { buildIcs } from "./ics";
import { parseIcs } from "./ics-import";
import {
  capacitySchema,
  EDITOR_ROLES,
  eventSchema,
  EXPORT_SCHEMA_VERSION,
  icsImportSchema,
  inviteSchema,
  memberFocusSchema,
  occurrenceStatusSchema,
  PLANNER_SLUG,
  planRequestSchema,
  projectSchema,
  settingsSchema,
  taskInputSchema,
  taskPatchSchema,
} from "./model";
import { isOccurrence, type Recurrence } from "./recurrence";
import { diffSchedules } from "./scheduler";

/**
 * Planner use-cases. Every route handler is a thin wrapper around one of these, and the
 * Firestore emulator spec drives the same functions: membership/role check → zod → write → audit.
 */

const bulkSchema = z.object({
  tasks: z.array(taskInputSchema).min(1, "Add at least one task.").max(50, "Capture up to 50 tasks at a time."),
});

function taskRecord(input: z.infer<typeof taskInputSchema>, uid: string) {
  const recurring = Boolean(input.recurrence);
  return {
    ...input,
    projectId: input.projectId ?? null,
    // A repeating task is due each occurrence day; it has no single deadline, lock or prerequisites.
    deadline: recurring ? null : input.deadline ?? null,
    earliestStart: input.earliestStart ?? null,
    lockedStart: recurring ? null : input.lockedStart ?? null,
    dependsOn: recurring ? [] : input.dependsOn,
    assigneeId: input.assigneeId ?? null,
    recurrence: input.recurrence ?? null,
    occurrences: {},
    status: "todo",
    completedAt: null,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  };
}

export async function loadWorkspace(user: FleetUser, tenantId: string) {
  return readSnapshot(await plannerContextFor(user, tenantId));
}

export async function saveSettings(user: FleetUser, tenantId: string, raw: unknown) {
  const ctx = await plannerContextFor(user, tenantId, PRIVILEGED_ROLES);
  const settings = settingsSchema.parse(raw);
  await col(tenantId, "settings").doc("workspace").set(settings);
  await audit(ctx, "settings.updated", { type: "settings", id: "workspace" }, settings);
  return { settings };
}

export async function createProject(user: FleetUser, tenantId: string, raw: unknown) {
  const ctx = await plannerContextFor(user, tenantId, EDITOR_ROLES);
  const input = projectSchema.parse(raw);
  const ref = col(tenantId, "projects").doc();
  await ref.set({ ...input, createdBy: ctx.user.uid, createdAt: FieldValue.serverTimestamp() });
  await audit(ctx, "project.created", { type: "project", id: ref.id }, { name: input.name });
  return { id: ref.id };
}

export async function deleteProject(user: FleetUser, tenantId: string, projectId: string) {
  const ctx = await plannerContextFor(user, tenantId, EDITOR_ROLES);
  const ref = col(tenantId, "projects").doc(projectId);
  const doc = await ref.get();
  if (!doc.exists) throw new FleetError("Project not found.", 404);
  const tasks = await col(tenantId, "tasks").where("projectId", "==", projectId).get();
  const batch = ref.firestore.batch();
  tasks.docs.forEach((task) => batch.update(task.ref, { projectId: null }));
  batch.delete(ref);
  await batch.commit();
  await audit(ctx, "project.deleted", { type: "project", id: projectId }, { name: doc.get("name"), unlinkedTasks: tasks.size });
  return { ok: true };
}

async function assertKnownTasks(tenantId: string, ids: string[]) {
  if (ids.length === 0) return;
  const snapshot = await col(tenantId, "tasks").select("recurrence").get();
  const known = new Map(snapshot.docs.map((doc) => [doc.id, Boolean(doc.get("recurrence"))]));
  if (ids.some((id) => !known.has(id))) throw new FleetError("A dependency points at a task that does not exist.", 400);
  if (ids.some((id) => known.get(id))) throw new FleetError("A task cannot wait on a repeating task.", 400);
}

export async function createTask(user: FleetUser, tenantId: string, raw: unknown) {
  const ctx = await plannerContextFor(user, tenantId, EDITOR_ROLES);
  const input = taskInputSchema.parse(raw);
  await assertKnownTasks(tenantId, input.dependsOn);
  const ref = col(tenantId, "tasks").doc();
  await ref.set(taskRecord(input, ctx.user.uid));
  await audit(ctx, "task.created", { type: "task", id: ref.id }, { title: input.title, durationMinutes: input.durationMinutes });
  return { id: ref.id };
}

/** Quick capture / import: creates many tasks in one atomic batch. */
export async function createTasksBulk(user: FleetUser, tenantId: string, raw: unknown) {
  const ctx = await plannerContextFor(user, tenantId, EDITOR_ROLES);
  const { tasks } = bulkSchema.parse(raw);
  const collection = col(tenantId, "tasks");
  const batch = collection.firestore.batch();
  const ids: string[] = [];
  for (const input of tasks) {
    const ref = collection.doc();
    ids.push(ref.id);
    batch.set(ref, taskRecord(input, ctx.user.uid));
  }
  await batch.commit();
  await audit(ctx, "task.bulk_created", { type: "task", id: ids[0] }, { count: ids.length, ids });
  return { ids };
}

export async function updateTask(user: FleetUser, tenantId: string, taskId: string, raw: unknown) {
  const ctx = await plannerContextFor(user, tenantId, EDITOR_ROLES);
  const patch = taskPatchSchema.parse(raw);
  if (patch.dependsOn?.includes(taskId)) throw new FleetError("A task cannot depend on itself.", 400);
  const ref = col(tenantId, "tasks").doc(taskId);
  const doc = await ref.get();
  if (!doc.exists) throw new FleetError("Task not found.", 404);
  if (patch.dependsOn) await assertKnownTasks(tenantId, patch.dependsOn);
  const update: Record<string, unknown> = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  const recurring = patch.recurrence !== undefined ? Boolean(patch.recurrence) : Boolean(doc.get("recurrence"));
  if (recurring) {
    if (patch.status) throw new FleetError("Complete individual occurrences of a repeating task; the series stays open.", 400);
    Object.assign(update, { dependsOn: [], lockedStart: null, deadline: null });
  }
  if (patch.status === "done" && doc.get("status") !== "done") update.completedAt = FieldValue.serverTimestamp();
  if (patch.status === "todo") update.completedAt = null;
  update.updatedAt = FieldValue.serverTimestamp();
  await ref.update(update);
  const action = patch.status === "done" ? "task.completed" : patch.status === "todo" ? "task.reopened" : "task.updated";
  await audit(ctx, action, { type: "task", id: taskId }, { fields: Object.keys(patch) });
  return { ok: true };
}

/** Completes or reopens one occurrence of a repeating task. The series itself stays open. */
export async function setOccurrenceStatus(user: FleetUser, tenantId: string, taskId: string, raw: unknown) {
  const ctx = await plannerContextFor(user, tenantId, EDITOR_ROLES);
  const input = occurrenceStatusSchema.parse(raw);
  const ref = col(tenantId, "tasks").doc(taskId);
  const doc = await ref.get();
  if (!doc.exists) throw new FleetError("Task not found.", 404);
  const rule = doc.get("recurrence") as Recurrence | null;
  if (!rule) throw new FleetError("This task does not repeat.", 400);
  if (!isOccurrence(rule, input.date)) throw new FleetError("That date is not an occurrence of this series.", 400);
  const path = `occurrences.${input.date}`;
  await ref.update({
    [path]:
      input.status === "done"
        ? { completedAt: FieldValue.serverTimestamp(), actualMinutes: input.actualMinutes ?? null, completedBy: ctx.user.uid }
        : FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await audit(
    ctx,
    input.status === "done" ? "task.occurrence_completed" : "task.occurrence_reopened",
    { type: "task", id: taskId },
    { date: input.date, actualMinutes: input.actualMinutes ?? null },
  );
  return { ok: true };
}

export async function deleteTask(user: FleetUser, tenantId: string, taskId: string) {
  const ctx = await plannerContextFor(user, tenantId, EDITOR_ROLES);
  const ref = col(tenantId, "tasks").doc(taskId);
  const doc = await ref.get();
  if (!doc.exists) throw new FleetError("Task not found.", 404);
  const dependents = await col(tenantId, "tasks").where("dependsOn", "array-contains", taskId).get();
  const batch = ref.firestore.batch();
  dependents.docs.forEach((dependent) => batch.update(dependent.ref, { dependsOn: FieldValue.arrayRemove(taskId) }));
  batch.delete(ref);
  await batch.commit();
  await audit(ctx, "task.deleted", { type: "task", id: taskId }, { title: doc.get("title"), unlinkedDependents: dependents.size });
  return { ok: true };
}

export async function createEvent(user: FleetUser, tenantId: string, raw: unknown) {
  const ctx = await plannerContextFor(user, tenantId, EDITOR_ROLES);
  const input = eventSchema.parse(raw);
  const ref = col(tenantId, "events").doc();
  const record = {
    title: input.title,
    start: new Date(input.start).toISOString(),
    end: new Date(input.end).toISOString(),
    memberId: input.memberId ?? null,
    source: "manual",
    createdBy: ctx.user.uid,
    createdAt: FieldValue.serverTimestamp(),
  };
  await ref.set(record);
  await audit(ctx, "event.created", { type: "event", id: ref.id }, { title: input.title, start: record.start, end: record.end });
  return { id: ref.id };
}

export async function deleteEvent(user: FleetUser, tenantId: string, eventId: string) {
  const ctx = await plannerContextFor(user, tenantId, EDITOR_ROLES);
  const ref = col(tenantId, "events").doc(eventId);
  const doc = await ref.get();
  if (!doc.exists) throw new FleetError("Event not found.", 404);
  await ref.delete();
  await audit(ctx, "event.deleted", { type: "event", id: eventId }, { title: doc.get("title") });
  return { ok: true };
}

const IMPORT_WINDOW_DAYS = 60;

/**
 * Imports busy time from an .ics file. Idempotent by UID: every instance gets a deterministic id
 * from (who is busy, UID, start), and re-importing a UID replaces exactly that UID's instances.
 */
export async function importCalendar(user: FleetUser, tenantId: string, raw: unknown, now = new Date().toISOString()) {
  const ctx = await plannerContextFor(user, tenantId, EDITOR_ROLES);
  const input = icsImportSchema.parse(raw);
  const memberId = input.memberId ?? null;
  if (memberId && !(await readMembers(tenantId)).some((member) => member.uid === memberId)) throw new FleetError("Member not found.", 404);
  const settings = await readSettings(tenantId);
  const nowMs = Date.parse(now);
  const parsed = parseIcs(input.ics, {
    defaultTimeZone: settings.timeZone,
    windowStart: new Date(nowMs - 86_400_000).toISOString(),
    windowEnd: new Date(nowMs + IMPORT_WINDOW_DAYS * 86_400_000).toISOString(),
  });
  if (parsed.eventCount === 0) throw new FleetError("No events were found in that file. Export an .ics calendar file and try again.", 400);

  const scope = memberId ?? "everyone";
  const docId = (uid: string, start: string) =>
    `ics_${createHash("sha256").update(`${scope}\n${uid}`).digest("hex").slice(0, 24)}_${start.replace(/[-:.]/g, "")}`;
  const events = col(tenantId, "events");
  const existing = await events.where("source", "==", "ics").get();
  const existingById = new Map(existing.docs.map((doc) => [doc.id, doc]));
  const uids = new Set(parsed.uids);
  const next = new Map(parsed.instances.map((instance) => [docId(instance.uid, instance.start), instance]));

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const writes: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
  for (const [id, instance] of next) {
    const current = existingById.get(id);
    if (current && current.get("title") === instance.title && current.get("end") === instance.end && (current.get("memberId") ?? null) === memberId) {
      unchanged += 1;
      continue;
    }
    if (current) updated += 1;
    else created += 1;
    writes.push((batch) =>
      batch.set(events.doc(id), {
        title: instance.title,
        start: instance.start,
        end: instance.end,
        allDay: instance.allDay,
        memberId,
        source: "ics",
        importUid: instance.uid,
        importScope: scope,
        createdBy: ctx.user.uid,
        createdAt: current?.get("createdAt") ?? FieldValue.serverTimestamp(),
        importedAt: FieldValue.serverTimestamp(),
      }),
    );
  }
  const stale = existing.docs.filter((doc) => doc.get("importScope") === scope && uids.has(doc.get("importUid")) && !next.has(doc.id));
  for (const doc of stale) writes.push((batch) => batch.delete(doc.ref));
  for (let index = 0; index < writes.length; index += 400) {
    const batch = events.firestore.batch();
    writes.slice(index, index + 400).forEach((write) => write(batch));
    await batch.commit();
  }

  const summary = {
    fileName: input.fileName,
    memberId,
    eventCount: parsed.eventCount,
    instances: parsed.instances.length,
    created,
    updated,
    unchanged,
    removed: stale.length,
    skipped: parsed.skipped,
    warnings: parsed.warnings,
  };
  const log = col(tenantId, "icsImports").doc();
  await log.set({ ...summary, importedBy: { uid: ctx.user.uid, email: ctx.user.email }, importedAt: FieldValue.serverTimestamp() });
  await audit(ctx, "calendar.imported", { type: "import", id: log.id }, {
    fileName: input.fileName, created, updated, unchanged, removed: stale.length, skipped: parsed.skipped.length,
  });
  return { importId: log.id, ...summary };
}

export async function listMembers(user: FleetUser, tenantId: string) {
  await plannerContextFor(user, tenantId);
  return { members: await readMembers(tenantId) };
}

export async function inviteMember(user: FleetUser, tenantId: string, raw: unknown) {
  await plannerContextFor(user, tenantId, PRIVILEGED_ROLES);
  const input = inviteSchema.parse(raw);
  return { member: await addTenantMember(PLANNER_SLUG, tenantId, user, input) };
}

/** Sets a person's daily task capacity used by the scheduler. */
export async function setMemberCapacity(user: FleetUser, tenantId: string, uid: string, raw: unknown) {
  const ctx = await plannerContextFor(user, tenantId, PRIVILEGED_ROLES);
  const input = capacitySchema.parse(raw);
  const members = await readMembers(tenantId);
  if (!members.some((member) => member.uid === uid)) throw new FleetError("Member not found.", 404);
  await col(tenantId, "capacity").doc(uid).set({ capacityMinutesPerDay: input.capacityMinutesPerDay }, { merge: true });
  await audit(ctx, "member.capacity_updated", { type: "membership", id: uid }, input);
  return { ok: true };
}

/** Sets a person's preferred deep/shallow hours. Admins can set anyone's; editors can set their own. */
export async function setMemberFocus(user: FleetUser, tenantId: string, uid: string, raw: unknown) {
  const ctx = await plannerContextFor(user, tenantId);
  const self = ctx.user.uid === uid && EDITOR_ROLES.includes(ctx.role);
  if (!self && !PRIVILEGED_ROLES.includes(ctx.role)) throw new FleetError("Your role does not allow this action.", 403);
  const input = memberFocusSchema.parse(raw);
  const members = await readMembers(tenantId);
  if (!members.some((member) => member.uid === uid)) throw new FleetError("Member not found.", 404);
  await col(tenantId, "capacity").doc(uid).set({ focus: input.focus }, { merge: true });
  await audit(ctx, "member.focus_updated", { type: "membership", id: uid }, { focus: input.focus });
  return { ok: true };
}

/** Runs the scheduler against stored tasks and meetings and saves a new immutable plan version. */
export async function runScheduler(user: FleetUser, tenantId: string, raw: unknown, now = new Date().toISOString()) {
  const ctx = await plannerContextFor(user, tenantId, EDITOR_ROLES);
  const body = planRequestSchema.parse(raw ?? {});
  const { result } = await computeSchedule(tenantId, now);
  const saved = await savePlanVersion(ctx, now, result, body.note);
  return { plan: saved, result };
}

/** What-if: computes a schedule (optionally with hypothetical busy time) without saving anything. */
export async function previewSchedule(user: FleetUser, tenantId: string, raw: unknown, now = new Date().toISOString()) {
  await plannerContextFor(user, tenantId);
  const body = planRequestSchema.parse(raw ?? {});
  const [{ result }, latest] = await Promise.all([computeSchedule(tenantId, now, body.extraBusy), readLatestPlan(tenantId)]);
  return { result, diff: diffSchedules(latest?.result ?? null, result), basedOnVersion: latest?.version ?? null };
}

/** Undo a replan: re-issues an earlier plan as a new version. History is never rewritten. */
export async function restorePlanVersion(user: FleetUser, tenantId: string, planId: string) {
  const ctx = await plannerContextFor(user, tenantId, EDITOR_ROLES);
  const plan = await readPlan(tenantId, planId);
  if (!plan) throw new FleetError("Plan not found.", 404);
  const saved = await savePlanVersion(ctx, plan.now, plan.result, `Restored from v${plan.version}`);
  return { plan: saved };
}

export async function listPlanHistory(user: FleetUser, tenantId: string) {
  await plannerContextFor(user, tenantId);
  return { history: await readPlanHistory(tenantId) };
}

export async function listAudit(user: FleetUser, tenantId: string, limit = 100) {
  await plannerContextFor(user, tenantId);
  return { events: await listAuditEvents(PLANNER_SLUG, tenantId, limit) };
}

export async function planIcs(user: FleetUser, tenantId: string, planId: string) {
  const ctx = await plannerContextFor(user, tenantId);
  const plan = await readPlan(tenantId, planId);
  if (!plan) throw new FleetError("Plan not found.", 404);
  const ics = buildIcs({
    calendarName: `${ctx.tenantName || "Planner"} plan v${plan.version}`,
    planId: plan.id,
    planVersion: plan.version,
    generatedAt: plan.createdAt ?? plan.now,
    blocks: plan.result.blocks.map((block) => ({
      id: block.id,
      title: block.title,
      start: block.start,
      end: block.end,
      description: block.reasons.join("\n"),
    })),
  });
  return { ics, version: plan.version };
}

/** Collections included verbatim in the export. Secrets are redacted by `redact`. */
export const EXPORT_COLLECTIONS = ["settings", "projects", "tasks", "events", "capacity", "plans", "icsImports"] as const;

/** Complete, versioned JSON export of every Planner record in the workspace. */
export async function exportWorkspace(user: FleetUser, tenantId: string) {
  const ctx = await plannerContextFor(user, tenantId);
  const data: Record<string, unknown[]> = {};
  for (const name of EXPORT_COLLECTIONS) {
    const snapshot = await col(tenantId, name).get();
    data[name] = snapshot.docs.map((doc) => ({ id: doc.id, ...(toPortable(doc.data()) as Record<string, unknown>) }));
  }
  data.members = await readMembers(tenantId);
  data.auditEvents = await listAuditEvents(PLANNER_SLUG, tenantId, 1000);
  const files = Object.entries(data).map(([name, records]) => ({
    path: `${name}.json`,
    schema: `net.saasassin.planner.${name}/${EXPORT_SCHEMA_VERSION}`,
    records: records.length,
  }));
  await audit(ctx, "workspace.exported", { type: "tenant", id: tenantId }, { files: files.length });
  return { manifest: buildExportManifest(PLANNER_SLUG, tenantId, files), data };
}
