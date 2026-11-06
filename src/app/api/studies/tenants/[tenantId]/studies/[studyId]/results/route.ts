import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { buildResultsPayload, getStudyResults, SLUG } from "@/lib/studies/data";

export async function GET(request: Request, context: { params: Promise<{ tenantId: string; studyId: string }> }) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, studyId } = await context.params;
    const includeExcluded = new URL(request.url).searchParams.get("all") === "1";
    return Response.json(buildResultsPayload(await getStudyResults(user, tenantId, studyId), { includeExcluded }));
  } catch (error) {
    return fleetApiError(error);
  }
}
