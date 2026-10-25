import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { getStudy, SLUG, updateStudyDraft } from "@/lib/studies/data";
import { studyDraftSchema } from "@/lib/studies/model";

type Context = { params: Promise<{ tenantId: string; studyId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, studyId } = await context.params;
    return Response.json({ study: await getStudy(user, tenantId, studyId) });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, studyId } = await context.params;
    const draft = studyDraftSchema.parse(await request.json());
    return Response.json({ study: await updateStudyDraft(user, tenantId, studyId, draft) });
  } catch (error) {
    return fleetApiError(error);
  }
}
