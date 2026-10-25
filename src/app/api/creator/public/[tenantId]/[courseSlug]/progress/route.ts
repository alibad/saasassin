import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { CREATOR_SLUG, progressSchema } from "@/lib/creator/model";
import { setLessonProgress } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string; courseSlug: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, courseSlug } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    const { lessonId, complete } = progressSchema.parse(await request.json());
    return Response.json(await setLessonProgress(tenantId, courseSlug, user, lessonId, complete));
  } catch (error) {
    return fleetApiError(error);
  }
}
