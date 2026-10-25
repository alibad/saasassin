import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { requireTenantMember } from "@/lib/fleet/platform/tenants";
import { CREATOR_SLUG, createCourseSchema } from "@/lib/creator/model";
import { EDITOR_ROLES } from "@/lib/creator/roles";
import { createCourse, listCourses } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    const { role } = await requireTenantMember(CREATOR_SLUG, tenantId, user);
    return Response.json({ courses: await listCourses(tenantId), role });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    await requireTenantMember(CREATOR_SLUG, tenantId, user, EDITOR_ROLES);
    const { title } = createCourseSchema.parse(await request.json());
    return Response.json({ course: await createCourse(tenantId, user, title) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
