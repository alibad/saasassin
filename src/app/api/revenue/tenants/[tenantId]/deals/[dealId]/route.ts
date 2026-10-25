import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireRevenueTenant, updateDeal } from "@/lib/revenue/data";
import { WRITE_ROLES, dealUpdateSchema } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string; dealId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { tenantId, dealId } = await params;
    const ctx = await requireRevenueTenant(tenantId, WRITE_ROLES);
    const input = dealUpdateSchema.parse(await request.json());
    return Response.json({ deal: await updateDeal(ctx, dealId, input) });
  } catch (error) {
    return fleetApiError(error);
  }
}
