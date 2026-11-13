import { signOutEverywhere } from "@/lib/fleet/platform/account-routes";
import { assertSameOrigin, fleetApiError } from "@/lib/fleet/platform/http";
import { performanceAccountContext } from "@/lib/lattice/account";

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    return await signOutEverywhere(await performanceAccountContext());
  } catch (error) {
    return fleetApiError(error);
  }
}
