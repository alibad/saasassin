import { loadPublicPost } from "@/lib/feedback/data";
import { fleetApiError } from "@/lib/fleet/platform/http";

type RouteContext = { params: Promise<{ tenantId: string; postId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, postId } = await params;
    return Response.json(await loadPublicPost(tenantId, postId));
  } catch (error) {
    return fleetApiError(error);
  }
}
