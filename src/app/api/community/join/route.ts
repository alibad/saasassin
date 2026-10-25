import { joinWithInvite } from "@/lib/community/data";
import { COMMUNITY_SLUG, joinSchema } from "@/lib/community/model";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";

/** A signed-in Community user redeems a shareable invite; the code is validated server-side only. */
export async function POST(request: Request) {
  try {
    const user = await requireFleetUser(COMMUNITY_SLUG);
    const { tenantId, inviteCode } = joinSchema.parse(await request.json());
    return Response.json(await joinWithInvite(tenantId, inviteCode, user));
  } catch (error) {
    return fleetApiError(error);
  }
}
