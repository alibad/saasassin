import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";
import { audit, col, plannerContext } from "@/lib/planner/data";
import { EDITOR_ROLES } from "@/lib/planner/model";

type RouteContext = { params: Promise<{ tenantId: string; projectId: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, projectId } = await params;
    const ctx = await plannerContext(tenantId, EDITOR_ROLES);
    const ref = col(tenantId, "projects").doc(projectId);
    const doc = await ref.get();
    if (!doc.exists) throw new FleetError("Project not found.", 404);
    const tasks = await col(tenantId, "tasks").where("projectId", "==", projectId).get();
    const batch = ref.firestore.batch();
    tasks.docs.forEach((task) => batch.update(task.ref, { projectId: null }));
    batch.delete(ref);
    await batch.commit();
    await audit(ctx, "project.deleted", { type: "project", id: projectId }, { name: doc.get("name"), unlinkedTasks: tasks.size });
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
