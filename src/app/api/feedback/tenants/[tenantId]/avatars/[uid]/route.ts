import { avatarResponse } from "@/lib/feedback/avatar-response";
import { readTeamAvatar } from "@/lib/feedback/data";
import { requireTeam } from "@/lib/feedback/http";
import { fleetApiError } from "@/lib/fleet/platform/http";

type RouteContext = { params: Promise<{ tenantId: string; uid: string }> };

/**
 * An uploaded profile photo for this workspace's team: a fellow member's, or that of someone
 * who voted, posted or commented here. Anyone else, or any other person, gets a 404.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, uid } = await params;
    const { user } = await requireTeam(tenantId);
    return avatarResponse(await readTeamAvatar(tenantId, user, uid), "private");
  } catch (error) {
    return fleetApiError(error);
  }
}
