import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { listAuditEvents, requireTenantMember } from "@/lib/fleet/platform/tenants";
import { CREATOR_SLUG } from "@/lib/creator/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    await requireTenantMember(CREATOR_SLUG, tenantId, user);
    return Response.json({ events: await listAuditEvents(CREATOR_SLUG, tenantId, 100) });
  } catch (error) {
    return fleetApiError(error);
  }
}
