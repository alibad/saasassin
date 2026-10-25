import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { CREATOR_SLUG, quizSubmissionSchema } from "@/lib/creator/model";
import { submitQuiz } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string; courseSlug: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, courseSlug } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    const { lessonId, answers } = quizSubmissionSchema.parse(await request.json());
    return Response.json({ score: await submitQuiz(tenantId, courseSlug, user, lessonId, answers) });
  } catch (error) {
    return fleetApiError(error);
  }
}
