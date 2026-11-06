import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireRevenueTenant } from "@/lib/revenue/data";
import { ADMIN_ROLES, webhookUpdateSchema } from "@/lib/revenue/schemas";
import { deleteWebhook, setWebhookActive } from "@/lib/revenue/webhook-data";

type Context = { params: Promise<{ tenantId: string; webhookId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { tenantId, webhookId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    const { active } = webhookUpdateSchema.parse(await request.json());
    await setWebhookActive(ctx, webhookId, active);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { tenantId, webhookId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    await deleteWebhook(ctx, webhookId);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
