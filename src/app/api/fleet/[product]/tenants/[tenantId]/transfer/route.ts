import { transferSchema } from "@/lib/fleet/account/schemas";
import { assertSameOrigin, fleetApiError, readJson } from "@/lib/fleet/platform/http";
import { assertFleetProduct, requireFleetUser } from "@/lib/fleet/platform/session";
import { transferOwnership } from "@/lib/fleet/platform/team";

type RouteContext = { params: Promise<{ product: string; tenantId: string }> };

/** The owner hands the workspace to another member and becomes an admin. Needs a recent sign-in. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { product, tenantId } = await params;
    assertFleetProduct(product);
    const user = await requireFleetUser(product);
    const { uid } = transferSchema.parse(await readJson(request));
    return Response.json(await transferOwnership(product, tenantId, user, uid));
  } catch (error) {
    return fleetApiError(error);
  }
}
