import { fleetApiError } from "@/lib/fleet/platform/http";
import { listAuditEvents } from "@/lib/fleet/platform/tenants";
import { requireRevenueTenant } from "@/lib/revenue/data";
import { COACH_ROLES, REVENUE_SLUG } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string }> };

/** Owners, admins and managers can read the append-only audit log. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    await requireRevenueTenant(tenantId, COACH_ROLES);
    return Response.json({ events: await listAuditEvents(REVENUE_SLUG, tenantId, 200) });
  } catch (error) {
    return fleetApiError(error);
  }
}
