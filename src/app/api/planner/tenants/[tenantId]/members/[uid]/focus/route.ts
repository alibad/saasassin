import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { PLANNER_SLUG } from "@/lib/planner/model";
import { setMemberFocus } from "@/lib/planner/service";

type RouteContext = { params: Promise<{ tenantId: string; uid: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, uid } = await params;
    const user = await requireFleetUser(PLANNER_SLUG);
    return Response.json(await setMemberFocus(user, tenantId, uid, await request.json().catch(() => ({}))));
  } catch (error) {
    return fleetApiError(error);
  }
}
