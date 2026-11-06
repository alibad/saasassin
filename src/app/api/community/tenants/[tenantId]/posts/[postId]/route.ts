import { getPostThread } from "@/lib/community/data";
import { COMMUNITY_SLUG, threadQuerySchema } from "@/lib/community/model";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string; postId: string }> };

/** A post and one page of its replies, oldest first; pass `cursor` to continue. */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, postId } = await params;
    const user = await requireFleetUser(COMMUNITY_SLUG);
    const query = threadQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await getPostThread(tenantId, postId, user, { cursor: query.cursor, limit: query.limit }));
  } catch (error) {
    return fleetApiError(error);
  }
}
