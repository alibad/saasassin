import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { PLANNER_SLUG } from "@/lib/planner/model";
import { planIcs } from "@/lib/planner/service";

type RouteContext = { params: Promise<{ tenantId: string; planId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, planId } = await params;
    const user = await requireFleetUser(PLANNER_SLUG);
    const { ics, version } = await planIcs(user, tenantId, planId);
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="planner-plan-v${version}.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
