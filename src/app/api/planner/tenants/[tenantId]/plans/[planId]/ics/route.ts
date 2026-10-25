import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";
import { plannerContext, readPlan } from "@/lib/planner/data";
import { buildIcs } from "@/lib/planner/ics";

type RouteContext = { params: Promise<{ tenantId: string; planId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, planId } = await params;
    const ctx = await plannerContext(tenantId);
    const plan = await readPlan(tenantId, planId);
    if (!plan) throw new FleetError("Plan not found.", 404);
    const ics = buildIcs({
      calendarName: `${ctx.tenantName || "Planner"} plan v${plan.version}`,
      planId: plan.id,
      planVersion: plan.version,
      generatedAt: plan.createdAt ?? plan.now,
      blocks: plan.result.blocks.map((block) => ({
        id: block.id,
        title: block.title,
        start: block.start,
        end: block.end,
        description: block.reasons.join("\n"),
      })),
    });
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="planner-plan-v${plan.version}.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
