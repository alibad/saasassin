import { fleetApiError } from "@/lib/fleet/platform/http";
import { computeSchedule, plannerContext, readPlanHistory, savePlanVersion } from "@/lib/planner/data";
import { EDITOR_ROLES, planRequestSchema } from "@/lib/planner/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    await plannerContext(tenantId);
    return Response.json({ history: await readPlanHistory(tenantId) });
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Runs the scheduler against stored tasks and meetings and saves a new plan version. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const ctx = await plannerContext(tenantId, EDITOR_ROLES);
    const body = planRequestSchema.parse(await request.json().catch(() => ({})));
    const now = new Date().toISOString();
    const { result } = await computeSchedule(tenantId, now);
    const saved = await savePlanVersion(ctx, now, result, body.note);
    return Response.json({ plan: saved, result }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
