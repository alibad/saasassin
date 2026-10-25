import { getEventCalendar } from "@/lib/community/data";
import { COMMUNITY_SLUG } from "@/lib/community/model";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string; postId: string }> };

/** Add-to-calendar (.ics) for an event the member can see. Read-only, so no audit event. */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, postId } = await params;
    const user = await requireFleetUser(COMMUNITY_SLUG);
    const appUrl = `${new URL(request.url).origin}/apps/community?c=${encodeURIComponent(tenantId)}`;
    const ics = await getEventCalendar(tenantId, postId, user, appUrl);
    return new Response(ics, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="event-${postId}.ics"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
