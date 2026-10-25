import { fleetApiError } from "@/lib/fleet/platform/http";
import { computeSchedule, plannerContext, readLatestPlan } from "@/lib/planner/data";
import { planRequestSchema } from "@/lib/planner/model";
import { diffSchedules } from "@/lib/planner/scheduler";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** What-if: computes a schedule (optionally with hypothetical busy time) without saving anything. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    await plannerContext(tenantId);
    const body = planRequestSchema.parse(await request.json().catch(() => ({})));
    const now = new Date().toISOString();
    const [{ result }, latest] = await Promise.all([computeSchedule(tenantId, now, body.extraBusy), readLatestPlan(tenantId)]);
    return Response.json({ result, diff: diffSchedules(latest?.result ?? null, result), basedOnVersion: latest?.version ?? null });
  } catch (error) {
    return fleetApiError(error);
  }
}
