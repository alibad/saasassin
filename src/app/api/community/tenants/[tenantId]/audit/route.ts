import { COMMUNITY_SLUG, MODERATOR_ROLES } from "@/lib/community/model";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { listAuditEvents, requireTenantMember } from "@/lib/fleet/platform/tenants";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(COMMUNITY_SLUG);
    await requireTenantMember(COMMUNITY_SLUG, tenantId, user, MODERATOR_ROLES);
    return Response.json({ events: await listAuditEvents(COMMUNITY_SLUG, tenantId, 100) });
  } catch (error) {
    return fleetApiError(error);
  }
}
