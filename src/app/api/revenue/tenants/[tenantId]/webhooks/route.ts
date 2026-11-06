import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireRevenueTenant } from "@/lib/revenue/data";
import { ADMIN_ROLES, webhookSchema } from "@/lib/revenue/schemas";
import { createWebhook, listWebhooks } from "@/lib/revenue/webhook-data";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    return Response.json(await listWebhooks(ctx));
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Creates a signed webhook; the signing secret is in this response only. */
export async function POST(request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    const input = webhookSchema.parse(await request.json());
    return Response.json(await createWebhook(ctx, input), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fleetApiError(error);
  }
}
