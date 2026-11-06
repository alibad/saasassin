import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { PLANNER_SLUG } from "@/lib/planner/model";
import { deleteProject } from "@/lib/planner/service";

type RouteContext = { params: Promise<{ tenantId: string; projectId: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, projectId } = await params;
    const user = await requireFleetUser(PLANNER_SLUG);
    return Response.json(await deleteProject(user, tenantId, projectId));
  } catch (error) {
    return fleetApiError(error);
  }
}
