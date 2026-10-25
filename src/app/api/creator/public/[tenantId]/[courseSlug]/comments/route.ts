import { z } from "zod";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { CREATOR_SLUG, commentInputSchema } from "@/lib/creator/model";
import { addLessonComment, listLessonComments } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string; courseSlug: string }> };

const lessonQuery = z.string().min(1, "Choose a lesson.").max(40);

/** Enrolled learners only; hidden comments are never returned here. */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, courseSlug } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    const lessonId = lessonQuery.parse(new URL(request.url).searchParams.get("lessonId") ?? "");
    return Response.json({ comments: await listLessonComments(tenantId, courseSlug, user, lessonId) });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, courseSlug } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    const { lessonId, body } = commentInputSchema.parse(await request.json());
    return Response.json({ comment: await addLessonComment(tenantId, courseSlug, user, lessonId, body) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
