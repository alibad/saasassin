import { getAvatar } from "@/lib/fleet/platform/account-routes";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { performanceAccountContext } from "@/lib/lattice/account";

type RouteContext = { params: Promise<{ uid: string }> };

/** Served to the person themselves or anyone who shares an active Performance organization with them. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { uid } = await params;
    return await getAvatar(await performanceAccountContext(), uid);
  } catch (error) {
    return fleetApiError(error);
  }
}
