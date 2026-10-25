import { fleetApiError } from "@/lib/fleet/platform/http";
import { getCallDetail, requireRevenueTenant } from "@/lib/revenue/data";

type Context = { params: Promise<{ tenantId: string; callId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { tenantId, callId } = await params;
    const ctx = await requireRevenueTenant(tenantId);
    return Response.json(await getCallDetail(ctx, callId));
  } catch (error) {
    return fleetApiError(error);
  }
}
