import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { PLANNER_SLUG } from "@/lib/planner/model";
import { pushTask } from "@/lib/planner/service";

type RouteContext = { params: Promise<{ tenantId: string; taskId: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, taskId } = await params;
    const user = await requireFleetUser(PLANNER_SLUG);
    return Response.json(await pushTask(user, tenantId, taskId));
  } catch (error) {
    return fleetApiError(error);
  }
}
