import { buildCommunityExport } from "@/lib/community/data";
import { COMMUNITY_SLUG } from "@/lib/community/model";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Complete, versioned community export: members, profiles, spaces, content, reactions, RSVPs, access and audit trail. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(COMMUNITY_SLUG);
    const body = await buildCommunityExport(tenantId, user);
    const fileName = `community-${tenantId}-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
