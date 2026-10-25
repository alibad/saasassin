import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { CREATOR_SLUG } from "@/lib/creator/model";
import { enroll } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string; courseSlug: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, courseSlug } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    const result = await enroll(tenantId, courseSlug, user);
    return Response.json({ enrollment: result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return fleetApiError(error);
  }
}
