import { getMe, patchMe } from "@/lib/fleet/platform/account-routes";
import { assertSameOrigin, fleetApiError } from "@/lib/fleet/platform/http";
import { performanceAccountContext } from "@/lib/lattice/account";

// Performance signs in with its own session (saasassin_lattice_session); this static segment
// takes precedence over /api/fleet/[product]/me, which serves the other products.

export async function GET() {
  try {
    return await getMe(await performanceAccountContext());
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    return await patchMe(await performanceAccountContext(), request);
  } catch (error) {
    return fleetApiError(error);
  }
}
