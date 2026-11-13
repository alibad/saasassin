import { fleetAccountContext, getMe, patchMe } from "@/lib/fleet/platform/account-routes";
import { assertSameOrigin, fleetApiError } from "@/lib/fleet/platform/http";

type RouteContext = { params: Promise<{ product: string }> };

/** The signed-in person's profile, workspaces and pending invitations for this product. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { product } = await params;
    return await getMe(await fleetAccountContext(product));
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Updates name, title, or which photo to show ("provider" or "none"; uploads use /me/photo). */
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { product } = await params;
    return await patchMe(await fleetAccountContext(product), request);
  } catch (error) {
    return fleetApiError(error);
  }
}
