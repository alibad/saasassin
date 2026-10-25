import { upsertProfile } from "@/lib/feedback/data";
import { ADMIN_ROLES, requireTeam } from "@/lib/feedback/http";
import { profileSchema } from "@/lib/feedback/schemas";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string; uid: string }> };

/** Sets the company/segment the team associates with a voter in this workspace. */
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, uid } = await params;
    if (!/^[A-Za-z0-9_:.-]{1,128}$/.test(uid)) throw new FleetError("Invalid voter.", 400);
    const { user } = await requireTeam(tenantId, ADMIN_ROLES);
    const input = profileSchema.parse(await request.json());
    return Response.json(await upsertProfile(tenantId, user, uid, input));
  } catch (error) {
    return fleetApiError(error);
  }
}
