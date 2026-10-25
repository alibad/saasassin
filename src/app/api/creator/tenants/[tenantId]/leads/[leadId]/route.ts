import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { requireTenantMember } from "@/lib/fleet/platform/tenants";
import { CREATOR_SLUG } from "@/lib/creator/model";
import { PUBLISHER_ROLES } from "@/lib/creator/roles";
import { removeLead } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string; leadId: string }> };

/** Honors a removal / consent-withdrawal request; the audit event keeps the fact, not the address. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, leadId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    await requireTenantMember(CREATOR_SLUG, tenantId, user, PUBLISHER_ROLES);
    await removeLead(tenantId, user, leadId);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
