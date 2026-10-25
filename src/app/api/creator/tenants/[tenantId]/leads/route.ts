import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { requireTenantMember } from "@/lib/fleet/platform/tenants";
import { CREATOR_SLUG } from "@/lib/creator/model";
import { listLeads } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    await requireTenantMember(CREATOR_SLUG, tenantId, user);
    return Response.json({ leads: await listLeads(tenantId) });
  } catch (error) {
    return fleetApiError(error);
  }
}
