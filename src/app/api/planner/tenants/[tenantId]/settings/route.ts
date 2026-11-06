import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { PLANNER_SLUG } from "@/lib/planner/model";
import { saveSettings } from "@/lib/planner/service";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(PLANNER_SLUG);
    return Response.json(await saveSettings(user, tenantId, await request.json().catch(() => ({}))));
  } catch (error) {
    return fleetApiError(error);
  }
}
