import { fleetApiError } from "@/lib/fleet/platform/http";
import { assertFleetProduct, requireFleetUser } from "@/lib/fleet/platform/session";
import { getTeam } from "@/lib/fleet/platform/team";

type RouteContext = { params: Promise<{ product: string; tenantId: string }> };

/** Members with their profiles; pending invitations are included for roles that manage the team. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { product, tenantId } = await params;
    assertFleetProduct(product);
    const user = await requireFleetUser(product);
    return Response.json(await getTeam(product, tenantId, user));
  } catch (error) {
    return fleetApiError(error);
  }
}
