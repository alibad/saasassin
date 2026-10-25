import { fleetApiError } from "@/lib/fleet/platform/http";
import { addScorecard, requireRevenueTenant } from "@/lib/revenue/data";
import { COACH_ROLES, scorecardSchema } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string; callId: string }> };

/** Managers, admins and owners score calls against the workspace rubric. */
export async function POST(request: Request, { params }: Context) {
  try {
    const { tenantId, callId } = await params;
    const ctx = await requireRevenueTenant(tenantId, COACH_ROLES);
    const input = scorecardSchema.parse(await request.json());
    return Response.json({ scorecard: await addScorecard(ctx, callId, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
