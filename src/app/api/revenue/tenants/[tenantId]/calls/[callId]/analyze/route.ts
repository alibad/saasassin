import { fleetApiError } from "@/lib/fleet/platform/http";
import { reanalyzeCall, requireRevenueTenant } from "@/lib/revenue/data";
import { WRITE_ROLES } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string; callId: string }> };

/** Re-runs deterministic analysis with the workspace's current trackers. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { tenantId, callId } = await params;
    const ctx = await requireRevenueTenant(tenantId, WRITE_ROLES);
    return Response.json({ analysis: await reanalyzeCall(ctx, callId) });
  } catch (error) {
    return fleetApiError(error);
  }
}
