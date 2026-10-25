import { loadPublicPortal } from "@/lib/feedback/data";
import { fleetApiError } from "@/lib/fleet/platform/http";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Unauthenticated: public boards, roadmap (planned/started/completed) and changelog. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    return Response.json(await loadPublicPortal(tenantId));
  } catch (error) {
    return fleetApiError(error);
  }
}
