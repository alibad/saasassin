import { fleetAccountContext, getAvatar } from "@/lib/fleet/platform/account-routes";
import { fleetApiError } from "@/lib/fleet/platform/http";

type RouteContext = { params: Promise<{ product: string; uid: string }> };

/**
 * An uploaded profile photo, served only to the person themselves or someone who shares an
 * active workspace with them in this product. Everyone else gets a 404.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { product, uid } = await params;
    return await getAvatar(await fleetAccountContext(product), uid);
  } catch (error) {
    return fleetApiError(error);
  }
}
