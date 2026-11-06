import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireRevenueTenant } from "@/lib/revenue/data";
import { ADMIN_ROLES } from "@/lib/revenue/schemas";
import { sendTestWebhook } from "@/lib/revenue/webhook-data";

type Context = { params: Promise<{ tenantId: string; webhookId: string }> };

/** Sends a signed test event and returns the logged delivery, including honest failures. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { tenantId, webhookId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    return Response.json({ delivery: await sendTestWebhook(ctx, webhookId) });
  } catch (error) {
    return fleetApiError(error);
  }
}
