import { inviteUrlBuilder } from "@/lib/fleet/platform/account";
import { assertSameOrigin, fleetApiError } from "@/lib/fleet/platform/http";
import { assertFleetProduct, requireFleetUser } from "@/lib/fleet/platform/session";
import { resendInvitation } from "@/lib/fleet/platform/team";

type RouteContext = { params: Promise<{ product: string; tenantId: string; invitationId: string }> };

/** Issues a fresh link (the old one stops working) and restarts the 14-day expiry. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { product, tenantId, invitationId } = await params;
    assertFleetProduct(product);
    const user = await requireFleetUser(product);
    return Response.json(await resendInvitation(product, tenantId, user, invitationId, inviteUrlBuilder(request, product)));
  } catch (error) {
    return fleetApiError(error);
  }
}
