import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { createWebhook, listWebhooks, SLUG } from "@/lib/studies/data";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId } = await context.params;
    return Response.json(await listWebhooks(user, tenantId));
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Returns the signing secret once; later reads only show a hint. */
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId } = await context.params;
    return Response.json(await createWebhook(user, tenantId, await request.json()), { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
