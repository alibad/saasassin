import { fleetApiError } from "@/lib/fleet/platform/http";
import { loadWorkspace, requireRevenueTenant } from "@/lib/revenue/data";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId);
    return Response.json(await loadWorkspace(ctx));
  } catch (error) {
    return fleetApiError(error);
  }
}
