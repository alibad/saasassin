import { fleetAccountContext, signOutEverywhere } from "@/lib/fleet/platform/account-routes";
import { assertSameOrigin, fleetApiError } from "@/lib/fleet/platform/http";

type RouteContext = { params: Promise<{ product: string }> };

/** "Sign out everywhere": revokes every session on every device and clears this one. */
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { product } = await params;
    return await signOutEverywhere(await fleetAccountContext(product));
  } catch (error) {
    return fleetApiError(error);
  }
}
