import { deletePhoto, putPhoto } from "@/lib/fleet/platform/account-routes";
import { assertSameOrigin, fleetApiError } from "@/lib/fleet/platform/http";
import { performanceAccountContext } from "@/lib/lattice/account";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    return await putPhoto(await performanceAccountContext(), request);
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    return await deletePhoto(await performanceAccountContext());
  } catch (error) {
    return fleetApiError(error);
  }
}
