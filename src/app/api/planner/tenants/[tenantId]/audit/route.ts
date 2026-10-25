import { fleetApiError } from "@/lib/fleet/platform/http";
import { listAuditEvents } from "@/lib/fleet/platform/tenants";
import { plannerContext } from "@/lib/planner/data";
import { PLANNER_SLUG } from "@/lib/planner/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    await plannerContext(tenantId);
    return Response.json({ events: await listAuditEvents(PLANNER_SLUG, tenantId, 100) });
  } catch (error) {
    return fleetApiError(error);
  }
}
