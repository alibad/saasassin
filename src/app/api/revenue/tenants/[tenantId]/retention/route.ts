import { fleetApiError } from "@/lib/fleet/platform/http";
import { applyRetention, previewRetention, requireRevenueTenant } from "@/lib/revenue/data";
import { ADMIN_ROLES } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string }> };

/** Lists the calls the workspace retention period would delete. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    return Response.json(await previewRetention(ctx));
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Deletes every call past the retention period (same rule as the preview) and audits it. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    return Response.json(await applyRetention(ctx));
  } catch (error) {
    return fleetApiError(error);
  }
}
