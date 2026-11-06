import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { PLANNER_SLUG } from "@/lib/planner/model";
import { restorePlanVersion } from "@/lib/planner/service";

type RouteContext = { params: Promise<{ tenantId: string; planId: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, planId } = await params;
    const user = await requireFleetUser(PLANNER_SLUG);
    return Response.json(await restorePlanVersion(user, tenantId, planId), { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
