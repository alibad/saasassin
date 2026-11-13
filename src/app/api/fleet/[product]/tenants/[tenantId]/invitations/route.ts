import { invitationCreateSchema } from "@/lib/fleet/account/schemas";
import { inviteUrlBuilder } from "@/lib/fleet/platform/account";
import { assertSameOrigin, fleetApiError, readJson } from "@/lib/fleet/platform/http";
import { assertFleetProduct, requireFleetUser } from "@/lib/fleet/platform/session";
import { createInvitation } from "@/lib/fleet/platform/team";

type RouteContext = { params: Promise<{ product: string; tenantId: string }> };

/**
 * Invites someone by email, whether or not they have an account yet. Returns the one-time
 * link; no email is sent, so the inviter shares it themselves.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { product, tenantId } = await params;
    assertFleetProduct(product);
    const user = await requireFleetUser(product);
    const input = invitationCreateSchema.parse(await readJson(request));
    const created = await createInvitation(product, tenantId, user, input, inviteUrlBuilder(request, product));
    return Response.json(created, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
