import { circleImportSchema } from "@/lib/community/circle";
import { runCircleImport } from "@/lib/community/data";
import { COMMUNITY_SLUG } from "@/lib/community/model";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Preview (commit: false) or run a Circle members/posts CSV import. Owners and admins only; members become pending invites. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(COMMUNITY_SLUG);
    const input = circleImportSchema.parse(await request.json());
    return Response.json(await runCircleImport(tenantId, user, input));
  } catch (error) {
    return fleetApiError(error);
  }
}
