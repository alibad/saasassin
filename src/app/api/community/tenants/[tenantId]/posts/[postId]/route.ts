import { getPostThread } from "@/lib/community/data";
import { COMMUNITY_SLUG } from "@/lib/community/model";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string; postId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, postId } = await params;
    const user = await requireFleetUser(COMMUNITY_SLUG);
    return Response.json(await getPostThread(tenantId, postId, user));
  } catch (error) {
    return fleetApiError(error);
  }
}
