import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { PLANNER_SLUG } from "@/lib/planner/model";
import { deleteEvent } from "@/lib/planner/service";

type RouteContext = { params: Promise<{ tenantId: string; eventId: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, eventId } = await params;
    const user = await requireFleetUser(PLANNER_SLUG);
    return Response.json(await deleteEvent(user, tenantId, eventId));
  } catch (error) {
    return fleetApiError(error);
  }
}
