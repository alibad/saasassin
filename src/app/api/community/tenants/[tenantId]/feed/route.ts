import { getFeedPage } from "@/lib/community/data";
import { COMMUNITY_SLUG, feedQuerySchema } from "@/lib/community/model";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Cursor-paginated feed (all spaces, one space, saved, or search), filtered server-side for the signed-in member. */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(COMMUNITY_SLUG);
    const query = feedQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(
      await getFeedPage(tenantId, user, { spaceId: query.space, cursor: query.cursor, limit: query.limit, filter: query.filter, q: query.q || undefined }),
    );
  } catch (error) {
    return fleetApiError(error);
  }
}
