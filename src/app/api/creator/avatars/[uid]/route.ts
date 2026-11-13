import { CREATOR_SLUG } from "@/lib/creator/model";
import { canSeeCreatorPhoto } from "@/lib/creator/people";
import { getAvatar } from "@/lib/fleet/platform/account-routes";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { fleetSessionCookie, requireFleetUser } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ uid: string }> };

/**
 * An uploaded profile photo inside Creator. Unlike the shared avatar route, it also lets a school
 * see its learners, learners see their instructors, and classmates see each other
 * (see canSeeCreatorPhoto). Everyone else gets a 404.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { uid } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    return await getAvatar(
      { product: CREATOR_SLUG, user, workspaces: true, canViewAvatar: canSeeCreatorPhoto, sessionCookie: fleetSessionCookie(CREATOR_SLUG) },
      uid,
    );
  } catch (error) {
    return fleetApiError(error);
  }
}
