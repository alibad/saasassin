import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { listAuditEvents, requireTenantMember } from "@/lib/fleet/platform/tenants";
import { SLUG } from "@/lib/studies/data";

export async function GET(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId } = await context.params;
    await requireTenantMember(SLUG, tenantId, user);
    return Response.json({ events: await listAuditEvents(SLUG, tenantId, 100) });
  } catch (error) {
    return fleetApiError(error);
  }
}
