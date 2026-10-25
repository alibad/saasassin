import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { requireTenantMember } from "@/lib/fleet/platform/tenants";
import { CREATOR_SLUG, enrollmentAccessSchema } from "@/lib/creator/model";
import { PUBLISHER_ROLES } from "@/lib/creator/roles";
import { setEnrollmentAccess } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string; enrollmentId: string }> };

/** Revoke or restore a learner's access; progress is kept and every change is audited. */
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, enrollmentId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    await requireTenantMember(CREATOR_SLUG, tenantId, user, PUBLISHER_ROLES);
    const { status } = enrollmentAccessSchema.parse(await request.json());
    return Response.json({ enrollment: await setEnrollmentAccess(tenantId, user, enrollmentId, status) });
  } catch (error) {
    return fleetApiError(error);
  }
}
