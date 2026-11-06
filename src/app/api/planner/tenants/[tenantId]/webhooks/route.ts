import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { PLANNER_SLUG } from "@/lib/planner/model";
import { createWebhook, listWebhooks } from "@/lib/planner/webhook-delivery";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(PLANNER_SLUG);
    return Response.json(await listWebhooks(user, tenantId));
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(PLANNER_SLUG);
    return Response.json(await createWebhook(user, tenantId, await request.json().catch(() => ({}))), { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
