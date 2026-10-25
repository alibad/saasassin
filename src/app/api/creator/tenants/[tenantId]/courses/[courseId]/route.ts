import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { requireTenantMember } from "@/lib/fleet/platform/tenants";
import { CREATOR_SLUG, courseInputSchema } from "@/lib/creator/model";
import { EDITOR_ROLES } from "@/lib/creator/roles";
import { getCourse, updateCourse } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string; courseId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, courseId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    await requireTenantMember(CREATOR_SLUG, tenantId, user);
    return Response.json({ course: await getCourse(tenantId, courseId) });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, courseId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    await requireTenantMember(CREATOR_SLUG, tenantId, user, EDITOR_ROLES);
    const input = courseInputSchema.parse(await request.json());
    return Response.json({ course: await updateCourse(tenantId, user, courseId, input) });
  } catch (error) {
    return fleetApiError(error);
  }
}
