import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { PLANNER_SLUG } from "@/lib/planner/model";
import { deleteWebhook } from "@/lib/planner/webhook-delivery";

type RouteContext = { params: Promise<{ tenantId: string; webhookId: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, webhookId } = await params;
    const user = await requireFleetUser(PLANNER_SLUG);
    return Response.json(await deleteWebhook(user, tenantId, webhookId));
  } catch (error) {
    return fleetApiError(error);
  }
}
