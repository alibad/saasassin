import { fleetApiError } from "@/lib/fleet/platform/http";
import { PRIVILEGED_ROLES } from "@/lib/fleet/platform/tenants";
import { audit, col, plannerContext } from "@/lib/planner/data";
import { settingsSchema } from "@/lib/planner/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const ctx = await plannerContext(tenantId, PRIVILEGED_ROLES);
    const settings = settingsSchema.parse(await request.json());
    await col(tenantId, "settings").doc("workspace").set(settings);
    await audit(ctx, "settings.updated", { type: "settings", id: "workspace" }, settings);
    return Response.json({ settings });
  } catch (error) {
    return fleetApiError(error);
  }
}
