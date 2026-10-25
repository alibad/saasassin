import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { requireTenantMember } from "@/lib/fleet/platform/tenants";
import { CREATOR_SLUG, transitionSchema } from "@/lib/creator/model";
import { EDITOR_ROLES, PUBLISHER_ROLES } from "@/lib/creator/roles";
import { transitionCourse } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string; courseId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, courseId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    const { to } = transitionSchema.parse(await request.json());
    // Publishing, unpublishing and archiving change what the public sees.
    await requireTenantMember(CREATOR_SLUG, tenantId, user, to === "published" || to === "archived" ? PUBLISHER_ROLES : EDITOR_ROLES);
    return Response.json({ course: await transitionCourse(tenantId, user, courseId, to) });
  } catch (error) {
    return fleetApiError(error);
  }
}
