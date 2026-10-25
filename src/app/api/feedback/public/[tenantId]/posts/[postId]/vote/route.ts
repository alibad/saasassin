import { PRODUCT, toggleVoteForUser } from "@/lib/feedback/data";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string; postId: string }> };

/** Toggles the caller's single vote (deterministic vote id, transactional count). */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, postId } = await params;
    const user = await requireFleetUser(PRODUCT);
    return Response.json(await toggleVoteForUser(tenantId, postId, user));
  } catch (error) {
    return fleetApiError(error);
  }
}
