import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireRevenueTenant } from "@/lib/revenue/data";
import { getDealTimeline } from "@/lib/revenue/pipeline-data";

type Context = { params: Promise<{ tenantId: string; dealId: string }> };

/** Unified deal timeline (stages, calls, comments, next steps) with time-in-stage stats. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { tenantId, dealId } = await params;
    const ctx = await requireRevenueTenant(tenantId);
    return Response.json(await getDealTimeline(ctx, dealId));
  } catch (error) {
    return fleetApiError(error);
  }
}
