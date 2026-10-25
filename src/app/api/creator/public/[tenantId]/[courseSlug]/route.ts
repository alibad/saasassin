import { fleetApiError } from "@/lib/fleet/platform/http";
import { getPublishedCourse, getSchoolName, publicOutline } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string; courseSlug: string }> };

/** Unauthenticated: returns only published courses, and only their outline. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, courseSlug } = await params;
    const [course, schoolName] = await Promise.all([getPublishedCourse(tenantId, courseSlug), getSchoolName(tenantId)]);
    return Response.json({ schoolName, course: publicOutline(course) });
  } catch (error) {
    return fleetApiError(error);
  }
}
