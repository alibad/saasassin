import { getAuditLog } from "@/lib/community/data";
import { COMMUNITY_SLUG } from "@/lib/community/model";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(COMMUNITY_SLUG);
    return Response.json({ events: await getAuditLog(tenantId, user) });
  } catch (error) {
    return fleetApiError(error);
  }
}
