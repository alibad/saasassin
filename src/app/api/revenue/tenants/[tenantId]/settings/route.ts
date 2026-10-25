import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireRevenueTenant, updateSettings } from "@/lib/revenue/data";
import { ADMIN_ROLES, settingsSchema } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string }> };

export async function PUT(request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    await updateSettings(ctx, settingsSchema.parse(await request.json()));
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
