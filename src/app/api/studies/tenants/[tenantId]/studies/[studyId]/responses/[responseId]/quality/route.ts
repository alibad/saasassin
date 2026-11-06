import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { setResponseExclusion, SLUG } from "@/lib/studies/data";

type Context = { params: Promise<{ tenantId: string; studyId: string; responseId: string }> };

/** Exclude a session from results (reason required) or mark it reviewed and kept. */
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, studyId, responseId } = await context.params;
    const response = await setResponseExclusion(user, tenantId, studyId, responseId, await request.json());
    return Response.json({ response: { id: response.id, quality: response.quality } });
  } catch (error) {
    return fleetApiError(error);
  }
}
