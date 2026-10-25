import { runAction } from "@/lib/community/data";
import { actionSchema, COMMUNITY_SLUG } from "@/lib/community/model";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Every community mutation: session → tenant membership + role (inside runAction) → zod → write → audit. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(COMMUNITY_SLUG);
    const action = actionSchema.parse(await request.json());
    return Response.json({ result: await runAction(tenantId, user, action) });
  } catch (error) {
    return fleetApiError(error);
  }
}
