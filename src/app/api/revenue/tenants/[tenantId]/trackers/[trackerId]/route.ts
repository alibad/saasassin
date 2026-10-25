import { fleetApiError } from "@/lib/fleet/platform/http";
import { deleteTracker, requireRevenueTenant, saveTracker } from "@/lib/revenue/data";
import { ADMIN_ROLES, trackerSchema } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string; trackerId: string }> };

export async function PUT(request: Request, { params }: Context) {
  try {
    const { tenantId, trackerId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    const input = trackerSchema.parse(await request.json());
    return Response.json(await saveTracker(ctx, trackerId, input));
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { tenantId, trackerId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    await deleteTracker(ctx, trackerId);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
