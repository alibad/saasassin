import { fleetApiError } from "@/lib/fleet/platform/http";
import { plannerContext, readSnapshot } from "@/lib/planner/data";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const ctx = await plannerContext(tenantId);
    return Response.json(await readSnapshot(ctx));
  } catch (error) {
    return fleetApiError(error);
  }
}
