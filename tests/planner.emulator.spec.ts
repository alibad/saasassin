import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Golden path for SaaSassin Planner against the Firestore emulator. Never runs against production.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("planner.emulator.spec.ts only runs under the Firestore emulator (FIRESTORE_EMULATOR_HOST is not set).");
}
process.env.FIREBASE_PROJECT_ID = "demo-saasassin";

const app = initializeApp({ projectId: "demo-saasassin" }, "planner-golden-path");
const db: Firestore = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => db,
  getAdminAuth: () => null,
  isFirebaseConfigured: () => true,
}));

const platform = await import("@/lib/fleet/platform/tenants");
const { FleetError } = await import("@/lib/fleet/platform/session");
const service = await import("@/lib/planner/service");

const owner = { uid: "pl-owner", email: "owner@example.com", name: "Olivia Owner" };
const member = { uid: "pl-member", email: "member@example.com", name: "Max Member" };
const viewer = { uid: "pl-viewer", email: "viewer@example.com", name: "Vic Viewer" };
const outsider = { uid: "pl-outsider", email: "outsider@example.com", name: "Oscar Outsider" };
const rival = { uid: "pl-rival", email: "rival@example.com", name: "Rita Rival" };

// Monday 2026-11-02 09:00 UTC; the workspace works Mon–Fri 09:00–17:00 UTC.
const NOW = "2026-11-02T09:00:00.000Z";
const SETTINGS = {
  timeZone: "UTC",
  days: [1, 2, 3, 4, 5],
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  horizonDays: 14,
  minChunkMinutes: 30,
  maxChunkMinutes: 120,
  bufferMinutes: 0,
};

let tenantId = "";
let rivalTenantId = "";
let rivalTaskId = "";
let projectId = "";
const ids = { spec: "", build: "", review: "", errand: "", standup: "" };
const planIds: string[] = [];

async function expectFleetError(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (cause: unknown) => cause);
  expect(error).toBeInstanceOf(FleetError);
  expect((error as InstanceType<typeof FleetError>).status).toBe(status);
}

async function auditActions() {
  const snapshot = await db.collection(`products/planner/tenants/${tenantId}/auditEvents`).get();
  return snapshot.docs.map((doc) => String(doc.get("action")));
}

async function planCount() {
  return (await db.collection(`products/planner/tenants/${tenantId}/plans`).get()).size;
}

beforeAll(async () => {
  tenantId = (await platform.createTenant("planner", owner, "Acme Plans")).id;
  rivalTenantId = (await platform.createTenant("planner", rival, "Rival Plans")).id;
  // addTenantMember needs Firebase Auth, so seed the low-role memberships directly.
  for (const [person, role] of [[member, "member"], [viewer, "viewer"]] as const) {
    await db.doc(`products/planner/tenants/${tenantId}/memberships/${person.uid}`).set({
      uid: person.uid, email: person.email, name: person.name, role, status: "active",
    });
  }
  rivalTaskId = (await service.createTask(rival, rivalTenantId, { title: "Rival secret", durationMinutes: 30, priority: "high" })).id;
});

afterAll(async () => {
  await Promise.all(getApps().map((existing) => deleteApp(existing)));
});

