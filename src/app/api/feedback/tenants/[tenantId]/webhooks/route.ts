import { z } from "zod";

import { createWebhook, listWebhooks } from "@/lib/feedback/data";
import { ADMIN_ROLES, requireTeam } from "@/lib/feedback/http";
import { WEBHOOK_EVENTS } from "@/lib/feedback/webhooks";
import { fleetApiError } from "@/lib/fleet/platform/http";

type RouteContext = { params: Promise<{ tenantId: string }> };

const createSchema = z.object({
  url: z.string().trim().max(2000),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Choose at least one event."),
});

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    await requireTeam(tenantId, ADMIN_ROLES);
    return Response.json(await listWebhooks(tenantId));
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const { user } = await requireTeam(tenantId, ADMIN_ROLES);
    const input = createSchema.parse(await request.json());
    return Response.json({ webhook: await createWebhook(tenantId, user, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
