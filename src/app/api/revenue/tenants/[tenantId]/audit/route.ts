import { fleetApiError } from "@/lib/fleet/platform/http";
import { listAudit, requireRevenueTenant } from "@/lib/revenue/data";
import { COACH_ROLES } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string }> };

/** Owners, admins and managers can read the append-only audit log. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId, COACH_ROLES);
    return Response.json({ events: await listAudit(ctx) });
  } catch (error) {
    return fleetApiError(error);
  }
}
