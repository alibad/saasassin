import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { PLANNER_SLUG } from "@/lib/planner/model";
import { setOccurrenceStatus } from "@/lib/planner/service";

type RouteContext = { params: Promise<{ tenantId: string; taskId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, taskId } = await params;
    const user = await requireFleetUser(PLANNER_SLUG);
    return Response.json(await setOccurrenceStatus(user, tenantId, taskId, await request.json().catch(() => ({}))));
  } catch (error) {
    return fleetApiError(error);
  }
}
