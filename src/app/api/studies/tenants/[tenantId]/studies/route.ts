import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { createStudy, listStudies, SLUG } from "@/lib/studies/data";
import { studyDraftSchema } from "@/lib/studies/model";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId } = await context.params;
    return Response.json(await listStudies(user, tenantId));
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId } = await context.params;
    const draft = studyDraftSchema.parse(await request.json());
    return Response.json({ study: await createStudy(user, tenantId, draft) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
