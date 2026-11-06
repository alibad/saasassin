import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { PLANNER_SLUG } from "@/lib/planner/model";
import { deleteTask, updateTask } from "@/lib/planner/service";

type RouteContext = { params: Promise<{ tenantId: string; taskId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, taskId } = await params;
    const user = await requireFleetUser(PLANNER_SLUG);
    return Response.json(await updateTask(user, tenantId, taskId, await request.json().catch(() => ({}))));
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, taskId } = await params;
    const user = await requireFleetUser(PLANNER_SLUG);
    return Response.json(await deleteTask(user, tenantId, taskId));
  } catch (error) {
    return fleetApiError(error);
  }
}
