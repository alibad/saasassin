import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";
import { plannerContext, readPlan, savePlanVersion } from "@/lib/planner/data";
import { EDITOR_ROLES } from "@/lib/planner/model";

type RouteContext = { params: Promise<{ tenantId: string; planId: string }> };

/** Undo a replan: re-issues an earlier plan as a new version. History is never rewritten. */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, planId } = await params;
    const ctx = await plannerContext(tenantId, EDITOR_ROLES);
    const plan = await readPlan(tenantId, planId);
    if (!plan) throw new FleetError("Plan not found.", 404);
    const saved = await savePlanVersion(ctx, plan.now, plan.result, `Restored from v${plan.version}`);
    return Response.json({ plan: saved }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
