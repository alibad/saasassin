import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { requireTenantMember } from "@/lib/fleet/platform/tenants";
import { CREATOR_SLUG } from "@/lib/creator/model";
import { EDITOR_ROLES } from "@/lib/creator/roles";
import { duplicateCourse } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string; courseId: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, courseId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    await requireTenantMember(CREATOR_SLUG, tenantId, user, EDITOR_ROLES);
    return Response.json({ course: await duplicateCourse(tenantId, user, courseId) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
