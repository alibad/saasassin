import { acceptSchema } from "@/lib/fleet/account/schemas";
import { assertSameOrigin, fleetApiError, readJson } from "@/lib/fleet/platform/http";
import { assertFleetProduct, requireFleetUser } from "@/lib/fleet/platform/session";
import { acceptInvitationByToken, acceptInvitationForEmail } from "@/lib/fleet/platform/team";

type RouteContext = { params: Promise<{ product: string }> };

/**
 * Accepts an invitation, either with the link token or (from the workspace switcher) by its
 * id when it is addressed to the signed-in person's verified email.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { product } = await params;
    assertFleetProduct(product);
    const user = await requireFleetUser(product);
    const input = acceptSchema.parse(await readJson(request));
    const accepted = "token" in input
      ? await acceptInvitationByToken(product, user, input.token)
      : await acceptInvitationForEmail(product, user, input.tenantId, input.invitationId);
    return Response.json({ accepted });
  } catch (error) {
    return fleetApiError(error);
  }
}
