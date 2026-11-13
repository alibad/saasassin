import { assertSameOrigin, fleetApiError } from "@/lib/fleet/platform/http";
import { assertFleetProduct, requireFleetUser } from "@/lib/fleet/platform/session";
import { revokeInvitation } from "@/lib/fleet/platform/team";

type RouteContext = { params: Promise<{ product: string; tenantId: string; invitationId: string }> };

/** Revokes a pending invitation; its link stops working immediately. */
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { product, tenantId, invitationId } = await params;
    assertFleetProduct(product);
    const user = await requireFleetUser(product);
    await revokeInvitation(product, tenantId, user, invitationId);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
