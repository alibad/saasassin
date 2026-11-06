import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { PLANNER_SLUG } from "@/lib/planner/model";
import { exportWorkspace } from "@/lib/planner/service";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Complete, versioned JSON export of every Planner record in the workspace. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(PLANNER_SLUG);
    const payload = await exportWorkspace(user, tenantId);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="planner-export-${tenantId}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
