import { fleetApiError } from "@/lib/fleet/platform/http";
import { acknowledgeAssignment, requireRevenueTenant } from "@/lib/revenue/data";

type Context = { params: Promise<{ tenantId: string; assignmentId: string }> };

/** The assigned rep acknowledges a coaching assignment (server checks the assignee). */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { tenantId, assignmentId } = await params;
    const ctx = await requireRevenueTenant(tenantId);
    return Response.json({ assignment: await acknowledgeAssignment(ctx, assignmentId) });
  } catch (error) {
    return fleetApiError(error);
  }
}
