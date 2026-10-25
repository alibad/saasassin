import { FieldValue } from "firebase-admin/firestore";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";
import { audit, col, plannerContext } from "@/lib/planner/data";
import { EDITOR_ROLES, taskPatchSchema } from "@/lib/planner/model";

type RouteContext = { params: Promise<{ tenantId: string; taskId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, taskId } = await params;
    const ctx = await plannerContext(tenantId, EDITOR_ROLES);
    const patch = taskPatchSchema.parse(await request.json());
    if (patch.dependsOn?.includes(taskId)) throw new FleetError("A task cannot depend on itself.", 400);
    const ref = col(tenantId, "tasks").doc(taskId);
    const doc = await ref.get();
    if (!doc.exists) throw new FleetError("Task not found.", 404);
    const update: Record<string, unknown> = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    if (patch.status === "done" && doc.get("status") !== "done") update.completedAt = FieldValue.serverTimestamp();
    if (patch.status === "todo") update.completedAt = null;
    update.updatedAt = FieldValue.serverTimestamp();
    await ref.update(update);
    const action = patch.status === "done" ? "task.completed" : patch.status === "todo" ? "task.reopened" : "task.updated";
    await audit(ctx, action, { type: "task", id: taskId }, { fields: Object.keys(patch) });
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, taskId } = await params;
    const ctx = await plannerContext(tenantId, EDITOR_ROLES);
    const ref = col(tenantId, "tasks").doc(taskId);
    const doc = await ref.get();
    if (!doc.exists) throw new FleetError("Task not found.", 404);
    const dependents = await col(tenantId, "tasks").where("dependsOn", "array-contains", taskId).get();
    const batch = ref.firestore.batch();
    dependents.docs.forEach((dependent) => batch.update(dependent.ref, { dependsOn: FieldValue.arrayRemove(taskId) }));
    batch.delete(ref);
    await batch.commit();
    await audit(ctx, "task.deleted", { type: "task", id: taskId }, { title: doc.get("title"), unlinkedDependents: dependents.size });
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