describe("planner golden path (Firestore emulator)", () => {
  it("saves workspace settings for admins only", async () => {
    await service.saveSettings(owner, tenantId, SETTINGS);
    await expectFleetError(service.saveSettings(member, tenantId, SETTINGS), 403);
    await expectFleetError(service.saveSettings(viewer, tenantId, SETTINGS), 403);
    await expectFleetError(service.saveSettings(outsider, tenantId, SETTINGS), 404);
    await expectFleetError(service.saveSettings(rival, tenantId, SETTINGS), 404);
    await expect(service.saveSettings(owner, tenantId, { ...SETTINGS, endMinute: 8 * 60 })).rejects.toThrow();
    const snapshot = await service.loadWorkspace(owner, tenantId);
    expect(snapshot.settings).toMatchObject(SETTINGS);
    expect(snapshot.canAdmin).toBe(true);
    expect((await service.loadWorkspace(viewer, tenantId)).canEdit).toBe(false);
  });

  it("creates projects and tasks with dependencies; viewers cannot", async () => {
    projectId = (await service.createProject(owner, tenantId, { name: "Launch" })).id;
    await expectFleetError(service.createProject(viewer, tenantId, { name: "Nope" }), 403);

    ids.spec = (await service.createTask(owner, tenantId, { title: "Write spec", durationMinutes: 120, priority: "high", projectId })).id;
    ids.build = (await service.createTask(member, tenantId, {
      title: "Build feature", durationMinutes: 180, priority: "high", projectId, dependsOn: [ids.spec],
    })).id;
    ids.review = (await service.createTask(owner, tenantId, {
      title: "Review", durationMinutes: 60, priority: "medium", assigneeId: member.uid, deadline: "2026-11-04T17:00:00.000Z",
    })).id;
    const bulk = await service.createTasksBulk(owner, tenantId, { tasks: [{ title: "Expense report", durationMinutes: 30, priority: "low" }] });
    ids.errand = bulk.ids[0];

    await expectFleetError(service.createTask(viewer, tenantId, { title: "x", durationMinutes: 30, priority: "low" }), 403);
    await expectFleetError(service.createTask(outsider, tenantId, { title: "x", durationMinutes: 30, priority: "low" }), 404);
    // A dependency on another tenant's task id is refused, not silently stored.
    await expectFleetError(service.createTask(owner, tenantId, { title: "x", durationMinutes: 30, priority: "low", dependsOn: [rivalTaskId] }), 400);
    await expectFleetError(service.updateTask(owner, tenantId, ids.spec, { dependsOn: [ids.spec] }), 400);

    const snapshot = await service.loadWorkspace(member, tenantId);
    expect(snapshot.tasks.map((task) => task.title).sort()).toEqual(["Build feature", "Expense report", "Review", "Write spec"]);
    expect(snapshot.tasks.find((task) => task.id === ids.build)).toMatchObject({ dependsOn: [ids.spec], projectId, status: "todo" });
    expect(snapshot.projects).toEqual([expect.objectContaining({ id: projectId, name: "Launch" })]);
  });

  it("sets team capacity for admins and plans assigned work in that person's lane", async () => {
    await service.setMemberCapacity(owner, tenantId, member.uid, { capacityMinutesPerDay: 240 });
    await expectFleetError(service.setMemberCapacity(member, tenantId, member.uid, { capacityMinutesPerDay: 60 }), 403);
    await expectFleetError(service.setMemberCapacity(owner, tenantId, outsider.uid, { capacityMinutesPerDay: 60 }), 404);
    const { members } = await service.listMembers(viewer, tenantId);
    expect(members.find((person) => person.uid === member.uid)?.capacityMinutesPerDay).toBe(240);
    expect(members.map((person) => person.role).sort()).toEqual(["member", "owner", "viewer"]);
  });

  it("runs the scheduler into an immutable, versioned plan", async () => {
    await expectFleetError(service.runScheduler(viewer, tenantId, {}, NOW), 403);
    const first = await service.runScheduler(owner, tenantId, { note: "Monday plan" }, NOW);
    expect(first.plan.version).toBe(1);
    planIds.push(first.plan.id);

    const snapshot = await service.loadWorkspace(owner, tenantId);
    expect(snapshot.latestPlan).toMatchObject({ id: first.plan.id, version: 1, note: "Monday plan", now: NOW });
    expect(snapshot.history).toHaveLength(1);
    const blocks = snapshot.latestPlan!.result.blocks;
    const specEnd = Math.max(...blocks.filter((block) => block.taskId === ids.spec).map((block) => Date.parse(block.end)));
    const buildStart = Math.min(...blocks.filter((block) => block.taskId === ids.build).map((block) => Date.parse(block.start)));
    expect(buildStart).toBeGreaterThanOrEqual(specEnd);
    expect(blocks.filter((block) => block.taskId === ids.review).every((block) => block.lane === member.uid)).toBe(true);
    expect(snapshot.latestPlan!.result.outcomes.every((outcome) => outcome.status === "on_track")).toBe(true);

    // Same inputs → same fingerprint.
    const again = await service.previewSchedule(owner, tenantId, {}, NOW);
    expect(again.result.inputHash).toBe(first.result.inputHash);
  });

  it("marks done, reopens and pushes tasks with audit entries", async () => {
    await service.updateTask(member, tenantId, ids.errand, { status: "done" });
    let errand = (await service.loadWorkspace(owner, tenantId)).tasks.find((task) => task.id === ids.errand)!;
    expect(errand.status).toBe("done");
    expect(errand.completedAt).not.toBeNull();

    await service.updateTask(member, tenantId, ids.errand, { status: "todo" });
    errand = (await service.loadWorkspace(owner, tenantId)).tasks.find((task) => task.id === ids.errand)!;
    expect(errand).toMatchObject({ status: "todo", completedAt: null });

    await service.updateTask(owner, tenantId, ids.errand, { earliestStart: "2026-11-03T09:00:00.000Z" });
    await expectFleetError(service.updateTask(viewer, tenantId, ids.errand, { status: "done" }), 403);
    // Another tenant's task id cannot be reached through this workspace.
    await expectFleetError(service.updateTask(owner, tenantId, rivalTaskId, { status: "done" }), 404);
    await expectFleetError(service.deleteTask(owner, tenantId, rivalTaskId), 404);

    const actions = await auditActions();
    expect(actions).toEqual(expect.arrayContaining(["task.completed", "task.reopened", "task.updated"]));
  });

  it("keeps locked blocks exactly in place on re-run", async () => {
    const lockAt = "2026-11-03T14:00:00.000Z";
    await service.updateTask(owner, tenantId, ids.review, { lockedStart: lockAt });
    const second = await service.runScheduler(member, tenantId, { note: "after lock" }, NOW);
    expect(second.plan.version).toBe(2);
    planIds.push(second.plan.id);
    const reviewBlocks = second.result.blocks.filter((block) => block.taskId === ids.review);
    expect(reviewBlocks).toHaveLength(1);
    expect(reviewBlocks[0]).toMatchObject({ start: lockAt, end: "2026-11-03T15:00:00.000Z" });
    const errandBlock = second.result.blocks.find((block) => block.taskId === ids.errand)!;
    expect(Date.parse(errandBlock.start)).toBeGreaterThanOrEqual(Date.parse("2026-11-03T09:00:00.000Z"));
    // Nothing else lands on top of the lock in the same lane.
    for (const block of second.result.blocks.filter((entry) => entry.lane === member.uid && entry.taskId !== ids.review)) {
      expect(block.end <= lockAt || block.start >= "2026-11-03T15:00:00.000Z").toBe(true);
    }
  });

  it("previews a what-if without saving a plan or an audit event", async () => {
    const plansBefore = await planCount();
    const auditBefore = (await auditActions()).length;
    const preview = await service.previewSchedule(viewer, tenantId, {
      extraBusy: [{ title: "Offsite", start: "2026-11-02T09:00:00.000Z", end: "2026-11-02T17:00:00.000Z" }],
    }, NOW);
    expect(preview.basedOnVersion).toBe(2);
    expect(preview.diff.moved.length).toBeGreaterThan(0);
    expect(preview.result.blocks.some((block) => block.start < "2026-11-02T17:00:00.000Z" && block.lane !== member.uid)).toBe(false);
    expect(await planCount()).toBe(plansBefore);
    expect((await auditActions()).length).toBe(auditBefore);
  });

  it("restores an earlier plan version as a new version without rewriting history", async () => {
    const v1 = (await db.doc(`products/planner/tenants/${tenantId}/plans/${planIds[0]}`).get()).data()!;
    await expectFleetError(service.restorePlanVersion(viewer, tenantId, planIds[0]), 403);
    await expectFleetError(service.restorePlanVersion(owner, tenantId, "missing-plan"), 404);
    const restored = await service.restorePlanVersion(owner, tenantId, planIds[0]);
    expect(restored.plan.version).toBe(3);
    const snapshot = await service.loadWorkspace(owner, tenantId);
    expect(snapshot.latestPlan).toMatchObject({ version: 3, note: "Restored from v1", inputHash: v1.inputHash });
    expect(snapshot.latestPlan!.result.blocks).toEqual(v1.result.blocks);
    expect(snapshot.history.map((plan) => plan.version)).toEqual([3, 2, 1]);
    // v1 itself is untouched.
    const v1After = (await db.doc(`products/planner/tenants/${tenantId}/plans/${planIds[0]}`).get()).data()!;
    expect(v1After.version).toBe(1);
    expect(v1After.result).toEqual(v1.result);
  });

  it("adds and removes meetings as busy time", async () => {
    const { id } = await service.createEvent(owner, tenantId, { title: "Standup", start: "2026-11-02T09:00:00.000Z", end: "2026-11-02T09:30:00.000Z" });
    await expectFleetError(service.createEvent(viewer, tenantId, { title: "x", start: NOW, end: "2026-11-02T10:00:00.000Z" }), 403);
    const preview = await service.previewSchedule(owner, tenantId, {}, NOW);
    expect(preview.result.blocks.some((block) => block.lane !== member.uid && block.start < "2026-11-02T09:30:00.000Z")).toBe(false);
    expect((await service.loadWorkspace(owner, tenantId)).events).toEqual([expect.objectContaining({ id, title: "Standup" })]);
    const temp = await service.createEvent(owner, tenantId, { title: "Temp", start: "2026-11-05T09:00:00.000Z", end: "2026-11-05T10:00:00.000Z" });
    await service.deleteEvent(owner, tenantId, temp.id);
    await expectFleetError(service.deleteEvent(owner, tenantId, temp.id), 404);
  });

  it("isolates tenants", async () => {
    await expectFleetError(service.loadWorkspace(rival, tenantId), 404);
    await expectFleetError(service.loadWorkspace(owner, rivalTenantId), 404);
    await expectFleetError(service.exportWorkspace(rival, tenantId), 404);
    await expectFleetError(service.planIcs(rival, tenantId, planIds[0]), 404);
    await expectFleetError(service.planIcs(owner, rivalTenantId, planIds[0]), 404);
    const mine = await service.loadWorkspace(owner, tenantId);
    expect(mine.tasks.some((task) => task.id === rivalTaskId)).toBe(false);
    const theirs = await service.loadWorkspace(rival, rivalTenantId);
    expect(theirs.tasks.map((task) => task.title)).toEqual(["Rival secret"]);
    expect(theirs.latestPlan).toBeNull();
  });

  it("deletes a task and unlinks its dependents", async () => {
    const temp = await service.createTask(owner, tenantId, { title: "Temp prerequisite", durationMinutes: 15, priority: "low" });
    const dependent = await service.createTask(owner, tenantId, { title: "Temp dependent", durationMinutes: 15, priority: "low", dependsOn: [temp.id] });
    await service.deleteTask(owner, tenantId, temp.id);
    const after = (await service.loadWorkspace(owner, tenantId)).tasks.find((task) => task.id === dependent.id)!;
    expect(after.dependsOn).toEqual([]);
    await service.deleteTask(owner, tenantId, dependent.id);
    const project = await service.createProject(owner, tenantId, { name: "Temp project" });
    await service.deleteProject(owner, tenantId, project.id);
    await expectFleetError(service.deleteProject(owner, tenantId, project.id), 404);
  });

  it("repeats tasks per occurrence; completing one keeps the series", async () => {
    ids.standup = (await service.createTask(owner, tenantId, {
      title: "Standup notes", durationMinutes: 30, priority: "medium",
      recurrence: { freq: "weekdays", interval: 1, startDate: "2026-11-02", count: 10 },
      // Ignored for a series: occurrences are due on their own day and cannot wait on other work.
      deadline: "2026-11-30T17:00:00.000Z", dependsOn: [ids.spec],
    })).id;
    const stored = (await db.doc(`products/planner/tenants/${tenantId}/tasks/${ids.standup}`).get()).data()!;
    expect(stored).toMatchObject({ deadline: null, dependsOn: [], lockedStart: null, occurrences: {} });
    await expectFleetError(service.createTask(owner, tenantId, { title: "x", durationMinutes: 30, priority: "low", dependsOn: [ids.standup] }), 400);

    let preview = await service.previewSchedule(owner, tenantId, {}, NOW);
    let dates = preview.result.blocks.filter((block) => block.seriesId === ids.standup).map((block) => block.occurrenceDate);
    expect(dates).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);

    await service.setOccurrenceStatus(member, tenantId, ids.standup, { date: "2026-11-03", status: "done", actualMinutes: 20 });
    await expectFleetError(service.setOccurrenceStatus(viewer, tenantId, ids.standup, { date: "2026-11-04", status: "done" }), 403);
    await expectFleetError(service.setOccurrenceStatus(owner, tenantId, ids.standup, { date: "2026-11-07", status: "done" }), 400);
    await expectFleetError(service.setOccurrenceStatus(owner, tenantId, ids.errand, { date: "2026-11-03", status: "done" }), 400);
    await expectFleetError(service.setOccurrenceStatus(owner, rivalTenantId, ids.standup, { date: "2026-11-03", status: "done" }), 404);
    await expectFleetError(service.updateTask(owner, tenantId, ids.standup, { status: "done" }), 400);

    const series = (await service.loadWorkspace(owner, tenantId)).tasks.find((task) => task.id === ids.standup)!;
    expect(series.status).toBe("todo");
    expect(series.occurrences["2026-11-03"]).toMatchObject({ actualMinutes: 20 });
    expect(series.occurrences["2026-11-03"].completedAt).not.toBeNull();

    preview = await service.previewSchedule(owner, tenantId, {}, NOW);
    dates = preview.result.blocks.filter((block) => block.seriesId === ids.standup).map((block) => block.occurrenceDate);
    expect(dates).not.toContain("2026-11-03");
    expect(dates).toHaveLength(9);
    expect(preview.result.outcomes.find((outcome) => outcome.taskId === `${ids.standup}@2026-11-03`)?.status).toBe("done");

    // Reopen and complete again so the export below carries a completed occurrence.
    await service.setOccurrenceStatus(owner, tenantId, ids.standup, { date: "2026-11-03", status: "todo" });
    expect((await service.loadWorkspace(owner, tenantId)).tasks.find((task) => task.id === ids.standup)!.occurrences).toEqual({});
    await service.setOccurrenceStatus(owner, tenantId, ids.standup, { date: "2026-11-03", status: "done", actualMinutes: 25 });
  });

  it("exports ICS for any plan version", async () => {
    const { ics, version } = await service.planIcs(viewer, tenantId, planIds[1]);
    expect(version).toBe(2);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    const plan = (await db.doc(`products/planner/tenants/${tenantId}/plans/${planIds[1]}`).get()).data()!;
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(plan.result.blocks.length);
    expect(ics).toContain("SEQUENCE:2");
  });

  it("audits every mutation", async () => {
    const actions = await auditActions();
    for (const action of [
      "tenant.created", "settings.updated", "project.created", "project.deleted", "task.created", "task.bulk_created",
      "task.updated", "task.completed", "task.reopened", "task.deleted", "member.capacity_updated", "plan.generated",
      "event.created", "event.deleted", "task.occurrence_completed", "task.occurrence_reopened",
    ]) {
      expect(actions, action).toContain(action);
    }
    expect(actions.filter((action) => action === "plan.generated")).toHaveLength(3);
  });

  it("exports every record, for viewers too", async () => {
    const payload = await service.exportWorkspace(viewer, tenantId);
    const { data, manifest } = payload as { data: Record<string, Array<Record<string, unknown>>>; manifest: { files: Array<{ path: string; records: number }> } };
    const count = async (name: string) => (await db.collection(`products/planner/tenants/${tenantId}/${name}`).get()).size;
    for (const name of service.EXPORT_COLLECTIONS) {
      expect(data[name], name).toHaveLength(await count(name));
      expect(manifest.files.find((file) => file.path === `${name}.json`)?.records).toBe(await count(name));
    }
    expect(data.tasks.map((task) => task.id).sort()).toEqual(Object.values(ids).sort());
    expect(data.plans).toHaveLength(3);
    expect(data.members).toHaveLength(3);
    expect(data.auditEvents.length).toBeGreaterThanOrEqual((await auditActions()).length - 1);
    expect(JSON.stringify(data)).not.toContain("Rival secret");
    const standup = data.tasks.find((task) => task.id === ids.standup)!;
    expect(standup.recurrence).toMatchObject({ freq: "weekdays", count: 10 });
    expect((standup.occurrences as Record<string, { actualMinutes: number }>)["2026-11-03"].actualMinutes).toBe(25);
    expect(await auditActions()).toContain("workspace.exported");
  });
});
