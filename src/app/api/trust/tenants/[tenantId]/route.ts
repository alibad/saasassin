import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { getTrustSnapshot, runTrustAction, TRUST } from "@/lib/trust/data";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireFleetUser(TRUST);
    const { tenantId } = await params;
    return Response.json(await getTrustSnapshot(tenantId, user));
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireFleetUser(TRUST);
    const { tenantId } = await params;
    return Response.json(await runTrustAction(tenantId, user, await request.json()));
  } catch (error) {
    return fleetApiError(error);
  }
}
