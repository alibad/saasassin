import { assertSameOrigin, fleetApiError } from "@/lib/fleet/platform/http";
import { assertFleetProduct, requireFleetUser } from "@/lib/fleet/platform/session";
import { leaveTenant } from "@/lib/fleet/platform/team";

type RouteContext = { params: Promise<{ product: string; tenantId: string }> };

/** Leaves the workspace. The last owner has to transfer ownership first. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { product, tenantId } = await params;
    assertFleetProduct(product);
    const user = await requireFleetUser(product);
    await leaveTenant(product, tenantId, user);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
