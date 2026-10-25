import { fleetApiError } from "@/lib/fleet/platform/http";
import { deleteCall, getCallDetail, requireRevenueTenant } from "@/lib/revenue/data";
import { ADMIN_ROLES, deleteCallSchema } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string; callId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { tenantId, callId } = await params;
    const ctx = await requireRevenueTenant(tenantId);
    return Response.json(await getCallDetail(ctx, callId));
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Owners/admins permanently delete a call, its transcript, comments and scorecards. */
export async function DELETE(request: Request, { params }: Context) {
  try {
    const { tenantId, callId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    const { reason } = deleteCallSchema.parse(await request.json());
    await deleteCall(ctx, callId, reason);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
